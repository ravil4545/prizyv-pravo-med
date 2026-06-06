// ════════════════════════════════════════════════════════════════════════
//  Agent Tools (ТЗ §2.2) — function-calling инструменты для агентов A1–A5.
//
//  OpenAI tool-calling. Здесь:
//    • определения инструментов (JSON-схема функций),
//    • безопасный диспетчер runTool (проверка владения, без IDOR),
//    • цикл runWithTools — гоняет модель ↔ инструменты до финального ответа.
//
//  ВКЛЮЧЕНО (read/ground + сигналы, без записи в БД):
//    search_rb, get_rb_article, read_document, request_missing_info,
//    flag_low_confidence.
//  ОТЛОЖЕНО (схема определена, но диспетчер возвращает «включится в P3/P4» —
//  чтобы не пускать непроверенные записи в живую БД):
//    save_extraction, update_examination_plan, update_action_plan,
//    create_template_draft.
//
//  Безопасность: read_document читает ТОЛЬКО документы, уже присутствующие в
//  Context Bundle вызывающего (ctx.docSources) — модель не может вытащить чужой
//  документ по произвольному id.
// ════════════════════════════════════════════════════════════════════════

import { llmChat, type LlmMessage, type LlmTool, MODEL_MAIN } from "./llmGateway.ts";
import { searchByText } from "./ragSearch.ts";

// deno-lint-ignore no-explicit-any
type Sb = any;

// Обрезка результатов инструментов. Намеренно небольшая: результат вызова
// дописывается в историю диалога и ПЕРЕСЫЛАЕТСЯ моделью каждый следующий раунд,
// поэтому крупные тела статей РБ/документов быстро раздувают историю.
// 1400/1600 символов достаточно для сути.
const RB_BODY_CAP = 1400;
const DOC_TEXT_CAP = 1600;

export interface ToolContext {
  scope: "client" | "lawyer";
  // Карта id документа → таблица-источник. Ключи задают «белый список» для
  // read_document (всё, чего здесь нет, читать нельзя).
  docSources: Record<string, "medical_documents_v2" | "lawyer_client_med_docs">;
  // Якорь для write-инструментов планировщика (P3). Берётся ТОЛЬКО из
  // проверенного контекста вызывающей функции, НЕ из аргументов модели —
  // так модель не может записать план в чужое дело.
  lawyerClientId?: string;
  lawyerId?: string;
  // Гейт записи: write-инструменты исполняются, только если true И есть якорь.
  enableWrites?: boolean;
}

// ── Определения инструментов (OpenAI function schema) ─────────────────────

export const AGENT_TOOLS: LlmTool[] = [
  {
    type: "function",
    function: {
      name: "search_rb",
      description:
        "Поиск статей Расписания болезней (ПП №565) по ключевым словам/диагнозу. Возвращает номера статей, заголовки, категорию и краткий фрагмент. Используй, чтобы найти релевантную статью перед выводами о категории годности.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Диагноз или ключевые слова (например, «плоскостопие», «гипертония», «сколиоз»)." },
          // ВАЖНО: НЕ объявляем integer-параметры в схемах инструментов.
          // Модели иногда отдают числовой аргумент СТРОКОЙ ("5").
          // Лимит фиксируем в коде (см. runTool: search_rb).
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_rb_article",
      description:
        "Получить полный текст статьи Расписания болезней по её номеру. Используй после search_rb, чтобы свериться с точными формулировками и пунктами (а/б/в/г).",
      parameters: {
        type: "object",
        properties: {
          article_number: { type: "string", description: "Номер статьи РБ, например «68» или «43»." },
        },
        required: ["article_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description:
        "Поиск по ЭКСПЕРТНОЙ базе знаний юриста («второй мозг»): тактика по диагнозу, требования к оформлению документов, чек-листы, разбор реальных кейсов и стратегии — то, чего НЕТ в сухом тексте закона. Используй, чтобы найти практические рекомендации, пограничные значения, типичные ошибки и тактику усиления позиции. Дополняет search_rb (текст Расписания болезней).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Диагноз/тема/ключевые слова (например, «плоскостопие тактика», «бронхиальная астма документы», «обжалование сроки»)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_document",
      description:
        "Прочитать полный распознанный текст и ИИ-разметку конкретного медицинского документа дела по его id. Доступны только документы из контекста текущего дела.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "id документа из контекста дела." },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_missing_info",
      description:
        "Зафиксировать, каких данных/документов не хватает для вывода (запрос клиенту/юристу). Не делает выводов «на глаз» — лучше явно запросить недостающее.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string" },
            description: "Список конкретных недостающих документов/сведений.",
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "flag_low_confidence",
      description:
        "Пометить вывод как низкоуверенный (противоречивые/устаревшие документы, пограничные значения). Обязательно вызывай при сомнениях вместо уверенного утверждения.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "К чему относится сомнение (например, «степень плоскостопия»)." },
          reason: { type: "string", description: "Почему уверенность низкая." },
        },
        required: ["topic", "reason"],
      },
    },
  },
];

