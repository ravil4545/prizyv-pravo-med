"""Read-only quality gate for the complete SecondBrain corpus."""

import argparse
import collections
import json
import sys
from pathlib import Path

import frontmatter
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ingest_rag as ing

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


AUTHORITATIVE_CATEGORIES = {
    "legal_procedure",
    "document_guide",
    "schedule_rb",
    "rb_official",
    "reference",
}


def _has_any(meta: dict, *keys: str) -> bool:
    return any(meta.get(key) not in (None, "", []) for key in keys)


def explicit_metadata_stats() -> dict[str, int]:
    stats: collections.Counter[str] = collections.Counter()
    for path in sorted(ing.RAG_BASE.rglob("*.md")):
        rel = str(path.relative_to(ing.RAG_BASE)).replace("\\", "/")
        if ing.should_skip(path, rel):
            continue
        post = frontmatter.load(str(path))
        meta = dict(post.metadata)
        second, body = ing.extract_second_frontmatter(post.content)
        meta.update({key: value for key, value in second.items() if value is not None})
        if not body.strip():
            continue
        category = ing.category_for(rel, meta)
        stats["files"] += 1
        if meta.get("title") or ing.first_h1(body):
            stats["with_title"] += 1
        if meta.get("last_refined") or meta.get("дата"):
            stats["with_explicit_freshness"] += 1
        if meta.get("tags") or second.get("tags"):
            stats["with_tags"] += 1
        if meta.get("schedule_articles"):
            stats["with_file_articles"] += 1
        if _has_any(meta, "source_url", "official_url", "source"):
            stats["with_source_reference"] += 1
        if _has_any(meta, "valid_from", "valid_to", "effective_from", "effective_to"):
            stats["with_validity_window"] += 1
        if _has_any(meta, "reviewer", "verified_by", "checked_by"):
            stats["with_reviewer"] += 1
        if _has_any(meta, "confidence", "trust_level"):
            stats["with_confidence"] += 1

        if category in AUTHORITATIVE_CATEGORIES:
            stats["authoritative_files"] += 1
            if meta.get("last_refined") or meta.get("дата"):
                stats["authoritative_with_explicit_freshness"] += 1
            if _has_any(meta, "source_url", "official_url", "source"):
                stats["authoritative_with_source_reference"] += 1
            if _has_any(meta, "reviewer", "verified_by", "checked_by"):
                stats["authoritative_with_reviewer"] += 1
    return dict(stats)


