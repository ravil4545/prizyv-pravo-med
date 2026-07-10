import type { KnowledgeChunk } from "./ragSearch.ts";

export type ChatConfidence = "high" | "medium" | "low";

export interface ChatSourceMetadata {
  title: string;
  path: string | null;
  category: string | null;
  articles: string[];
}

export interface ChatResponseMetadata {
  sources: ChatSourceMetadata[];
  confidence: ChatConfidence;
  generatedAt: string;
}

interface ChatTurn {
  role: string;
  content: string;
}

export const CHAT_RESPONSE_FORMAT = `ФОРМАТ ОТВЕТА:
- Дай один цельный ответ без разделителей «---» и без серии отдельных сообщений.
- Начни с короткого практического вывода.
- Затем используй только нужные разделы: «Основание», «Что уточнить», «Что делать дальше».
- «Что уточнить» добавляй только если без этого меняется статья, категория или следующий юридически значимый шаг.
- Списки используй для конкретных действий; один пункт — одно действие.
- Не повторяй вывод, одинаковые оговорки и дисклеймеры.`;

const compactTurn = (content: string, limit: number): string =>
  content.replace(/\s+/g, " ").trim().slice(0, limit);

/**
 * Builds a bounded retrieval query from the latest dialogue context without an
 * extra LLM call. It is used only server-side for RAG search and is never sent
 * back to the browser.
 */
export function buildContextualRetrievalQuery(
  history: ChatTurn[],
  currentQuestion?: string,
): string {
  const turns = history
    .filter((turn) =>
      (turn.role === "user" || turn.role === "assistant") &&
      typeof turn.content === "string" && turn.content.trim().length > 0
    );

  if (currentQuestion?.trim()) {
    const normalizedCurrent = currentQuestion.trim();
    const last = turns[turns.length - 1];
    if (last?.role !== "user" || last.content.trim() !== normalizedCurrent) {
      turns.push({ role: "user", content: normalizedCurrent });
    }
  }

  return turns.slice(-4).map((turn, index, selected) => {
    const isCurrent = index === selected.length - 1 && turn.role === "user";
    const label = isCurrent
      ? "Текущий вопрос"
      : turn.role === "user"
      ? "Предыдущий вопрос клиента"
      : "Предыдущий ответ ассистента";
    const limit = isCurrent ? 1200 : turn.role === "user" ? 700 : 500;
    return `${label}: ${compactTurn(turn.content, limit)}`;
  }).join("\n");
}

export function buildChatResponseMetadata(
  chunks: KnowledgeChunk[],
): ChatResponseMetadata {
  const seen = new Set<string>();
  const sources: ChatSourceMetadata[] = [];

  for (const chunk of chunks) {
    const key = chunk.source_path || chunk.source_title || chunk.id;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      title: chunk.source_title || chunk.source_path || "Экспертный материал",
      path: chunk.source_path || null,
      category: chunk.category || null,
      articles: [...new Set(chunk.schedule_articles || [])].slice(0, 8),
    });
    if (sources.length >= 5) break;
  }

  const confidence: ChatConfidence = sources.length >= 2 && chunks.length >= 4
    ? "high"
    : sources.length > 0
    ? "medium"
    : "low";

  return {
    sources,
    confidence,
    generatedAt: new Date().toISOString(),
  };
}

export function encodeChatMetadataEvent(
  metadata: ChatResponseMetadata,
): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(
    `data: ${JSON.stringify({ type: "metadata", metadata })}\n\n`,
  );
}

/** Inserts metadata immediately before OpenAI's [DONE] marker. */
export function appendChatMetadataToStream(
  source: ReadableStream<Uint8Array>,
  metadata: ChatResponseMetadata,
): ReadableStream<Uint8Array> {
  const marker = "data: [DONE]";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = source.getReader();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let metadataSent = false;
      let failed = false;

      const enqueueEvent = (event: string) => {
        if (!metadataSent && event.includes(marker)) {
          controller.enqueue(encodeChatMetadataEvent(metadata));
          metadataSent = true;
        }
        controller.enqueue(encoder.encode(event));
      };

      const flushEvents = (final = false) => {
        while (true) {
          const delimiter = buffer.match(/\r?\n\r?\n/);
          if (!delimiter || delimiter.index === undefined) break;
          const end = delimiter.index + delimiter[0].length;
          enqueueEvent(buffer.slice(0, end));
          buffer = buffer.slice(end);
        }

        if (!final) return;
        if (buffer) enqueueEvent(buffer);
        buffer = "";
        if (!metadataSent) {
          controller.enqueue(encodeChatMetadataEvent(metadata));
          metadataSent = true;
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          flushEvents();
        }
        buffer += decoder.decode();
        flushEvents(true);
      } catch (error) {
        failed = true;
        controller.error(error);
      } finally {
        reader.releaseLock();
        if (!failed) {
          if (!metadataSent) {
            controller.enqueue(encodeChatMetadataEvent(metadata));
          }
          controller.close();
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