// Write-инструменты планировщика A3 (P3). Передаются модели ТОЛЬКО когда
// вызывающая функция включает запись (ctx.enableWrites + якорь дела).
export const PLANNER_WRITE_TOOLS: LlmTool[] = [
  {
    type: "function",
    function: {
      name: "update_examination_plan",
      description:
        "Сохранить план дообследования по делу (анализы/обследования/консультации). Вызывай ОДИН раз с полным списком пунктов. По умолчанию заменяет прежний ИИ-план (ручные пункты юриста сохраняются).",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Пункты плана дообследования.",
            items: {
              type: "object",
              properties: {
                item_type: { type: "string", enum: ["analysis", "examination", "specialist"], description: "Тип: анализ / инструментальное обследование / консультация специалиста." },
                name: { type: "string", description: "Что именно (полное название анализа/обследования/специальности)." },
                reason: { type: "string", description: "Зачем нужно (1 предложение)." },
              },
              required: ["item_type", "name"],
            },
          },
          replace: { type: "boolean", description: "true (по умолчанию) — заменить прежний ИИ-план дела." },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_action_plan",
      description:
        "Сохранить тактический план действий юриста по делу (шаги/задачи). Вызывай ОДИН раз с полным списком. По умолчанию заменяет прежний ИИ-план (ручные задачи сохраняются).",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Шаги тактического плана в порядке выполнения.",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Краткая формулировка шага." },
                description: { type: "string", description: "Детали/как сделать (опционально)." },
                priority: { type: "string", enum: ["low", "normal", "high"], description: "Приоритет." },
              },
              required: ["title"],
            },
          },
          replace: { type: "boolean", description: "true (по умолчанию) — заменить прежний ИИ-план дела." },
        },
        required: ["items"],
      },
    },
  },
];

// Отложенные инструменты (P3/P4): схемы существуют, но по умолчанию НЕ
// передаются модели. save_extraction — нужна точка persist'а;
// create_template_draft — это A5/шаблоны (P4).
export const DEFERRED_TOOL_NAMES = [
  "save_extraction",
  "create_template_draft",
] as const;

// ── helpers ───────────────────────────────────────────────────────────────

