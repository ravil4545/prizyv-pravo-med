"""
RAG Knowledge Base Ingest Script — nepriziv.ru
==============================================
Собирает ВЕСЬ Obsidian-волт «второго мозга» (SecondBrain) в Supabase (pgvector):
база знаний + реальная практика (кейсы, вопросы врачу, консультации,
стратегии, веб-источники, расписание болезней).

Эмбеддинги: Jina embeddings v3 (1024 dims, сильная поддержка русского).
Таблицы: rag_chunks (активный индекс), rag_chunks_staging (безопасная сборка),
rag_system_context (компактные общие правила), rag_builds (история публикаций).

Requirements:
    pip install python-frontmatter requests

Ключи (НЕ хардкодим — берём из окружения):
    SUPABASE_SERVICE_ROLE_KEY   service-role ключ Supabase
    JINA_API_KEY                ключ Jina AI
    SECONDBRAIN_PATH            (опц.) путь к волту, по умолчанию D:\\Obsidian\\SecondBrain

Usage:
    # безопасная полная сборка: staging -> проверка -> атомарная публикация
    python scripts/ingest_rag.py

    # проверить весь волт без Jina и без записи в Supabase
    python scripts/ingest_rag.py --dry-run

    # безопасно заменить все чанки одной или нескольких заметок
    python scripts/ingest_rag.py --match=Бронхиальная_астма.md

Активный индекс никогда не очищается до готовности новой сборки. Если Jina или
Supabase недоступны, пользователи продолжают получать предыдущую полную версию.
"""

import argparse
import hashlib
import os
import re
import sys
import time
import json
import uuid
from datetime import datetime, timezone
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

# Прецеденты (обезличенные кейсы, плейсхолдеры [ПЕРСОНА_NNN]) с 2026-07-03
# живут ВНУТРИ волта: SecondBrain/60_Прецеденты → категория "precedent"
# (см. FOLDER_CATEGORY). Отдельный корень Hermes-KB и --only-precedents удалены.

# Компактная политика ответа + фундаментальные блоки → rag_system_context.
# Пути относительно RAG_BASE (прямые слэши).
FOUNDATIONAL: dict[str, str] = {
    "10_База_знаний/14_FAQ/00_Политика_ответов_ИИ.md":                    "политика_ответов",
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
    ("60_Прецеденты",                           "precedent"),  # обезличенные кейсы (бывш. Hermes-KB/cases)
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
SECTION_MAX = 2_600      # компактный чанк; заголовок/источник добавляются отдельно
CHUNK_OVERLAP = 220      # сохраняет смысл на границе длинных секций
EMBED_DIMS = 1024
EMBED_BATCH_SIZE = int(os.environ.get("JINA_EMBED_BATCH_SIZE", "16"))
DB_BATCH_SIZE = 20
RATE_LIMIT_DELAY = float(os.environ.get("JINA_RATE_LIMIT_DELAY", "0.35"))   # пауза между пакетами Jina
REST_TIMEOUT = 60         # таймаут Supabase REST
JINA_RETRIES = int(os.environ.get("JINA_RETRIES", "6"))

ARTICLE_RE = re.compile(
    r"(?:^|\b)ст(?:атья|атьи|\.)?\s*№?\s*(\d{1,3})(?:\s*[«\"']?([а-д])(?:[»\"']|\b)?)?",
    re.I,
)
ARTICLE_TOKEN_RE = re.compile(r"^\s*(\d{1,3})\s*([а-д])?\s*$", re.I)

# Регэкспы для детекта возможных персональных данных (152-ФЗ).
PHONE_RE = re.compile(r"(?:\+7|\b8)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}\b")
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
CRM_RE   = re.compile(r"amocrm|voennik365|deal_id", re.I)
FIO_RE   = re.compile(r"\b[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:ович|евич|ьич|овна|евна|ична)\b")

# Категории публичной экспертной выдачи (зеркало KNOWLEDGE_CATEGORIES).
PUBLIC_CATEGORIES = {
    "medical_condition", "legal_procedure", "document_guide", "faq",
    "schedule_rb", "rb_official", "reference", "strategy", "precedent",
}
# ---------------------------------------------------------------------------

session = requests.Session()
session.headers.update({
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "apikey": SUPABASE_KEY,
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",  # upsert
})


def validate_config(require_remote: bool = True) -> None:
    errors = []
    if require_remote and not SUPABASE_KEY:
        errors.append("SUPABASE_SERVICE_ROLE_KEY не задан (export/$env)")
    if require_remote and not JINA_KEY:
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


def db_bulk_upsert(table: str, rows: list[dict], on_conflict: str | None = None) -> None:
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    resp = session.post(url, data=json.dumps(rows), timeout=REST_TIMEOUT)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"DB bulk upsert failed [{resp.status_code}]: {resp.text[:500]}")


