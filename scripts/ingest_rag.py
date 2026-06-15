"""
RAG Knowledge Base Ingest Script — nepriziv.ru
==============================================
Загружает ВЕСЬ Obsidian-волт «второго мозга» (SecondBrain) в Supabase (pgvector):
база знаний + реальная практика (кейсы, вопросы врачу, консультации,
стратегии, веб-источники, расписание болезней).

Эмбеддинги: Jina embeddings v3 (1024 dims, сильная поддержка русского).
Таблицы:    rag_chunks (векторный поиск) + rag_system_context (5 базовых блоков).

Requirements:
    pip install python-frontmatter requests

Ключи (НЕ хардкодим — берём из окружения):
    SUPABASE_SERVICE_ROLE_KEY   service-role ключ Supabase
    JINA_API_KEY                ключ Jina AI
    SECONDBRAIN_PATH            (опц.) путь к волту, по умолчанию D:\\Obsidian\\SecondBrain

Usage:
    # обычное обновление (upsert по id — правки в Obsidian подхватятся):
    python scripts/ingest_rag.py

    # полная пересборка (СНАЧАЛА удалить все чанки — нужно при смене структуры путей):
    python scripts/ingest_rag.py --fresh

После правок в Obsidian — запустите снова. upsert() обновляет существующие чанки.
"""

import os
import re
import sys
import time
import json
from pathlib import Path

import frontmatter
import requests
import yaml

# Windows-консоль по умолчанию cp1251 — принудительно UTF-8, иначе print
# эмодзи/кириллицы падает с UnicodeEncodeError.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# ---------------------------------------------------------------------------
# SECRETS — НЕ хардкодим в коде. Берём из окружения, а если переменных нет —
# из gitignored-файла scripts/ingest.secrets.env (формат KEY=VALUE).
# Шаблон: scripts/ingest.secrets.example.env
# ---------------------------------------------------------------------------
def _load_secrets_file() -> None:
    p = Path(__file__).with_name("ingest.secrets.env")
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_secrets_file()

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
SUPABASE_URL = "https://kqbetheonxiclwgyatnm.supabase.co"
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
JINA_KEY = os.getenv("JINA_API_KEY", "")

# Путь к волту «второго мозга». Переопределяется переменной окружения.
RAG_BASE = Path(os.getenv("SECONDBRAIN_PATH", r"D:\Obsidian\SecondBrain"))

# Прецеденты Hermes-KB (обезличенные кейсы агента Hermes, плейсхолдеры
# [ПЕРСОНА_NNN]) — отдельный корень, кладём в rag_chunks как категорию
# "precedent". «Полное объединение информации»: сайт получает реальные кейсы.
HERMESKB_PATH = Path(os.getenv("HERMESKB_PATH", r"D:\Obsidian\Main\Hermes-KB"))

# 5 фундаментальных блоков → rag_system_context (включаются в КАЖДЫЙ промпт ИИ).
# Пути относительно RAG_BASE (прямые слэши).
FOUNDATIONAL: dict[str, str] = {
    "10_База_знаний/14_FAQ/Рамка_юридической_консультации.md":            "рамка_консультации",
    "10_База_знаний/11_Заболевания/00_Медицинские_тонкости.md":           "медицинские_тонкости",
    "10_База_знаний/12_Юридические_процедуры/00_Процедурные_тонкости.md": "процедурные_тонкости",
    "10_База_знаний/13_Документооборот/Диагностический_анализ.md":        "диагностический_анализ",
    "10_База_знаний/13_Документооборот/Правила_улучшения_документов.md":  "правила_улучшения",
}

