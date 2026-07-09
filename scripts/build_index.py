"""
build_index.py — генератор ОГЛАВЛЕНИЯ «второго мозга»
=====================================================
Строит человекочитаемую карту волта SecondBrain (раздел → файлы → статьи РБ)
и индекс «статья РБ-565 → заметки». Пишет её в `00_Home/Оглавление.md`.

Зачем: чтобы и юрист в Obsidian, и ИИ видели карту базы и могли тянуть ТОЧЕЧНО
нужный срез (по разделу/статье), а не весь индекс — это держит промпт компактным.

Источник истины — сам волт (та же логика категорий и скипа, что у ingest_rag.py),
поэтому оглавление всегда согласовано с тем, что попадёт в rag_chunks. БД и ключи
НЕ нужны — только чтение .md (pip install python-frontmatter).

Usage:
    python scripts/build_index.py
Файл `00_Home/Оглавление.md` лежит в навигационной папке 00_Home и НЕ индексируется
(ingest_rag.py скипает всю 00_Home) — он сам не засоряет RAG.
"""

import os
import re
import sys
from pathlib import Path

import frontmatter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ingest_rag as ing  # переиспуем RAG_BASE, should_skip, category_for, extract_second_frontmatter, norm

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

OUT_REL = "00_Home/Оглавление.md"

# Человеко-понятные имена разделов + порядок вывода.
CATEGORY_TITLES: dict[str, str] = {
    "medical_condition": "🩺 Заболевания",
    "schedule_rb":       "📋 Расписание болезней (разбор)",
    "rb_official":       "📜 Расписание болезней (официальный текст)",
    "legal_procedure":   "⚖️ Юридические процедуры",
    "document_guide":    "📂 Документооборот",
    "faq":               "❓ FAQ",
    "reference":         "📚 Справочники",
    "strategy":          "♟️ Стратегии",
    "web_source":        "🌐 Веб-источники (актуальное)",
    "case":              "🗂 Кейсы",
    "doctor_qa":         "🩻 Вопросы врачу",
    "consultation":      "🎧 Консультации",
    "transcript":        "📝 Транскрипты",
}
# Разделы знаний разворачиваем пофайлово; практику — только сводкой (это сырьё).
KNOWLEDGE_ORDER = ["medical_condition", "schedule_rb", "rb_official", "legal_procedure",
                   "document_guide", "faq", "reference", "strategy", "web_source"]
PRACTICE_ORDER = ["case", "doctor_qa", "consultation", "transcript"]


def first_h1(body: str) -> str | None:
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return None


def short_desc(body: str, cap: int = 150) -> str:
    """Первый содержательный абзац: без заголовков/таблиц/вики-ссылок, обрезка."""
    text = ing.clean_wikilinks(body)
    for para in re.split(r"\n\s*\n", text):
        p = para.strip()
        if not p or p.startswith("#") or p.startswith("|") or p.startswith(">"):
            continue
        p = re.sub(r"[*_`#]+", "", p).replace("\n", " ").strip()
        if len(p) >= 20:
            return (p[:cap] + "…") if len(p) > cap else p
    return ""


def article_sort_key(a: str):
    m = re.match(r"(\d+)", a)
    return (int(m.group(1)) if m else 999, a)