def db_patch(table: str, filters: str, row: dict) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{filters}"
    resp = session.patch(url, data=json.dumps(row), timeout=REST_TIMEOUT)
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"DB patch failed [{resp.status_code}]: {resp.text[:500]}")


def db_count(table: str, filters: str) -> int:
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=id&{filters}"
    resp = session.get(
        url,
        headers={
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "apikey": SUPABASE_KEY,
            "Range": "0-0",
            "Prefer": "count=exact",
        },
        timeout=REST_TIMEOUT,
    )
    if resp.status_code not in (200, 206):
        raise RuntimeError(f"DB count failed [{resp.status_code}]: {resp.text[:500]}")
    content_range = resp.headers.get("Content-Range", "")
    try:
        return int(content_range.rsplit("/", 1)[1])
    except (IndexError, ValueError) as exc:
        raise RuntimeError(f"DB count missing Content-Range: {content_range}") from exc


def db_rpc(name: str, payload: dict):
    url = f"{SUPABASE_URL}/rest/v1/rpc/{name}"
    resp = session.post(url, data=json.dumps(payload), timeout=REST_TIMEOUT)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"RPC {name} failed [{resp.status_code}]: {resp.text[:500]}")
    return resp.json()


def clean_wikilinks(text: str) -> str:
    text = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', text)
    text = re.sub(r'\[\[([^\]]+)\]\]', lambda m: m.group(1).split('/')[-1], text)
    # Артефакты транскрибации/экспорта не несут смысла, но ухудшают FTS,
    # эмбеддинги и читаемость результата инструмента юриста.
    text = re.sub(r'\[cite_start\]|\[cite_end\]', '', text, flags=re.I)
    text = re.sub(r'\[cite:\s*[^\]]+\]', '', text, flags=re.I)
    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r' {2,}', ' ', text)
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
    """Дробит текст по абзацам с небольшим перекрытием между чанками."""
    out: list[str] = []
    buf = ""

    def overlap_tail(value: str) -> str:
        if len(value) <= CHUNK_OVERLAP:
            return value
        tail = value[-CHUNK_OVERLAP:]
        newline = tail.find("\n")
        return tail[newline + 1:] if newline >= 0 else tail

    for p in text.split("\n\n"):
        if len(buf) + len(p) + 2 <= max_len:
            buf = f"{buf}\n\n{p}" if buf else p
        else:
            if buf:
                out.append(buf)
                buf = overlap_tail(buf)
            if len(p) <= max_len:
                candidate = f"{buf}\n\n{p}" if buf else p
                if len(candidate) <= max_len:
                    buf = candidate
                else:
                    out.append(buf)
                    buf = p
            else:
                if buf:
                    out.append(buf)
                    buf = ""
                step = max(1, max_len - CHUNK_OVERLAP)
                pieces = [p[i:i + max_len] for i in range(0, len(p), step)]
                out.extend(piece for piece in pieces[:-1] if piece)
                buf = pieces[-1] if pieces else ""
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


