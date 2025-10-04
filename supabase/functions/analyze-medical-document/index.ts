import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, documentType } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log('Starting medical document analysis with Lovable AI');

    const prompt = `Ты медицинский эксперт, который анализирует медицинские документы.

Проанализируй этот медицинский документ (${documentType === 'analysis' ? 'анализ' : documentType === 'examination' ? 'обследование' : 'консультация врача'}) и выполни следующие задачи:

1. Извлеки весь текст из документа, включая:
   - Название медицинского учреждения
   - Дата проведения
   - ФИО пациента (если есть)
   - Результаты анализов/обследований
   - Заключения врачей
   - Рекомендации

2. Проанализируй содержание и определи:
   - Предварительную категорию годности к военной службе (А, Б, В, Г, Д)
   - Краткое обоснование выбранной категории
   - Список дополнительных обследований и консультаций, необходимых для уточнения диагноза (по пунктам)

Категории годности:
- А - годен к военной службе
- Б - годен к военной службе с незначительными ограничениями
- В - ограниченно годен (призыву не подлежит в мирное время)
- Г - временно не годен
- Д - не годен к военной службе

Верни результат в формате JSON:
{
  "extractedText": "полный текст из документа",
  "fitnessCategory": "буква категории",
  "explanation": "краткое обоснование категории (2-3 предложения)",
  "recommendations": [
    "Пункт 1: какое обследование или консультация",
    "Пункт 2: какое обследование или консультация",
    ...
  ]
}`;

    // Extract base64 data without data URL prefix if present
    const base64Data = imageBase64.includes('base64,') 
      ? imageBase64.split('base64,')[1] 
      : imageBase64;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: "Превышен лимит запросов. Попробуйте позже.",
            extractedText: "Не удалось извлечь текст из-за превышения лимита API.",
            fitnessCategory: "Требуется ручной анализ",
            explanation: "Пожалуйста, попробуйте загрузить документ позже.",
            recommendations: ["Дождитесь восстановления лимита API", "Попробуйте загрузить документ снова через несколько минут"]
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    let result;
    try {
      // Пробуем распарсить JSON из ответа
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(content);
      }
      
      // Проверяем наличие обязательных полей
      if (!result.extractedText || result.extractedText.length < 10) {
        result.extractedText = "Не удалось извлечь достаточно текста из документа. Попробуйте загрузить более четкое изображение.";
      }
      
      if (!result.fitnessCategory) {
        result.fitnessCategory = "Требуется дополнительное обследование";
      }
      
      if (!result.recommendations || result.recommendations.length === 0) {
        result.recommendations = ["Консультация с военным врачом для уточнения категории годности"];
      }
      
    } catch (e) {
      console.error("Failed to parse JSON:", e, "Content:", content);
      result = {
        extractedText: "Не удалось извлечь текст из документа. Возможно, изображение слишком размытое или текст нечитаем.",
        fitnessCategory: "Требуется дополнительное обследование",
        explanation: "Не удалось автоматически проанализировать документ. Обратитесь к специалисту.",
        recommendations: ["Загрузите более четкое изображение документа", "Консультация с военным врачом для уточнения категории годности"]
      };
    }

    console.log('Medical document analysis completed successfully');

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-medical-document:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        extractedText: "Произошла ошибка при анализе документа.",
        fitnessCategory: "Ошибка анализа",
        explanation: "Не удалось проанализировать документ из-за технической ошибки.",
        recommendations: ["Попробуйте загрузить документ снова", "Обратитесь в техподдержку, если проблема повторяется"]
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});