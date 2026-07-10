type DeltaHandler = (delta: string) => void;

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

type MetadataHandler = (metadata: ChatResponseMetadata) => void;

const DATA_PREFIX = "data:";

export async function readOpenAICompatibleStream(
  body: ReadableStream<Uint8Array>,
  onDelta: DeltaHandler,
  onMetadata?: MetadataHandler,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneReceived = false;

  const processLine = (rawLine: string) => {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":") || !line.startsWith(DATA_PREFIX)) return;

    const data = line.slice(DATA_PREFIX.length).trimStart();
    if (data.trim() === "[DONE]") {
      doneReceived = true;
      return;
    }

    try {
      const parsed = JSON.parse(data);
      if (parsed?.type === "metadata" && parsed.metadata) {
        onMetadata?.(parsed.metadata as ChatResponseMetadata);
        return;
      }
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) onDelta(delta);
    } catch (error) {
      console.warn("[openai-sse] Failed to parse SSE data line", error);
    }
  };

  try {
    while (!doneReceived) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        processLine(line);
        if (doneReceived) break;
      }
    }

    buffer += decoder.decode();
    if (!doneReceived && buffer) processLine(buffer);
  } finally {
    reader.releaseLock();
  }
}
