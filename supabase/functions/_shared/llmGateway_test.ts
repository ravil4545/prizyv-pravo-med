import { extractAssistantText } from "./llmGateway.ts";

function assertEquals(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("extractAssistantText reads regular Chat Completions content", () => {
  assertEquals(
    extractAssistantText({ choices: [{ message: { content: "  Ответ  " } }] }),
    "Ответ",
  );
});

Deno.test("extractAssistantText joins compatible text parts", () => {
  assertEquals(
    extractAssistantText({
      choices: [{
        message: {
          content: [
            { type: "text", text: "Первая " },
            { type: "text", text: "часть" },
          ],
        },
      }],
    }),
    "Первая часть",
  );
});

Deno.test("extractAssistantText returns empty string for missing content", () => {
  assertEquals(extractAssistantText({ choices: [{ message: {} }] }), "");
});