def first_h1(content: str) -> str | None:
    match = re.search(r"(?m)^#\s+(.+?)\s*$", content)
    return match.group(1).strip() if match else None


def normalize_articles(values) -> list[str]:
    """Нормализует статьи и сохраняет базовый номер вместе с подпунктом.

    Например, [52в, 52б] -> ["52", "52в", "52б"]. Это позволяет одинаково
    находить заметку по запросам "статья 52" и "пункт 52в".
    """
    out: list[str] = []
    for raw in norm(values):
        compact = re.sub(r"[\s«»\"']", "", str(raw).lower())
        compact = re.sub(r"^(?:статья|ст\.)", "", compact)
        match = ARTICLE_TOKEN_RE.match(compact)
        if not match:
            continue
        number, suffix = match.groups()
        if not 1 <= int(number) <= 88:
            continue
        out.append(number)
        if suffix:
            out.append(f"{number}{suffix.lower()}")
    return list(dict.fromkeys(out))


def articles_from_heading(section_title: str | None) -> list[str]:
    if not section_title:
        return []
    found: list[str] = []
    for number, suffix in ARTICLE_RE.findall(section_title):
        found.append(number)
        if suffix:
            found.append(f"{number}{suffix.lower()}")
    return list(dict.fromkeys(found))


def articles_from_text(text: str | None) -> list[str]:
    if not text:
        return []
    found: list[str] = []
    for number, suffix in ARTICLE_RE.findall(text):
        found.append(number)
        if suffix:
            found.append(f"{number}{suffix.lower()}")
    return list(dict.fromkeys(found))


def articles_for_chunk(
    category: str | None,
    file_articles,
    section_title: str | None,
    section_content: str | None = None,
) -> list[str]:
    section_articles = articles_from_heading(section_title)
    if section_articles:
        return section_articles

    # Официальные главы и обзоры часто размечены диапазоном статей на весь
    # файл. Наследовать диапазон каждому разделу нельзя: именно так статья 52
    # получала фрагменты статей 49-51. В точный поиск идут только секции, где
    # номер статьи указан в заголовке.
    if category in {"rb_official", "schedule_rb"}:
        return []

    normalized_file = normalize_articles(file_articles)
    file_bases = {value for value in normalized_file if value.isdigit()}
    if len(file_bases) > 1:
        mentioned = [
            value
            for value in articles_from_text(section_content)
            if re.match(r"\d+", value).group(0) in file_bases
        ]
        if mentioned:
            return list(dict.fromkeys(mentioned))
    return normalized_file


def embedding_text_for(
    source_title: str,
    section_title: str | None,
    tags: list[str],
    articles: list[str],
    content: str,
) -> str:
    context = [f"Документ: {source_title}"]
    if section_title:
        context.append(f"Раздел: {section_title}")
    if tags:
        context.append(f"Темы: {', '.join(tags)}")
    if articles:
        context.append(f"Статьи РБ: {', '.join(articles)}")
    context.append(content)
    return "\n".join(context)


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


def pii_hits(content: str) -> list[str]:
    hits = []
    if PHONE_RE.search(content):
        hits.append("телефон")
    if EMAIL_RE.search(content):
        hits.append("email")
    if CRM_RE.search(content):
        hits.append("CRM-ссылка/deal_id")
    if FIO_RE.search(content):
        hits.append("ФИО-паттерн")
    return hits


def check_pii(rel: str, content: str, category: str | None) -> bool:
    """True, если файл проходит строгий ПДн-гейт всего общего волта."""
    hits = pii_hits(content)
    if not hits:
        return True
    print(
        f"     ⛔ ПДн ({', '.join(hits)}) в категории '{category}': {rel} — "
        "ФАЙЛ ЗАБЛОКИРОВАН, обезличьте и повторите"
    )
    return False