# Канонические категории СТРОГО ПО ПАПКЕ — расположение файла есть источник
# истины. Ручной frontmatter `category` оказался рассинхронен (встречались
# «консультация» вместо consultation, «procedure», «index»), поэтому папка
# теперь главнее frontmatter (см. category_for).
# Ключ — фрагмент относительного пути; первый совпавший выигрывает, поэтому
# вложенные/специфичные фрагменты идут ВЫШЕ общих (16_ раньше 15_).
FOLDER_CATEGORY: list[tuple[str, str]] = [
    ("20_Практика/22_Кейсы",                    "case"),
    ("20_Практика/21_Консультации",             "consultation"),
    ("20_Практика/23_Вопросы_врачу",            "doctor_qa"),
    ("20_Практика/24_Транскрипты",              "transcript"),
    ("30_Стратегии",                            "strategy"),
    ("50_Веб-источники",                        "web_source"),
    ("10_База_знаний/16_РБ_официальный_текст",  "rb_official"),      # дословный текст РБ-565
    ("10_База_знаний/15_Расписание_болезней",   "schedule_rb"),     # саммари/разбор глав РБ
    ("10_База_знаний/11_Заболевания",           "medical_condition"),
    ("10_База_знаний/12_Юридические_процедуры", "legal_procedure"),
    ("10_База_знаний/13_Документооборот",       "document_guide"),
    ("10_База_знаний/14_FAQ",                   "faq"),
    ("40_Справочники",                          "reference"),
]

# Что НЕ индексируем: служебные/навигационные файлы и шаблоны.
# _MOC_* — Maps of Content (оглавления разделов), 00_Index/Home/README — карты
# волта: это навигация, а не знания, и они засоряли RAG. ВНИМАНИЕ: не добавлять
# общий префикс «00_» — под ним лежат foundational 00_Медицинские_тонкости /
# 00_Процедурные_тонкости. _Обзор_* НЕ скипаем — это содержательные сводки.
SKIP_DIR_PARTS = {"90_Meta", "Templates", ".obsidian", ".trash", "00_Home"}
SKIP_NAME_PREFIXES = ("00_Start_Here", "00 Навигация", "00_Home", "00_Index",
                      "_index", "_MOC_", "README", "Untitled")

CHUNK_SIZE = 8_000       # макс. длина текста, отправляемого в Jina на эмбеддинг
SECTION_MAX = 3_000      # макс. длина одного чанка (чтобы влезал в запрос к LLM)
EMBED_DIMS = 1024
RATE_LIMIT_DELAY = 0.15   # пауза между вызовами Jina
REST_TIMEOUT = 60         # таймаут Supabase REST

# Регэкспы для предупреждения о возможных персональных данных (152-ФЗ).
PHONE_RE = re.compile(r"(?:\+7|\b8)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}\b")
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
# ---------------------------------------------------------------------------

session = requests.Session()
session.headers.update({
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "apikey": SUPABASE_KEY,
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",  # upsert
})


def validate_config() -> None:
    errors = []
    if not SUPABASE_KEY:
        errors.append("SUPABASE_SERVICE_ROLE_KEY не задан (export/$env)")
    if not JINA_KEY:
        errors.append("JINA_API_KEY не задан (export/$env)")
    if not RAG_BASE.exists():
        errors.append(f"Волт не найден: {RAG_BASE}")
    if errors:
        print("❌ Ошибки конфигурации:")
        for e in errors:
            print(f"   • {e}")
        sys.exit(1)


def db_upsert(table: str, row: dict) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = session.post(url, data=json.dumps(row), timeout=REST_TIMEOUT)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"DB upsert failed [{resp.status_code}]: {resp.text[:200]}")


def wipe_chunks() -> None:
    """Полностью очищает rag_chunks (нужно при смене схемы id/путей)."""
    url = f"{SUPABASE_URL}/rest/v1/rag_chunks?id=not.is.null"
    resp = session.delete(url, timeout=REST_TIMEOUT)
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"Wipe failed [{resp.status_code}]: {resp.text[:200]}")
    print("🧹 rag_chunks очищена для полной пересборки.")


def clean_wikilinks(text: str) -> str:
    text = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', text)
    text = re.sub(r'\[\[([^\]]+)\]\]', lambda m: m.group(1).split('/')[-1], text)
    return text.strip()


