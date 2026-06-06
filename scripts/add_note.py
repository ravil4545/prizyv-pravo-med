"""
add_note.py — добавить факт/правило/особенность в «второй мозг» и сразу на сайт
================================================================================
Создаёт заметку в Obsidian-волте SecondBrain с правильным frontmatter и
НЕМЕДЛЕННО индексирует её в rag_chunks (Supabase) — то есть знание тут же
становится доступным ИИ на сайте (чаты + анализ документов).

Это инструмент для запроса «запомни этот факт/правило/особенность диагноза».

Requirements: pip install python-frontmatter requests
Ключи: как в ingest_rag.py (env или scripts/ingest.secrets.env).

Примеры:
    python scripts/add_note.py --category medical_condition --title "Деформация Хаглунда" \
        --articles 68 --target-category "В при выраженной" --type instrumental \
        --tags ортопедия,стопа --content "Деформация Хаглунда квалифицируется по ст. 68 ..."

    # тело из файла:
    python scripts/add_note.py --category faq --title "Электронные повестки 2025" \
        --content-file note.txt

    # без индексации (только создать заметку, проиндексируется при общем прогоне):
    python scripts/add_note.py --category strategy --title "Тактика КМО" --content "..." --no-ingest
"""

import argparse
import re
import sys
from datetime import date
from pathlib import Path

import frontmatter  # noqa: F401  (используется ниже)

# Переиспользуем конфиг/функции основного инжеста (пути, ключи, эмбеддинги).
sys.path.insert(0, str(Path(__file__).resolve().parent))
import ingest_rag as ing  # noqa: E402

# Категория → папка в SecondBrain. Категория пишется и во frontmatter (её читает RAG).
CATEGORY_FOLDERS: dict[str, str] = {
    "medical_condition": "10_База_знаний/11_Заболевания",
    "legal_procedure":   "10_База_знаний/12_Юридические_процедуры",
    "document_guide":     "10_База_знаний/13_Документооборот",
    "faq":                "10_База_знаний/14_FAQ",
    "reference":          "40_Справочники",
    "strategy":           "30_Стратегии",
    "case":               "20_Практика/22_Кейсы",
}
DEFAULT_FOLDER = "40_Справочники"


def slugify(title: str) -> str:
    s = title.strip().replace(" ", "_")
    s = re.sub(r"[^\w\-А-Яа-яЁё]", "", s)
    return s[:80] or "Заметка"


def parse_list(val: str | None) -> list[str]:
    if not val:
        return []
    return [x.strip() for x in val.split(",") if x.strip()]


def build_markdown(args, today: str) -> str:
    post = frontmatter.Post("")
    post.metadata = {
        "title": args.title,
        "created": today,
        "tags": parse_list(args.tags) or [args.category],
        "category": args.category,
        "anonymized": True,
        "last_refined": today,
    }
    if args.articles:
        post.metadata["schedule_articles"] = parse_list(args.articles)
    if args.target_category:
        post.metadata["target_category"] = args.target_category
    if args.type:
        post.metadata["type"] = args.type

    body = args.content or ""
    if args.content_file:
        body = Path(args.content_file).read_text(encoding="utf-8")
    if not body.strip():
        print("❌ Пустое тело заметки (--content / --content-file).")
        sys.exit(1)

    # Заголовок H1 + тело.
    post.content = f"# {args.title}\n\n{body.strip()}\n"
    return frontmatter.dumps(post)


def main() -> None:
    ap = argparse.ArgumentParser(description="Добавить заметку во «второй мозг» + проиндексировать в rag_chunks.")
    ap.add_argument("--title", required=True, help="Заголовок заметки.")
    ap.add_argument("--category", required=True, choices=list(CATEGORY_FOLDERS),
                    help="Категория знания (определяет папку и фильтрацию в RAG).")
    ap.add_argument("--content", help="Тело заметки (markdown).")
    ap.add_argument("--content-file", help="Файл с телом заметки (UTF-8).")
    ap.add_argument("--articles", help="Статьи РБ через запятую, напр. 68,66.")
    ap.add_argument("--target-category", help="Целевая категория годности, напр. «В при 3 степени».")
    ap.add_argument("--type", help="Тип знания, напр. instrumental/legal/clinical.")
    ap.add_argument("--tags", help="Теги через запятую.")
    ap.add_argument("--folder", help="Переопределить папку (относительно волта).")
    ap.add_argument("--no-ingest", action="store_true", help="Только создать файл, без индексации.")
    args = ap.parse_args()

    today = date.today().isoformat()
    folder = args.folder or CATEGORY_FOLDERS.get(args.category, DEFAULT_FOLDER)
    target_dir = ing.RAG_BASE / folder.replace("/", "\\")
    target_dir.mkdir(parents=True, exist_ok=True)

    path = target_dir / f"{slugify(args.title)}.md"
    if path.exists():
        print(f"⚠️  Файл уже существует, будет перезаписан: {path}")

    md = build_markdown(args, today)
    path.write_text(md, encoding="utf-8")
    rel = str(path.relative_to(ing.RAG_BASE)).replace("\\", "/")
    print(f"✅ Заметка создана: {rel}")

    if args.no_ingest:
        print("ℹ️  Индексация пропущена (--no-ingest). Запустите ingest_rag.py позже.")
        return

    ing.validate_config()
    try:
        n = ing.ingest_file(path, rel)
        print(f"✅ Проиндексировано в rag_chunks: {n} чанк(ов). Знание доступно ИИ на сайте.")
    except Exception as e:
        print(f"❌ Ошибка индексации (заметка сохранена, попадёт при следующем общем прогоне): {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
