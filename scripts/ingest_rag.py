"""
RAG Knowledge Base Ingest Script — nepriziv.ru
==============================================
Loads 96 .md files from the Obsidian vault into Supabase (pgvector).

Requirements:
    pip install python-frontmatter openai supabase

Usage:
    python scripts/ingest_rag.py

After editing files in Obsidian — run again. upsert() handles updates.
"""

import os
import re
import sys
import time
from pathlib import Path

import frontmatter
from openai import OpenAI
from supabase import create_client

# ---------------------------------------------------------------------------
# CONFIG — edit these values
# ---------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://kqbetheonxiclwgyatnm.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")   # Settings → API → service_role
OPENAI_KEY   = os.getenv("OPENAI_API_KEY", "")              # platform.openai.com

RAG_BASE = Path(r"g:\Obsidian\Main\00_RAG_База")

# 5 foundational files → always included in system prompt (not retrieved via search)
FOUNDATIONAL: dict[str, str] = {
    "04_FAQ/Рамка_юридической_консультации.md":             "рамка_консультации",
    "01_Заболевания/00_Медицинские_тонкости.md":            "медицинские_тонкости",
    "02_Юридические_процедуры/00_Процедурные_тонкости.md":  "процедурные_тонкости",
    "03_Документооборот/Диагностический_анализ.md":         "диагностический_анализ",
    "03_Документооборот/Правила_улучшения_документов.md":   "правила_улучшения",
}

CHUNK_SIZE = 8_000          # max chars per chunk (fits in embedding context)
EMBED_MODEL = "text-embedding-3-small"
EMBED_DIMS = 1536
RATE_LIMIT_DELAY = 0.05     # seconds between embedding requests (avoid 429)
# ---------------------------------------------------------------------------


def validate_config():
    errors = []
    if not SUPABASE_KEY:
        errors.append("SUPABASE_SERVICE_ROLE_KEY is not set")
    if not OPENAI_KEY:
        errors.append("OPENAI_API_KEY is not set")
    if not RAG_BASE.exists():
        errors.append(f"RAG_BASE directory not found: {RAG_BASE}")
    if errors:
        print("❌ Configuration errors:")
        for e in errors:
            print(f"   • {e}")
        print("\nSet env vars or edit CONFIG section in the script.")
        sys.exit(1)


def clean_wikilinks(text: str) -> str:
    """Convert [[Path/File|Display]] → Display and [[File]] → File."""
    text = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', text)
    text = re.sub(r'\[\[([^\]]+)\]\]', lambda m: m.group(1).split('/')[-1], text)
    return text.strip()


def split_by_headings(content: str) -> list[tuple[str | None, str]]:
    """
    Split large files by ## headings into sections.
    Small files (< 8 000 chars) are kept as one chunk.
    """
    if len(content) <= CHUNK_SIZE:
        return [(None, content)]

    sections: list[tuple[str | None, str]] = []
    current_title: str | None = None
    current_lines: list[str] = []

    for line in content.split('\n'):
        if line.startswith('## '):
            if current_lines:
                sections.append((current_title, '\n'.join(current_lines).strip()))
            current_title = line[3:].strip()
            current_lines = [line]
        else:
            current_lines.append(line)

    if current_lines:
        sections.append((current_title, '\n'.join(current_lines).strip()))

    return sections if sections else [(None, content)]


def get_embedding(text: str, client: OpenAI) -> list[float]:
    time.sleep(RATE_LIMIT_DELAY)
    resp = client.embeddings.create(
        model=EMBED_MODEL,
        input=text[:CHUNK_SIZE],
    )
    return resp.data[0].embedding


def ingest_system_context(supabase_client, openai_client: OpenAI) -> None:
    """Load 5 foundational files into rag_system_context table."""
    print("=== Системный контекст (5 базовых файлов) ===")
    for rel_path, name in FOUNDATIONAL.items():
        path = RAG_BASE / rel_path.replace('/', '\\')
        if not path.exists():
            print(f"  ⚠️  Не найден: {rel_path}")
            continue
        post = frontmatter.load(str(path))
        content = clean_wikilinks(post.content)
        supabase_client.table("rag_system_context").upsert(
            {"name": name, "content": content}
        ).execute()
        print(f"  ✅ {name} ({len(content):,} символов)")


def ingest_file(path: Path, rel: str, supabase_client, openai_client: OpenAI) -> int:
    """Ingest one .md file → N chunks with embeddings. Returns chunk count."""
    # Skip navigation index files in subdirectories
    if path.name == '_index.md' and path.parent != RAG_BASE:
        return 0

    post = frontmatter.load(str(path))
    content = clean_wikilinks(post.content)
    if not content.strip():
        return 0

    meta = dict(post.metadata)
    is_foundational = rel in FOUNDATIONAL

    def normalize_list(val) -> list[str]:
        if not val:
            return []
        if isinstance(val, list):
            return [str(v) for v in val]
        return [str(val)]

    chunks = 0
    for i, (section_title, section_content) in enumerate(split_by_headings(content)):
        if not section_content.strip():
            continue

        chunk_id = rel if i == 0 and section_title is None else f"{rel}#s{i}"
        embedding = get_embedding(section_content, openai_client)

        row = {
            "id":                chunk_id,
            "content":           section_content.strip(),
            "embedding":         embedding,
            "category":          meta.get("category"),
            "tags":              normalize_list(meta.get("tags")),
            "schedule_articles": normalize_list(meta.get("schedule_articles")),
            "target_category":   meta.get("target_category"),
            "priority":          meta.get("priority"),
            "type":              meta.get("type"),
            "is_foundational":   is_foundational,
            "section_title":     section_title,
            "last_refined":      str(meta.get("last_refined", "")),
        }
        supabase_client.table("rag_chunks").upsert(row).execute()
        chunks += 1

    return chunks


def main():
    validate_config()

    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    openai_client = OpenAI(api_key=OPENAI_KEY)

    # Load foundational files
    ingest_system_context(supabase_client, openai_client)

    # Load all .md files
    print(f"\n=== Чанки базы знаний ({RAG_BASE}) ===")
    all_files = sorted(RAG_BASE.rglob("*.md"))
    total_chunks = 0
    skipped = 0

    for i, path in enumerate(all_files):
        rel = str(path.relative_to(RAG_BASE)).replace('\\', '/')
        n = ingest_file(path, rel, supabase_client, openai_client)
        if n > 0:
            print(f"  [{i+1}/{len(all_files)}] {path.name}: {n} чанк(ов)")
            total_chunks += n
        else:
            skipped += 1

    print(f"\n✅ Готово: {total_chunks} чанков из {len(all_files) - skipped} файлов.")
    if skipped:
        print(f"   Пропущено (пустые/навигационные): {skipped} файлов.")
    print("\nДля обновления после правок в Obsidian — запустите скрипт снова.")


if __name__ == "__main__":
    main()
