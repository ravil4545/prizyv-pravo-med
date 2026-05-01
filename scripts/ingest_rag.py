"""
RAG Knowledge Base Ingest Script — nepriziv.ru
==============================================
Loads 96 .md files from the Obsidian vault into Supabase (pgvector).

Requirements:
    pip install python-frontmatter requests

Usage:
    python scripts/ingest_rag.py

After editing files in Obsidian — run again. upsert() handles updates.
"""

import os
import re
import sys
import time
import json
from pathlib import Path

import frontmatter
import requests

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
SUPABASE_URL = "https://kqbetheonxiclwgyatnm.supabase.co"
SUPABASE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxYmV0aGVvbnhpY2x3Z3lhdG5tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTMyODE2MCwiZXhwIjoyMDc0OTA0MTYwfQ.TwLpeaau-t7X0CFlzDygKKDHM1SVM0BpMNOou22IogA",
)
JINA_KEY = os.getenv(
    "JINA_API_KEY",
    "jina_9c42829029124e179a38db1541b4d5bd8PNQua4z_uwMkyp-l8fhS71GsrRu",
)

RAG_BASE = Path(r"g:\Obsidian\Main\00_RAG_База")

FOUNDATIONAL: dict[str, str] = {
    "04_FAQ/Рамка_юридической_консультации.md":             "рамка_консультации",
    "01_Заболевания/00_Медицинские_тонкости.md":            "медицинские_тонкости",
    "02_Юридические_процедуры/00_Процедурные_тонкости.md":  "процедурные_тонкости",
    "03_Документооборот/Диагностический_анализ.md":         "диагностический_анализ",
    "03_Документооборот/Правила_улучшения_документов.md":   "правила_улучшения",
}

CHUNK_SIZE = 8_000
EMBED_DIMS = 1024
RATE_LIMIT_DELAY = 0.15   # seconds between Jina calls
REST_TIMEOUT = 60         # seconds for Supabase REST calls
# ---------------------------------------------------------------------------

# Shared HTTP session (HTTP/1.1 — avoids httpx HTTP/2 timeout bugs)
session = requests.Session()
session.headers.update({
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "apikey": SUPABASE_KEY,
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",  # upsert behaviour
})


def validate_config() -> None:
    errors = []
    if not SUPABASE_KEY:
        errors.append("SUPABASE_SERVICE_ROLE_KEY is not set")
    if not JINA_KEY:
        errors.append("JINA_API_KEY is not set")
    if not RAG_BASE.exists():
        errors.append(f"RAG_BASE not found: {RAG_BASE}")
    if errors:
        print("❌ Ошибки конфигурации:")
        for e in errors:
            print(f"   • {e}")
        sys.exit(1)


def db_upsert(table: str, row: dict) -> None:
    """Direct PostgREST upsert — avoids supabase-py / httpx HTTP2 timeout issues."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = session.post(url, data=json.dumps(row), timeout=REST_TIMEOUT)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"DB upsert failed [{resp.status_code}]: {resp.text[:200]}")


def clean_wikilinks(text: str) -> str:
    text = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', text)
    text = re.sub(r'\[\[([^\]]+)\]\]', lambda m: m.group(1).split('/')[-1], text)
    return text.strip()


def split_by_headings(content: str) -> list[tuple[str | None, str]]:
    if len(content) <= CHUNK_SIZE:
        return [(None, content)]
    sections: list[tuple[str | None, str]] = []
    title: str | None = None
    lines: list[str] = []
    for line in content.split('\n'):
        if line.startswith('## '):
            if lines:
                sections.append((title, '\n'.join(lines).strip()))
            title, lines = line[3:].strip(), [line]
        else:
            lines.append(line)
    if lines:
        sections.append((title, '\n'.join(lines).strip()))
    return sections or [(None, content)]


def get_embedding(text: str, task: str = "retrieval.passage") -> list[float]:
    time.sleep(RATE_LIMIT_DELAY)
    resp = requests.post(
        "https://api.jina.ai/v1/embeddings",
        headers={"Authorization": f"Bearer {JINA_KEY}", "Content-Type": "application/json"},
        json={"model": "jina-embeddings-v3", "task": task, "dimensions": EMBED_DIMS,
              "input": [text[:CHUNK_SIZE]]},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


def ingest_system_context() -> None:
    print("=== Системный контекст (5 базовых файлов) ===")
    for rel_path, name in FOUNDATIONAL.items():
        path = RAG_BASE / rel_path.replace('/', '\\')
        if not path.exists():
            print(f"  ⚠️  Не найден: {rel_path}")
            continue
        post = frontmatter.load(str(path))
        content = clean_wikilinks(post.content)
        db_upsert("rag_system_context", {"name": name, "content": content})
        print(f"  ✅ {name} ({len(content):,} символов)")


def ingest_file(path: Path, rel: str) -> int:
    if path.name == '_index.md' and path.parent != RAG_BASE:
        return 0
    post = frontmatter.load(str(path))
    content = clean_wikilinks(post.content)
    if not content.strip():
        return 0

    meta = dict(post.metadata)
    is_foundational = rel in FOUNDATIONAL

    def norm(val) -> list[str]:
        if not val:
            return []
        return [str(v) for v in val] if isinstance(val, list) else [str(val)]

    chunks = 0
    for i, (section_title, section_content) in enumerate(split_by_headings(content)):
        if not section_content.strip():
            continue
        chunk_id = rel if (i == 0 and section_title is None) else f"{rel}#s{i}"
        embedding = get_embedding(section_content, task="retrieval.passage")
        db_upsert("rag_chunks", {
            "id":                chunk_id,
            "content":           section_content.strip(),
            "embedding":         embedding,
            "category":          meta.get("category"),
            "tags":              norm(meta.get("tags")),
            "schedule_articles": norm(meta.get("schedule_articles")),
            "target_category":   meta.get("target_category"),
            "priority":          meta.get("priority"),
            "type":              meta.get("type"),
            "is_foundational":   is_foundational,
            "section_title":     section_title,
            "last_refined":      str(meta.get("last_refined", "")),
        })
        chunks += 1
    return chunks


def main() -> None:
    validate_config()

    ingest_system_context()

    print(f"\n=== Чанки базы знаний ({RAG_BASE}) ===")
    all_files = sorted(RAG_BASE.rglob("*.md"))
    total_chunks, skipped = 0, 0

    for i, path in enumerate(all_files):
        rel = str(path.relative_to(RAG_BASE)).replace('\\', '/')
        try:
            n = ingest_file(path, rel)
        except Exception as e:
            print(f"  ❌ [{i+1}] {path.name}: {e}")
            skipped += 1
            continue
        if n > 0:
            print(f"  ✅ [{i+1}/{len(all_files)}] {path.name}: {n} чанк(ов)")
            total_chunks += n
        else:
            skipped += 1

    print(f"\n✅ Готово: {total_chunks} чанков из {len(all_files) - skipped} файлов.")
    if skipped:
        print(f"   Пропущено/ошибки: {skipped} файлов.")
    print("\nДля обновления после правок в Obsidian — запустите скрипт снова.")


if __name__ == "__main__":
    main()
