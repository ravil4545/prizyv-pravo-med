import { dedupeAdvice } from "./medicalAdvice.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      "Expected " + JSON.stringify(expected) + ", got " +
        JSON.stringify(actual),
    );
  }
}

Deno.test("dedupeAdvice collapses repeated specialist consultations", () => {
  assertEquals(
    dedupeAdvice([
      "Повторная консультация пульмонолога",
      "Консультация врача-пульмонолога",
      "Консультация пульмонолога",
      "Консультация аллерголога",
    ]),
    ["Консультация пульмонолога", "Консультация аллерголога"],
  );
});

Deno.test("dedupeAdvice keeps the more specific allergologist label", () => {
  assertEquals(
    dedupeAdvice([
      "Консультация аллерголога",
      "Повторная консультация аллерголога-иммунолога",
    ]),
    ["Консультация аллерголога-иммунолога"],
  );
});

Deno.test("dedupeAdvice removes exact normalized duplicates", () => {
  assertEquals(
    dedupeAdvice([
      "Спирометрия с бронхолитическим тестом",
      "  Спирометрия   с бронхолитическим тестом. ",
    ]),
    ["Спирометрия с бронхолитическим тестом"],
  );
});