function sanitizeTerm(q: string): string {
  // Убираем символы, ломающие PostgREST .or()/.ilike() (запятые, скобки, %, *).
  return String(q).replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function cap(s: string | null | undefined, n: number): string | null {
  if (!s) return null;
  const t = String(s);
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// ── Диспетчер одного вызова инструмента ─────────────────────────────────────

export async function runTool(
  sb: Sb,
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "search_rb": {
      const term = sanitizeTerm(String(args.query ?? ""));
      if (!term) return { error: "Пустой запрос" };
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
      const { data, error } = await sb
        .from("disease_articles_565")
        .select("article_number, title, category, body")
        .or(`title.ilike.%${term}%,article_number.ilike.%${term}%,body.ilike.%${term}%`)
        .eq("is_active", true)
        .limit(limit);
      if (error) return { error: error.message };
      return {
        results: (data || []).map((a: Record<string, unknown>) => ({
          article_number: a.article_number,
          title: a.title,
          category: a.category ?? null,
          snippet: cap(a.body as string, 280),
        })),
      };
    }

    case "get_rb_article": {
      const num = String(args.article_number ?? "").trim();
      if (!num) return { error: "Не указан номер статьи" };
      const { data, error } = await sb
        .from("disease_articles_565")
        .select("article_number, title, category, body")
        .eq("article_number", num)
        .eq("is_active", true)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: `Статья ${num} не найдена` };
      return {
        article_number: data.article_number,
        title: data.title,
        category: data.category ?? null,
        body: cap(data.body as string, RB_BODY_CAP),
      };
    }

    case "search_knowledge": {
      const term = sanitizeTerm(String(args.query ?? ""));
      if (!term) return { error: "Пустой запрос" };
      const chunks = await searchByText(sb, term, 4);
      if (!chunks.length) return { results: [], note: "В экспертной базе ничего не найдено по запросу." };
      return {
        results: chunks.map((c) => ({
          category: c.category ?? null,
          section: c.section_title ?? null,
          articles: c.schedule_articles ?? [],
          snippet: cap(c.content, 600),
        })),
      };
    }

    case "read_document": {
      const id = String(args.document_id ?? "").trim();
      const table = ctx.docSources[id];
      if (!table) return { error: "Документ недоступен в контексте этого дела" };
      const { data, error } = await sb
        .from(table)
        .select("title, document_date, ai_fitness_category, ai_explanation, raw_text")
        .eq("id", id)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: "Документ не найден" };
      return {
        title: data.title ?? null,
        date: data.document_date ?? null,
        ai_category: data.ai_fitness_category ?? null,
        ai_explanation: cap(data.ai_explanation as string, 600),
        text: cap(data.raw_text as string, DOC_TEXT_CAP),
      };
    }

    case "request_missing_info": {
      const items = Array.isArray(args.items) ? args.items.map((x) => String(x)).filter(Boolean) : [];
      return { acknowledged: true, missing: items };
    }

    case "flag_low_confidence": {
      return {
        acknowledged: true,
        topic: String(args.topic ?? ""),
        reason: String(args.reason ?? ""),
      };
    }

    case "update_examination_plan": {
      if (!ctx.enableWrites || !ctx.lawyerClientId || !ctx.lawyerId) {
        return { deferred: true, message: "Запись плана недоступна в этом контексте." };
      }
      const raw = Array.isArray(args.items) ? args.items.slice(0, 30) : [];
      const valid = raw
        .map((it) => it as Record<string, unknown>)
        .filter((it) =>
          it && typeof it.name === "string" && String(it.name).trim() &&
          ["analysis", "examination", "specialist"].includes(String(it.item_type))
        )
        .map((it) => ({
          lawyer_client_id: ctx.lawyerClientId,
          lawyer_id: ctx.lawyerId,
          item_type: String(it.item_type),
          name: String(it.name).slice(0, 300),
          reason: it.reason ? String(it.reason).slice(0, 500) : null,
          source: "ai",
          created_by: ctx.lawyerId,
        }));
      if (!valid.length) return { error: "Нет валидных пунктов плана дообследования." };
      const replace = args.replace !== false;
      if (replace) {
        await sb.from("examination_plan_items").delete()
          .eq("lawyer_client_id", ctx.lawyerClientId).eq("source", "ai");
      }
      const { error } = await sb.from("examination_plan_items").insert(valid);
      if (error) return { error: error.message };
      return { saved: valid.length, replaced: replace };
    }

    case "update_action_plan": {
      if (!ctx.enableWrites || !ctx.lawyerClientId || !ctx.lawyerId) {
        return { deferred: true, message: "Запись плана недоступна в этом контексте." };
      }
      const raw = Array.isArray(args.items) ? args.items.slice(0, 30) : [];
      const valid = raw
        .map((it) => it as Record<string, unknown>)
        .filter((it) => it && typeof it.title === "string" && String(it.title).trim())
        .map((it, idx) => ({
          lawyer_client_id: ctx.lawyerClientId,
          lawyer_id: ctx.lawyerId,
          title: String(it.title).slice(0, 300),
          description: it.description ? String(it.description).slice(0, 800) : null,
          priority: ["low", "normal", "high"].includes(String(it.priority)) ? String(it.priority) : "normal",
          order_index: idx,
          source: "ai",
          created_by: ctx.lawyerId,
        }));
      if (!valid.length) return { error: "Нет валидных задач плана действий." };
      const replace = args.replace !== false;
      if (replace) {
        await sb.from("action_plan_items").delete()
          .eq("lawyer_client_id", ctx.lawyerClientId).eq("source", "ai");
      }
      const { error } = await sb.from("action_plan_items").insert(valid);
      if (error) return { error: error.message };
      return { saved: valid.length, replaced: replace };
    }

    // Отложено: save_extraction (нужна точка persist'а),
    // create_template_draft (A5/шаблоны — P4).
    case "save_extraction":
    case "create_template_draft":
      return {
        deferred: true,
        message: `Инструмент «${name}» включится позже (P3 persist / P4 шаблоны). Сейчас не выполняется.`,
      };

    default:
      return { error: `Неизвестный инструмент: ${name}` };
  }
}