def extract_second_frontmatter(content: str) -> tuple[dict, str]:
    """SecondBrain: под obsidian-frontmatter часто идёт ВТОРОЙ YAML-блок с
    оригинальными RAG-метаданными (category/schedule_articles/target_category/
    type/...). python-frontmatter читает только первый блок — этот хелпер
    достаёт второй и возвращает (метаданные, оставшийся текст)."""
    m = re.match(r'^\s*---\s*\n(.*?)\n---\s*\n?', content, re.DOTALL)
    if not m:
        return {}, content
    try:
        data = yaml.safe_load(m.group(1)) or {}
        if not isinstance(data, dict):
            return {}, content
    except Exception:
        return {}, content
    return data, content[m.end():]


def _hard_split(text: str, max_len: int) -> list[str]:
    """Дробит длинный текст по абзацам (\\n\\n), добивая до max_len; очень
    длинный абзац режет жёстко. Нужно, чтобы чанк влезал в запрос к LLM."""
    out: list[str] = []
    buf = ""
    for p in text.split("\n\n"):
        if len(buf) + len(p) + 2 <= max_len:
            buf = f"{buf}\n\n{p}" if buf else p
        else:
            if buf:
                out.append(buf)
                buf = ""
            if len(p) <= max_len:
                buf = p
            else:
                for i in range(0, len(p), max_len):
                    out.append(p[i:i + max_len])
    if buf:
        out.append(buf)
    return out or [text[:max_len]]


def split_by_headings(content: str) -> list[tuple[str | None, str]]:
    # 1) делим по ## заголовкам; 2) большие секции добиваем _hard_split,
    #    чтобы ни один чанк не превышал SECTION_MAX (защита от 413 у LLM).
    if len(content) <= SECTION_MAX:
        raw = [(None, content)]
    else:
        raw = []
        title: str | None = None
        lines: list[str] = []
        for line in content.split('\n'):
            if line.startswith('## '):
                if lines:
                    raw.append((title, '\n'.join(lines).strip()))
                title, lines = line[3:].strip(), [line]
            else:
                lines.append(line)
        if lines:
            raw.append((title, '\n'.join(lines).strip()))
        if not raw:
            raw = [(None, content)]

    out: list[tuple[str | None, str]] = []
    for title, sec in raw:
        if len(sec) <= SECTION_MAX:
            out.append((title, sec))
        else:
            for piece in _hard_split(sec, SECTION_MAX):
                out.append((title, piece))
    return out


def category_for(rel: str, meta: dict) -> str | None:
    """Категория СТРОГО по папке (источник истины). frontmatter `category` —
    только запасной вариант для файлов вне известных папок. Раньше приоритет
    был у frontmatter, из-за чего в индекс попадали рассинхронные ярлыки
    («консультация» вместо consultation, «procedure», «index»)."""
    for frag, cat in FOLDER_CATEGORY:
        if frag in rel:
            return cat
    if meta.get("category"):
        return str(meta["category"])
    return None


def should_skip(path: Path, rel: str) -> bool:
    parts = set(path.parts)
    if parts & SKIP_DIR_PARTS:
        return True
    if path.name.startswith(SKIP_NAME_PREFIXES):
        return True
    return False


def warn_pii(rel: str, content: str) -> None:
    hits = []
    if PHONE_RE.search(content):
        hits.append("телефон")
    if EMAIL_RE.search(content):
        hits.append("email")
    if hits:
        print(f"     ⚠️  возможные ПДн ({', '.join(hits)}) в {rel} — проверьте анонимизацию")


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
    print("=== Системный контекст (5 базовых блоков) ===")
    for rel_path, name in FOUNDATIONAL.items():
        path = RAG_BASE / rel_path.replace('/', os.sep)
        if not path.exists():
            print(f"  ⚠️  Не найден: {rel_path}")
            continue
        post = frontmatter.load(str(path))
        _, body = extract_second_frontmatter(post.content)
        content = clean_wikilinks(body)
        db_upsert("rag_system_context", {"name": name, "content": content})
        print(f"  ✅ {name} ({len(content):,} символов)")


def norm(val) -> list[str]:
    if not val:
        return []
    return [str(v) for v in val] if isinstance(val, list) else [str(val)]


