import {
  dedupeChunks,
  diversifyChunks,
  expandArticleVariants,
} from "./ragSearch.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("expandArticleVariants covers base article and lettered clauses", () => {
  const variants = new Set(expandArticleVariants(["52в"]));
  for (const expected of ["52", "52а", "52б", "52в", "52г", "52д"]) {
    assert(variants.has(expected), "Missing " + expected);
  }
});

Deno.test("dedupeChunks removes duplicate ids and exact content", () => {
  const chunks = dedupeChunks([
    { id: "a", content: "Один текст", category: "faq" },
    { id: "a", content: "Один текст", category: "faq" },
    { id: "b", content: " один   текст ", category: "faq" },
    { id: "c", content: "Другой текст", category: "faq" },
  ]);
  assert(chunks.length === 2, "Expected two unique chunks");
  assert(chunks[0].id === "a" && chunks[1].id === "c", "Order changed");
});

Deno.test("diversifyChunks limits one source without dropping other sources", () => {
  const chunks = diversifyChunks([
    { id: "a#s1", content: "A1", category: "faq", source_path: "a" },
    { id: "a#s2", content: "A2", category: "faq", source_path: "a" },
    { id: "a#s3", content: "A3", category: "faq", source_path: "a" },
    { id: "b#s1", content: "B1", category: "faq", source_path: "b" },
  ], 2);
  assert(chunks.length === 3, "Expected two chunks from a and one from b");
  assert(chunks.some((chunk) => chunk.id === "b#s1"), "Second source missing");
});