// ── Цикл «модель ↔ инструменты» до финального ответа ───────────────────────

export interface RunWithToolsOpts {
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: LlmTool[];
  maxRounds?: number; // защита от зацикливания (и от выжигания TPM)
  signal?: AbortSignal;
}

export interface RunWithToolsResult {
  content: string;
  rounds: number;
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
}

/**
 * Гоняет диалог с function-calling: модель может вызвать инструменты, мы их
 * исполняем (runTool) и возвращаем результаты, пока модель не даст финальный
 * текстовый ответ либо не упрёмся в maxRounds. Возвращает финальный content и
 * протокол вызовов (для отладки/аудита).
 */
export async function runWithTools(
  sb: Sb,
  ctx: ToolContext,
  opts: RunWithToolsOpts,
): Promise<RunWithToolsResult> {
  const tools = opts.tools ?? AGENT_TOOLS;
  const maxRounds = Math.min(Math.max(opts.maxRounds ?? 4, 1), 6);
  const messages: LlmMessage[] = [...opts.messages];
  const toolCalls: RunWithToolsResult["toolCalls"] = [];

  for (let round = 1; round <= maxRounds; round++) {
    const res = await llmChat({
      messages,
      model: opts.model ?? MODEL_MAIN,
      temperature: opts.temperature ?? 0.2,
      maxTokens: opts.maxTokens,
      tools,
      toolChoice: "auto",
      signal: opts.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    const calls = msg?.tool_calls;

    if (!calls?.length) {
      return { content: msg?.content ?? "", rounds: round, toolCalls };
    }

    // Кладём ответ ассистента (с tool_calls) в историю — обязательно перед tool-ответами.
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });

    // Исполняем каждый вызов и возвращаем результат ролью "tool".
    for (const call of calls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        parsedArgs = {};
      }
      const toolName = call.function?.name ?? "";
      const result = await runTool(sb, ctx, toolName, parsedArgs);
      toolCalls.push({ name: toolName, args: parsedArgs, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: toolName,
        content: JSON.stringify(result),
      });
    }
  }

  // Достигли лимита раундов — делаем финальный проход без инструментов.
  const finalRes = await llmChat({
    messages: [
      ...messages,
      { role: "system", content: "Достигнут лимит вызовов инструментов. Дай финальный ответ по уже собранным данным." },
    ],
    model: opts.model ?? MODEL_MAIN,
    temperature: opts.temperature ?? 0.2,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
  });
  if (!finalRes.ok) {
    throw new Error(`LLM error ${finalRes.status} (final pass)`);
  }
  const finalData = await finalRes.json();
  return {
    content: finalData?.choices?.[0]?.message?.content ?? "",
    rounds: maxRounds,
    toolCalls,
  };
}

// Утилита: построить docSources из документов Context Bundle.
// deno-lint-ignore no-explicit-any
export function docSourcesFromBundle(documents: any[]): ToolContext["docSources"] {
  const map: ToolContext["docSources"] = {};
  for (const d of documents || []) {
    if (d?.id) map[d.id] = d.source === "lawyer_uploads" ? "lawyer_client_med_docs" : "medical_documents_v2";
  }
  return map;
}