def get_embeddings(
    texts: list[str],
    task: str = "retrieval.passage",
) -> list[list[float]]:
    """Пакетные эмбеддинги с retry; порядок ответа приводится к input index."""
    if not texts:
        return []
    payload = {
        "model": "jina-embeddings-v3",
        "task": task,
        "dimensions": EMBED_DIMS,
        "input": [text[:CHUNK_SIZE] for text in texts],
    }
    last_error: Exception | None = None
    for attempt in range(1, JINA_RETRIES + 1):
        try:
            time.sleep(RATE_LIMIT_DELAY)
            resp = requests.post(
                "https://api.jina.ai/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {JINA_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=60,
            )
            resp.raise_for_status()
            data = sorted(resp.json()["data"], key=lambda item: item.get("index", 0))
            embeddings = [item["embedding"] for item in data]
            if len(embeddings) != len(texts):
                raise RuntimeError(
                    f"Jina вернула {len(embeddings)} эмбеддингов для {len(texts)} текстов"
                )
            return embeddings
        except Exception as exc:
            last_error = exc
            if attempt < JINA_RETRIES:
                retry_after = None
                if isinstance(exc, requests.HTTPError) and exc.response is not None:
                    retry_after = exc.response.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else min(15 * attempt, 120)
                print(
                    f"  Jina retry {attempt}/{JINA_RETRIES} after {wait:.0f}s: {exc}"
                )
                time.sleep(wait)
    raise RuntimeError(f"Jina embeddings failed after {JINA_RETRIES} attempts: {last_error}")


