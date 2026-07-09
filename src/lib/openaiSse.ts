type DeltaHandler = (delta: string) => void;

const DATA_PREFIX = "data:";

export async function readOpenAICompatibleStream(
  body: ReadableStream<Uint8Array>,
  onDelta: DeltaHandler,
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