def local_audit(strict_metadata: bool = False) -> tuple[dict, list[str], list[str]]:
    chunks, files = ing.prepare_corpus()
    errors: list[str] = []
    warnings: list[str] = []

    ids = [str(chunk["id"]) for chunk in chunks]
    duplicate_ids = [item for item, count in collections.Counter(ids).items() if count > 1]
    if duplicate_ids:
        errors.append(f"Дубли id чанков: {len(duplicate_ids)}")

    uncategorized = [chunk["id"] for chunk in chunks if not chunk.get("category")]
    if uncategorized:
        errors.append(f"Чанки без категории: {len(uncategorized)}")

    oversized = [
        chunk["id"]
        for chunk in chunks
        if len(str(chunk.get("content", ""))) > ing.SECTION_MAX
    ]
    if oversized:
        errors.append(f"Чанки длиннее SECTION_MAX: {len(oversized)}")

    official_mismatch = []
    for chunk in chunks:
        if chunk.get("category") not in {"rb_official", "schedule_rb"}:
            continue
        articles = chunk.get("schedule_articles") or []
        if articles and articles != ing.articles_from_heading(chunk.get("section_title")):
            official_mismatch.append(chunk["id"])
    if official_mismatch:
        errors.append(
            f"Официальные/обзорные чанки с чужими статьями: {len(official_mismatch)}"
        )

    article_counts: collections.Counter[str] = collections.Counter()
    for chunk in chunks:
        for article in chunk.get("schedule_articles") or []:
            if str(article).isdigit():
                article_counts[str(article)] += 1
    missing_official = [
        str(number)
        for number in range(1, 89)
        if not any(
            chunk.get("category") == "rb_official"
            and str(number) in (chunk.get("schedule_articles") or [])
            for chunk in chunks
        )
    ]
    if missing_official:
        warnings.append(
            "Нет секционного официального чанка для статей: "
            + ", ".join(missing_official)
        )

    hashes = collections.Counter(str(chunk["content_hash"]) for chunk in chunks)
    exact_duplicate_groups = sum(1 for count in hashes.values() if count > 1)
    if exact_duplicate_groups:
        warnings.append(
            f"Точных повторов embedding-текста: {exact_duplicate_groups} групп; "
            "поиск удаляет их перед реранжированием"
        )

    categories = collections.Counter(
        str(chunk.get("category") or "unclassified") for chunk in chunks
    )
    metadata = explicit_metadata_stats()
    if metadata.get("with_explicit_freshness", 0) < metadata.get("files", 0):
        warnings.append(
            "Явная last_refined/дата есть у "
            f"{metadata.get('with_explicit_freshness', 0)}/{metadata.get('files', 0)} "
            "файлов; для остальных индекс использует mtime"
        )
    authoritative = metadata.get("authoritative_files", 0)
    authoritative_fresh = metadata.get("authoritative_with_explicit_freshness", 0)
    authoritative_sources = metadata.get("authoritative_with_source_reference", 0)
    authoritative_reviewers = metadata.get("authoritative_with_reviewer", 0)
    if authoritative and authoritative_fresh < authoritative:
        warnings.append(
            "Явная актуальность нормативных/справочных материалов: "
            f"{authoritative_fresh}/{authoritative}"
        )
    if authoritative and authoritative_sources < authoritative:
        warnings.append(
            "Ссылка или название первичного источника у нормативных/справочных "
            f"материалов: {authoritative_sources}/{authoritative}"
        )
    if authoritative and authoritative_reviewers < authoritative:
        warnings.append(
            "Ответственный за проверку нормативных/справочных материалов: "
            f"{authoritative_reviewers}/{authoritative}"
        )
    if strict_metadata and authoritative:
        missing = []
        if authoritative_fresh < authoritative:
            missing.append("last_refined/дата")
        if authoritative_sources < authoritative:
            missing.append("source_url/official_url/source")
        if authoritative_reviewers < authoritative:
            missing.append("reviewer/verified_by")
        if missing:
            errors.append(
                "Строгий metadata-gate: нормативным/справочным материалам не хватает "
                + ", ".join(missing)
            )

    policy_path = (
        ing.RAG_BASE
        / "10_База_знаний"
        / "14_FAQ"
        / "00_Политика_ответов_ИИ.md"
    )
    if not policy_path.exists():
        errors.append("Не найдена единая политика ответов ИИ")

    report = {
        "files": files,
        "chunks": len(chunks),
        "categories": dict(sorted(categories.items())),
        "article_coverage": dict(
            sorted(article_counts.items(), key=lambda item: int(item[0]))
        ),
        "explicit_metadata": metadata,
        "exact_duplicate_groups": exact_duplicate_groups,
    }
    return report, errors, warnings


def fetch_all(table: str, select: str) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        headers = dict(ing.session.headers)
        headers["Range"] = f"{start}-{start + 999}"
        response = requests.get(
            f"{ing.SUPABASE_URL}/rest/v1/{table}",
            params={"select": select},
            headers=headers,
            timeout=ing.REST_TIMEOUT,
        )
        response.raise_for_status()
        batch = response.json()
        rows.extend(batch)
        if len(batch) < 1000:
            return rows
        start += 1000


def compare_production(report: dict) -> dict:
    ing.validate_config(require_remote=True)
    chunks, _ = ing.prepare_corpus()
    expected = {str(chunk["id"]): str(chunk["content_hash"]) for chunk in chunks}
    production_rows = fetch_all("rag_chunks", "id,content_hash")
    production = {
        str(row["id"]): str(row.get("content_hash") or "")
        for row in production_rows
    }
    comparison = {
        "production_chunks": len(production),
        "missing_in_production": len(set(expected) - set(production)),
        "stale_in_production": len(set(production) - set(expected)),
        "hash_mismatch": sum(
            1
            for chunk_id in set(expected) & set(production)
            if expected[chunk_id] != production[chunk_id]
        ),
    }
    report["production"] = comparison
    return comparison


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--compare-prod",
        action="store_true",
        help="Read-only compare of local expected ids/hashes with Supabase.",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    parser.add_argument(
        "--strict-metadata",
        action="store_true",
        help=(
            "Fail when authoritative notes do not have explicit freshness, "
            "source reference and reviewer metadata."
        ),
    )
    args = parser.parse_args()

    report, errors, warnings = local_audit(strict_metadata=args.strict_metadata)
    if args.compare_prod:
        compare_production(report)

    if args.json:
        print(
            json.dumps(
                {"report": report, "errors": errors, "warnings": warnings},
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(f"SecondBrain: {report['files']} файлов, {report['chunks']} чанков")
        print("Категории:")
        for category, count in report["categories"].items():
            print(f"  {category}: {count}")
        if args.compare_prod:
            print("Прод:", report["production"])
        for warning in warnings:
            print("WARN:", warning)
        for error in errors:
            print("ERROR:", error)

    if errors:
        raise SystemExit(1)
    print("OK: корпус прошёл обязательные проверки")


if __name__ == "__main__":
    main()
