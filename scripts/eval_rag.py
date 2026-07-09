"""Read-only retrieval benchmark for the SecondBrain serving index."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ingest_rag as ing

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

CASES_PATH = Path(__file__).with_name("rag_eval_cases.json")
KNOWLEDGE_CATEGORIES = [
    "medical_condition",
    "legal_procedure",
    "document_guide",
    "faq",
    "schedule_rb",
    "rb_official",
    "reference",
    "strategy",
    "precedent",
]


def expand_articles(values: list[str]) -> list[str]:
    out: list[str] = []
    for value in values:
        normalized = ing.normalize_articles([value])
        if not normalized:
            continue
        number = normalized[0]
        out.append(number)
        out.extend(number + suffix for suffix in "абвгд")
    return list(dict.fromkeys(out))


def rpc_search(case: dict, embedding: list[float], match_count: int) -> list[dict]:
    payload = {
        "query_text": case["query"],
        "query_embedding": embedding,
        "match_count": match_count,
        "filter_categories": KNOWLEDGE_CATEGORIES,
        "filter_articles": expand_articles(case.get("articles", [])) or None,
        "min_similarity": 0.18,
    }
    try:
        return ing.db_rpc("hybrid_rag_chunks", payload)
    except RuntimeError as exc:
        # Совместимость с текущим продом до применения quality-миграции.
        if "PGRST202" not in str(exc):
            raise
        payload.pop("min_similarity", None)
        return ing.db_rpc("hybrid_rag_chunks", payload)


def source_text(row: dict) -> str:
    return " ".join(
        str(row.get(key) or "")
        for key in ("source_path", "source_title", "id")
    ).casefold()


def evaluate(task: str, cases: list[dict], match_count: int) -> dict:
    embeddings: list[list[float]] = []
    for start in range(0, len(cases), ing.EMBED_BATCH_SIZE):
        embeddings.extend(
            ing.get_embeddings(
                [case["query"] for case in cases[start:start + ing.EMBED_BATCH_SIZE]],
                task=task,
            )
        )

    hits = 0
    reciprocal_rank = 0.0
    failures: list[dict] = []
    for case, embedding in zip(cases, embeddings):
        rows = rpc_search(case, embedding, match_count)
        expected = [value.casefold() for value in case["expected_sources"]]
        rank = next(
            (
                index + 1
                for index, row in enumerate(rows)
                if any(value in source_text(row) for value in expected)
            ),
            None,
        )
        if rank is None:
            failures.append(
                {
                    "id": case["id"],
                    "top_sources": [
                        row.get("source_path") or row.get("id") for row in rows[:3]
                    ],
                }
            )
        else:
            hits += 1
            reciprocal_rank += 1.0 / rank

    return {
        "task": task,
        "cases": len(cases),
        "recall_at_k": round(hits / len(cases), 4),
        "mrr": round(reciprocal_rank / len(cases), 4),
        "failures": failures,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--task",
        choices=["retrieval.query", "retrieval.passage", "both"],
        default="both",
    )
    parser.add_argument("--match-count", type=int, default=8)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    ing.validate_config(require_remote=True)
    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    tasks = (
        ["retrieval.query", "retrieval.passage"]
        if args.task == "both"
        else [args.task]
    )
    results = [
        evaluate(task, cases, max(1, min(args.match_count, 20)))
        for task in tasks
    ]
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return
    for result in results:
        print(
            f"{result['task']}: recall@{args.match_count}={result['recall_at_k']:.1%}, "
            f"MRR={result['mrr']:.3f}, failures={len(result['failures'])}"
        )
        for failure in result["failures"]:
            print("  MISS", failure["id"], "->", failure["top_sources"])


if __name__ == "__main__":
    main()