def ingest_file(path: Path, rel: str) -> int:
    """Инжест одного .md → N чанков в rag_chunks. Возвращает число чанков."""
    if should_skip(path, rel):
        return 0
    post = frontmatter.load(str(path))
    meta = dict(post.metadata)

    # Достаём второй YAML-блок (оригинальные RAG-метаданные) и мержим его поверх.
    second, body = extract_second_frontmatter(post.content)
    for k in ("category", "schedule_articles", "target_category", "type", "priority", "last_refined"):
        if second.get(k) is not None:
            meta[k] = second[k]
    if second.get("tags"):
        meta["tags"] = list(dict.fromkeys(norm(meta.get("tags")) + norm(second.get("tags"))))

    content = clean_wikilinks(body)
    if not content.strip():
        return 0

    is_foundational = rel in FOUNDATIONAL
    category = category_for(rel, meta)
    warn_pii(rel, content)

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
            "category":          category,
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


def ingest_precedents() -> tuple[int, int]:
    """Прецеденты Hermes-KB (cases/) → rag_chunks, категория 'precedent'.
    Обезличенные кейсы агента Hermes ([ПЕРСОНА_NNN]). Отдельный id-namespace
    'hermeskb/cases/…', чтобы не пересекаться с заметками волта."""
    base = HERMESKB_PATH / "cases"
    if not base.exists():
        print(f"  ⚠️  Hermes-KB cases не найдены: {base}")
        return 0, 0
    total, ingested = 0, 0
    for path in sorted(base.rglob("*.md")):
        if path.name.startswith(SKIP_NAME_PREFIXES):
            continue
        post = frontmatter.load(str(path))
        meta = dict(post.metadata)
        content = clean_wikilinks(post.content)
        if not content.strip():
            continue
        rel = f"hermeskb/cases/{path.name}"
        warn_pii(rel, content)
        n = 0
        for i, (section_title, section_content) in enumerate(split_by_headings(content)):
            if not section_content.strip():
                continue
            chunk_id = rel if (i == 0 and section_title is None) else f"{rel}#s{i}"
            embedding = get_embedding(section_content, task="retrieval.passage")
            db_upsert("rag_chunks", {
                "id":                chunk_id,
                "content":           section_content.strip(),
                "embedding":         embedding,
                "category":          "precedent",
                "tags":              norm(meta.get("tags")),
                "schedule_articles": norm(meta.get("schedule_articles")),
                "target_category":   meta.get("target_category"),
                "priority":          meta.get("priority"),
                "type":              meta.get("type"),
                "is_foundational":   False,
                "section_title":     section_title,
                "last_refined":      str(meta.get("дата", meta.get("last_refined", ""))),
            })
            n += 1
        total += n
        if n:
            ingested += 1
    return total, ingested


def main() -> None:
    fresh = "--fresh" in sys.argv
    only_prec = "--only-precedents" in sys.argv
    validate_config()

    if only_prec:
        print(f"=== Только прецеденты Hermes-KB ({HERMESKB_PATH}) ===")
        pc, pf = ingest_precedents()
        print(f"\n✅ Прецеденты: {pc} чанков из {pf} кейсов.")
        return

    if fresh:
        wipe_chunks()

    ingest_system_context()

    print(f"\n=== Чанки базы знаний ({RAG_BASE}) ===")
    all_files = sorted(RAG_BASE.rglob("*.md"))
    total_chunks, ingested, skipped = 0, 0, 0

    for i, path in enumerate(all_files):
        rel = str(path.relative_to(RAG_BASE)).replace('\\', '/')
        try:
            n = ingest_file(path, rel)
        except Exception as e:
            print(f"  ❌ [{i+1}] {path.name}: {e}")
            skipped += 1
            continue
        if n > 0:
            print(f"  ✅ [{i+1}/{len(all_files)}] {rel}: {n} чанк(ов)")
            total_chunks += n
            ingested += 1
        else:
            skipped += 1

    print(f"\n✅ База знаний: {total_chunks} чанков из {ingested} файлов (пропущено {skipped}).")

    print(f"\n=== Прецеденты Hermes-KB ({HERMESKB_PATH}) ===")
    pc, pf = ingest_precedents()
    print(f"✅ Прецеденты: {pc} чанков из {pf} кейсов.")
    print("Для обновления после правок — запустите скрипт снова.")


if __name__ == "__main__":
    main()