def ingest_system_context() -> None:
    print(f"=== Системный контекст ({len(FOUNDATIONAL)} блоков) ===")
    for rel_path, name in FOUNDATIONAL.items():
        path = RAG_BASE / rel_path.replace('/', os.sep)
        if not path.exists():
            print(f"  ⚠️  Не найден: {rel_path}")
            continue
        post = frontmatter.load(str(path))
        _, body = extract_second_frontmatter(post.content)
        content = clean_wikilinks(body)
        db_upsert(
            "rag_system_context",
            {
                "name": name,
                "content": content,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        print(f"  ✅ {name} ({len(content):,} символов)")


def norm(val) -> list[str]:
    if not val:
        return []
    return [str(v) for v in val] if isinstance(val, list) else [str(val)]


def prepare_file(path: Path, rel: str) -> list[dict]:
    """Читает одну заметку и возвращает готовые к эмбеддингу чанки."""
    if should_skip(path, rel):
        return []
    post = frontmatter.load(str(path))
    meta = dict(post.metadata)

    second, body = extract_second_frontmatter(post.content)
    for k in ("category", "schedule_articles", "target_category", "type", "priority", "last_refined"):
        if second.get(k) is not None:
            meta[k] = second[k]
    if second.get("tags"):
        meta["tags"] = list(dict.fromkeys(norm(meta.get("tags")) + norm(second.get("tags"))))

    content = clean_wikilinks(body)
    if not content.strip():
        return []

    is_foundational = rel in FOUNDATIONAL
    category = category_for(rel, meta)
    if not check_pii(rel, content, category):
        raise ValueError(f"ПДн-гейт заблокировал {rel}")

    tags = list(dict.fromkeys(norm(meta.get("tags"))))
    source_title = str(meta.get("title") or first_h1(content) or path.stem).strip()
    last_refined = str(meta.get("last_refined") or meta.get("дата") or "")
    source_modified_at = datetime.fromtimestamp(
        path.stat().st_mtime,
        timezone.utc,
    ).isoformat()
    prepared: list[dict] = []
    seen_hashes: set[str] = set()
    for i, (section_title, section_content) in enumerate(split_by_headings(content)):
        if not section_content.strip():
            continue
        chunk_id = rel if (i == 0 and section_title is None) else f"{rel}#s{i}"
        chunk_content = section_content.strip()
        articles = articles_for_chunk(
            category,
            meta.get("schedule_articles"),
            section_title,
            chunk_content,
        )
        embedding_text = embedding_text_for(
            source_title,
            section_title,
            tags,
            articles,
            chunk_content,
        )
        content_hash = hashlib.sha256(embedding_text.encode("utf-8")).hexdigest()
        if content_hash in seen_hashes:
            continue
        seen_hashes.add(content_hash)
        prepared.append(
            {
                "id": chunk_id,
                "content": chunk_content,
                "category": category,
                "tags": tags,
                "schedule_articles": articles,
                "target_category": meta.get("target_category"),
                "priority": meta.get("priority"),
                "type": meta.get("type"),
                "is_foundational": is_foundational,
                "section_title": section_title,
                "last_refined": last_refined,
                "source_path": rel,
                "source_title": source_title,
                "chunk_index": i,
                "content_hash": content_hash,
                "source_modified_at": source_modified_at,
                "_embedding_text": embedding_text,
            }
        )
    return prepared


def prepare_corpus(match: str | None = None) -> tuple[list[dict], int]:
    all_files = sorted(RAG_BASE.rglob("*.md"))
    chunks: list[dict] = []
    ingested_files = 0
    errors: list[str] = []
    selected = 0

    for path in all_files:
        rel = str(path.relative_to(RAG_BASE)).replace("\\", "/")
        if match and match.lower() not in rel.lower():
            continue
        selected += 1
        try:
            file_chunks = prepare_file(path, rel)
        except Exception as exc:
            errors.append(f"{rel}: {exc}")
            continue
        if file_chunks:
            chunks.extend(file_chunks)
            ingested_files += 1

    if match and selected == 0:
        raise RuntimeError(f"По фильтру '{match}' не найдено ни одного markdown-файла")
    if errors:
        details = "\n".join(f"  - {item}" for item in errors[:20])
        raise RuntimeError(
            f"Сборка остановлена: ошибок файлов {len(errors)}.\n{details}"
        )
    if not chunks:
        raise RuntimeError("После фильтров и проверок не осталось ни одного чанка")
    return chunks, ingested_files


def publish_prepared(
    chunks: list[dict],
    mode: str,
    resume_build_id: str | None = None,
) -> str:
    build_id = resume_build_id or str(uuid.uuid4())
    if resume_build_id:
        db_patch(
            "rag_builds",
            f"id=eq.{build_id}",
            {
                "mode": mode,
                "status": "staging",
                "expected_chunks": len(chunks),
                "error": None,
            },
        )
        staged_count = db_count("rag_chunks_staging", f"build_id=eq.{build_id}")
        if staged_count > len(chunks):
            raise RuntimeError(
                f"В staging {staged_count} чанков, а текущая сборка содержит {len(chunks)}"
            )
        print(f"  resume build {build_id}: already staged {staged_count}/{len(chunks)}")
    else:
        staged_count = 0
        db_upsert(
            "rag_builds",
            {
                "id": build_id,
                "mode": mode,
                "status": "staging",
                "expected_chunks": len(chunks),
            },
        )

    try:
        uploaded = staged_count
        for start in range(staged_count, len(chunks), EMBED_BATCH_SIZE):
            batch = chunks[start:start + EMBED_BATCH_SIZE]
            embeddings = get_embeddings(
                [chunk["_embedding_text"] for chunk in batch],
                task="retrieval.passage",
            )
            rows: list[dict] = []
            for chunk, embedding in zip(batch, embeddings):
                row = {k: v for k, v in chunk.items() if not k.startswith("_")}
                row["build_id"] = build_id
                row["embedding"] = embedding
                rows.append(row)
            for db_start in range(0, len(rows), DB_BATCH_SIZE):
                db_bulk_upsert(
                    "rag_chunks_staging",
                    rows[db_start:db_start + DB_BATCH_SIZE],
                    on_conflict="build_id,id",
                )
            uploaded += len(rows)
            print(f"  embeddings/staging: {uploaded}/{len(chunks)}")

        rpc_name = "publish_rag_build" if mode == "full" else "publish_rag_sources"
        published = db_rpc(
            rpc_name,
            {"p_build_id": build_id, "p_expected_count": len(chunks)},
        )
        published_count = int(published)
        if published_count != len(chunks):
            raise RuntimeError(
                f"Опубликовано {published_count} чанков вместо {len(chunks)}"
            )
        return build_id
    except Exception as exc:
        try:
            db_patch(
                "rag_builds",
                f"id=eq.{build_id}",
                {"status": "failed", "error": str(exc)[:2000]},
            )
        except Exception:
            pass
        raise


def ingest_file(path: Path, rel: str) -> int:
    """Совместимый API для add_note.py: безопасная замена одной заметки."""
    validate_config(require_remote=True)
    chunks = prepare_file(path, rel)
    if not chunks:
        return 0
    publish_prepared(chunks, mode="targeted")
    if rel in FOUNDATIONAL:
        ingest_system_context()
    return len(chunks)


def print_corpus_summary(chunks: list[dict], files: int) -> None:
    by_category: dict[str, int] = {}
    article_chunks = 0
    hashes: dict[str, int] = {}
    for chunk in chunks:
        category = str(chunk.get("category") or "unclassified")
        by_category[category] = by_category.get(category, 0) + 1
        if chunk.get("schedule_articles"):
            article_chunks += 1
        content_hash = str(chunk["content_hash"])
        hashes[content_hash] = hashes.get(content_hash, 0) + 1
    duplicate_groups = sum(1 for count in hashes.values() if count > 1)

    print(f"Файлов: {files}; чанков: {len(chunks)}")
    print(f"Чанков со статьями РБ: {article_chunks}")
    print(f"Групп точных дублей: {duplicate_groups}")
    print("Категории:")
    for category, count in sorted(by_category.items()):
        print(f"  {category}: {count}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Безопасная сборка SecondBrain RAG через staging."
    )
    parser.add_argument("--match", help="Подстрока относительного пути для точечной сборки.")
    parser.add_argument("--dry-run", action="store_true", help="Проверить корпус без внешних вызовов.")
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Устаревший алиас полной безопасной сборки; предварительного DELETE больше нет.",
    )
    parser.add_argument(
        "--skip-system-context",
        action="store_true",
        help="Не обновлять rag_system_context после полной публикации.",
    )
    parser.add_argument(
        "--resume-build",
        help="Продолжить существующую staging-сборку по UUID после временного сбоя Jina/Supabase.",
    )
    args = parser.parse_args()

    validate_config(require_remote=not args.dry_run)
    mode = "targeted" if args.match else "full"
    if args.resume_build and mode != "full":
        raise SystemExit("--resume-build поддержан только для полной сборки без --match")
    if args.resume_build and args.dry_run:
        raise SystemExit("--resume-build нельзя использовать вместе с --dry-run")
    print(f"=== SecondBrain RAG: {mode}; dry_run={args.dry_run} ===")
    chunks, files = prepare_corpus(args.match)
    print_corpus_summary(chunks, files)

    if args.dry_run:
        print("✅ Dry-run завершён: Supabase и Jina не изменялись.")
        return

    build_id = publish_prepared(chunks, mode=mode, resume_build_id=args.resume_build)
    if mode == "full" and not args.skip_system_context:
        ingest_system_context()
    elif mode == "targeted":
        targeted_paths = {str(chunk["source_path"]) for chunk in chunks}
        if targeted_paths & set(FOUNDATIONAL):
            ingest_system_context()

    print(
        f"✅ Опубликована {'полная' if mode == 'full' else 'точечная'} "
        f"сборка {build_id}: {len(chunks)} чанков из {files} файлов."
    )


if __name__ == "__main__":
    main()