def main() -> None:
    base: Path = ing.RAG_BASE
    if not base.exists():
        print(f"❌ Волт не найден: {base}")
        sys.exit(1)

    by_cat: dict[str, list[dict]] = {}
    by_article: dict[str, set[str]] = {}
    total = 0

    for path in sorted(base.rglob("*.md")):
        rel = str(path.relative_to(base)).replace("\\", "/")
        if ing.should_skip(path, rel):
            continue
        post = frontmatter.load(str(path))
        meta = dict(post.metadata)
        second, body = ing.extract_second_frontmatter(post.content)
        for k in ("category", "schedule_articles", "target_category", "type"):
            if second.get(k) is not None:
                meta[k] = second[k]
        if not body.strip():
            continue

        category = ing.category_for(rel, meta) or "—"
        title = str(meta.get("title") or first_h1(body) or path.stem)
        articles = ing.normalize_articles(meta.get("schedule_articles"))
        heading_articles: list[str] = []
        for heading, _ in ing.split_by_headings(ing.clean_wikilinks(body)):
            heading_articles.extend(ing.articles_from_heading(heading))
        articles = list(dict.fromkeys(articles + heading_articles))
        rec = {
            "title": title,
            "stem": path.stem,
            "articles": articles,
            "target": meta.get("target_category"),
            "desc": short_desc(body) if category in KNOWLEDGE_ORDER else "",
        }
        by_cat.setdefault(category, []).append(rec)
        total += 1
        for a in articles:
            by_article.setdefault(str(a), set()).add(path.stem)

    # ── Сборка markdown ──────────────────────────────────────────────────
    L: list[str] = []
    L.append("---")
    L.append("title: Оглавление второго мозга")
    L.append("type: index")
    L.append("note: АВТОГЕНЕРАЦИЯ (scripts/build_index.py) — не редактировать вручную")
    L.append("---\n")
    L.append("# 🧠 Оглавление второго мозга\n")
    L.append(f"> Автогенерация: `python scripts/build_index.py`. "
             f"Файлов знаний/практики в индексе: **{total}**.\n")

    L.append("## Как ИИ ищет точечно (не раздувая контекст)\n")
    L.append("- **По статье РБ** (`ст. 68`) → точная выборка `searchByArticles` / "
             "фильтр `filter_articles` — берутся только заметки с этой статьёй.")
    L.append("- **По разделу** → фильтр `filter_categories` (напр. публичный виджет — "
             "только выверенные знания, без сырых консультаций).")
    L.append("- **Свободный вопрос** → гибрид (keyword + вектор), топ-N релевантных.\n")

    # Разделы знаний — пофайлово.
    L.append("## 📂 Разделы знаний\n")
    for cat in KNOWLEDGE_ORDER:
        recs = by_cat.get(cat)
        if not recs:
            continue
        L.append(f"### {CATEGORY_TITLES.get(cat, cat)} — {len(recs)} файлов  `{cat}`\n")
        for r in sorted(recs, key=lambda x: x["title"].lower()):
            arts = f" — ст. {', '.join(sorted(r['articles'], key=article_sort_key))}" if r["articles"] else ""
            tgt = f" _(годность: {r['target']})_" if r.get("target") else ""
            desc = f" — {r['desc']}" if r["desc"] else ""
            L.append(f"- [[{r['stem']}]]{arts}{tgt}{desc}")
        L.append("")

    # Практика — сводкой.
    L.append("## 🧪 Практика (сырьё, в публичные ответы не подмешивается)\n")
    for cat in PRACTICE_ORDER:
        recs = by_cat.get(cat)
        if recs:
            L.append(f"- {CATEGORY_TITLES.get(cat, cat)} `{cat}` — **{len(recs)}** файлов")
    L.append("")

    # Индекс по статьям РБ.
    L.append("## 📜 Индекс по статьям РБ-565\n")
    L.append("Статья → заметки базы знаний (для точечного поиска):\n")
    for a in sorted(by_article, key=article_sort_key):
        files = ", ".join(f"[[{s}]]" for s in sorted(by_article[a]))
        L.append(f"- **ст. {a}** → {files}")
    L.append("")

    out_path = base / OUT_REL.replace("/", os.sep)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(L), encoding="utf-8")
    print(f"✅ Оглавление: {OUT_REL}")
    print(f"   разделов знаний: {sum(1 for c in KNOWLEDGE_ORDER if by_cat.get(c))}, "
          f"файлов всего: {total}, статей РБ в индексе: {len(by_article)}")


if __name__ == "__main__":
    main()
