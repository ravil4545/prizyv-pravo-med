import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ingest_rag as ing


class ArticleMetadataTests(unittest.TestCase):
    def test_lettered_article_keeps_base_number(self):
        self.assertEqual(
            ing.normalize_articles(["52в", "52б"]),
            ["52", "52в", "52б"],
        )

    def test_official_section_does_not_inherit_chapter_range(self):
        self.assertEqual(
            ing.articles_for_chunk(
                "rb_official",
                ["49", "50", "51", "52", "53"],
                "Статья 52 — Бронхиальная астма",
            ),
            ["52"],
        )

    def test_multi_article_note_uses_articles_mentioned_in_chunk(self):
        self.assertEqual(
            ing.articles_for_chunk(
                "medical_condition",
                ["65", "66", "68"],
                "План обследования",
                "Для подтверждения по ст. 68 нужен рентген стоп с нагрузкой.",
            ),
            ["68"],
        )

    def test_every_tagged_official_chunk_matches_its_section_heading(self):
        chunks, _ = ing.prepare_corpus()
        checked = 0
        for chunk in chunks:
            if chunk["category"] not in {"rb_official", "schedule_rb"}:
                continue
            articles = chunk.get("schedule_articles") or []
            if not articles:
                continue
            expected = ing.articles_from_heading(chunk.get("section_title"))
            self.assertEqual(
                articles,
                expected,
                msg=chunk["id"],
            )
            checked += 1
        self.assertGreater(checked, 100)

    def test_answer_policy_is_present_and_compact(self):
        path = (
            ing.RAG_BASE
            / "10_База_знаний"
            / "14_FAQ"
            / "00_Политика_ответов_ИИ.md"
        )
        self.assertTrue(path.exists())
        self.assertLess(path.stat().st_size, 10_000)


class ChunkingTests(unittest.TestCase):
    def test_long_text_is_bounded_and_overlapped(self):
        text = ("Критерий 155 градусов. " * 300).strip()
        parts = ing._hard_split(text, 500)
        self.assertGreater(len(parts), 1)
        self.assertTrue(all(len(part) <= 500 for part in parts))
        self.assertGreater(
            len(set(parts[0][-50:]).intersection(parts[1][: ing.CHUNK_OVERLAP])),
            5,
        )


if __name__ == "__main__":
    unittest.main()
