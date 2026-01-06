import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, documentId, userId } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    console.log('Starting comprehensive medical document analysis with Lovable AI');

    // Получаем список типов документов для классификации
    const { data: documentTypes } = await supabase
      .from("document_types")
      .select("id, code, name")
      .eq("is_active", true);

    // Получаем список статей для связывания
    const { data: articles } = await supabase
      .from("disease_articles_565")
      .select("id, article_number, title, category")
      .eq("is_active", true);

    const documentTypesStr = documentTypes?.map(t => `${t.code}: ${t.name}`).join(", ") || "";
    const articlesStr = articles?.map(a => `Статья ${a.article_number}: ${a.title}`).join("\n") || "";

    const prompt = `Ты медицинский эксперт-документовед высшей категории, специализирующийся на анализе медицинских документов для определения годности к военной службе по Постановлению Правительства РФ №565 (Расписание болезней).

КРИТИЧЕСКИ ВАЖНО - ПРАВИЛА ОЦЕНКИ СТЕПЕНЕЙ ЗАБОЛЕВАНИЙ:

СТАТЬЯ 68 (ПЛОСКОСТОПИЕ) - ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
- Плоскостопие I степени (продольное или поперечное): НЕ является основанием для освобождения! Категория А или Б. Шанс В = 0-10%
- Плоскостопие II степени: только при наличии артроза II стадии в суставах среднего отдела стопы. Шанс В = 40-60%
- Плоскостопие III степени: категория В (ограниченно годен). Шанс В = 70-90%

ЦИТАТА ИЗ СТАТЬИ 68: "Продольное или поперечное плоскостопие I степени не является основанием для применения этой статьи, не препятствует прохождению военной службы и поступлению в военно-учебные заведения."

ЗАДАЧА: Проанализируй этот медицинский документ и выполни следующие действия:

1. ИЗВЛЕЧЕНИЕ ТЕКСТА (OCR):
   Извлеки ВЕСЬ текст из документа максимально точно, включая:
   - Название медицинского учреждения
   - Дата документа (в формате YYYY-MM-DD если возможно определить)
   - ФИО пациента
   - Все результаты анализов/обследований с числовыми значениями
   - Диагнозы (коды МКБ-10 если есть)
   - Заключения врачей
   - Рекомендации
   - Подписи и печати

2. ОПРЕДЕЛЕНИЕ ТИПА ДОКУМЕНТА:
   Выбери наиболее подходящий тип из списка:
   ${documentTypesStr}
   
   Если не подходит ни один - выбери "other" или "unknown"

3. ОПРЕДЕЛЕНИЕ ДАТЫ ДОКУМЕНТА:
   Найди дату создания/выдачи документа и верни в формате YYYY-MM-DD

4. СВЯЗЬ СО СТАТЬЯМИ РАСПИСАНИЯ БОЛЕЗНЕЙ:
   Определи, к какой статье Постановления №565 относится документ:
   ${articlesStr}
   
   ВАЖНО! Правильное соответствие статей и заболеваний:
   - Статья 57: Болезни КИШЕЧНИКА (эрозивный илеит, болезнь Крона, неспецифический язвенный колит, хронический колит, проктит, сигмоидит, энтерит, колоноскопия с патологией)
   - Статья 58: Болезни ПЕЧЕНИ, желчного пузыря, поджелудочной железы (гепатит, холецистит, панкреатит, цирроз)
   - Статья 59: Грыжи (паховая, пупочная, бедренная, послеоперационная грыжа)
   - Статья 68: Плоскостопие и деформации стоп
   
   НЕ ПУТАЙ: Колоноскопия, илеит, колит = Статья 57 (кишечник), НЕ статья 59!
   
   Верни номер наиболее релевантной статьи (только число)

5. КАТЕГОРИЯ ГОДНОСТИ:
   Определи предварительную категорию годности к военной службе:
   - А - годен к военной службе (норма, заболевания I степени)
   - Б - годен с незначительными ограничениями (минимальные отклонения, плоскостопие I степени)
   - В - ограниченно годен (НЕ подлежит призыву в мирное время) - при хронических заболеваниях II-III степени
   - Г - временно не годен (острые заболевания, требующие лечения)
   - Д - не годен к военной службе (тяжёлые патологии)

6. ШАНС НЕПРИЗЫВНОЙ КАТЕГОРИИ (В):
   ВАЖНЕЙШИЕ ИСКЛЮЧЕНИЯ (ШАНС БЛИЗОК К 0%):
   - Плоскостопие I степени: 0-10% (НЕ освобождает от службы!)
   - Сколиоз I степени (до 10°): 0-10%
   - Близорукость до -6 диоптрий: 0-10%
   - Анализы в пределах нормы: 0%
   
   СРЕДНИЙ ШАНС (40-60%):
   - Плоскостопие II степени с артрозом II стадии: 50-60%
   - Сколиоз II степени (11-25°): 50-65%
   
   ВЫСОКИЙ ШАНС (70-90%):
   - Плоскостопие III степени: 75-90%
   - Сколиоз III степени (более 25°): 80-95%
   - Грыжи межпозвонковых дисков с неврологической симптоматикой: 75-90%

7. РЕКОМЕНДАЦИИ:
   Укажи конкретные рекомендации:
   - Какие СПЕЦИАЛИСТЫ нужны для подтверждения диагноза
   - Какие дополнительные обследования требуются
   - Какие документы ещё нужно собрать

Верни результат СТРОГО в формате JSON:
{
  "extractedText": "полный извлечённый текст документа",
  "documentDate": "YYYY-MM-DD или null если не определена",
  "documentTypeCode": "код типа документа",
  "linkedArticleNumber": "номер статьи (только число) или null",
  "fitnessCategory": "А, Б, В, Г или Д",
  "categoryBChance": число от 0 до 100 (ВНИМАНИЕ: для плоскостопия I степени МАКСИМУМ 10%!),
  "explanation": "подробное обоснование выбранной категории и шанса (3-5 предложений)",
  "recommendations": [
    "Конкретная рекомендация 1",
    "Конкретная рекомендация 2",
    "Конкретная рекомендация 3"
  ],
  "suggestedTitle": "предложенное название документа на основе содержания"
}`;

    // Extract base64 data without data URL prefix if present
    let base64Data = imageBase64.includes('base64,') 
      ? imageBase64.split('base64,')[1] 
      : imageBase64;
    
    // Clean base64 string - remove any whitespace or newlines
    base64Data = base64Data.replace(/\s/g, '');
    
    // Validate base64 length
    console.log('Image base64 length:', base64Data.length);
    
    if (!base64Data || base64Data.length < 100) {
      throw new Error("Invalid image data: base64 string is too short or empty");
    }
    
    // Check if base64 is valid
    try {
      // Test decode a small portion to verify it's valid base64
      atob(base64Data.substring(0, 100));
    } catch (e) {
      console.error("Invalid base64 encoding");
      throw new Error("Invalid base64 image data");
    }

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
            error: "rate_limit",
            message: "Превышен лимит запросов. Попробуйте позже."
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ 
            error: "payment_required",
            message: "Требуется пополнение баланса AI."
          }),
          {
            status: 402,
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
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(content);
      }
    } catch (e) {
      console.error("Failed to parse JSON:", e, "Content:", content);
      result = {
        extractedText: "Не удалось извлечь текст из документа.",
        documentDate: null,
        documentTypeCode: "unknown",
        linkedArticleNumber: null,
        fitnessCategory: "Требуется анализ",
        categoryBChance: 0,
        explanation: "Не удалось автоматически проанализировать документ.",
        recommendations: ["Загрузите более чёткое изображение документа"],
        suggestedTitle: "Медицинский документ"
      };
    }

    // Находим ID типа документа по коду
    let documentTypeId = null;
    if (result.documentTypeCode && documentTypes) {
      const foundType = documentTypes.find(t => t.code === result.documentTypeCode);
      documentTypeId = foundType?.id || null;
    }

    // Находим ID статьи по номеру
    let linkedArticleId = null;
    if (result.linkedArticleNumber && articles) {
      const foundArticle = articles.find(a => a.article_number === String(result.linkedArticleNumber));
      linkedArticleId = foundArticle?.id || null;
    }

    // Обновляем документ в базе данных если есть documentId
    if (documentId) {
      const updateData: Record<string, any> = {
        raw_text: result.extractedText,
        is_classified: true,
        ai_fitness_category: result.fitnessCategory,
        ai_category_chance: result.categoryBChance || 0,
        ai_recommendations: result.recommendations || [],
        ai_explanation: result.explanation,
        updated_at: new Date().toISOString()
      };

      if (result.documentDate) {
        updateData.document_date = result.documentDate;
      }
      if (documentTypeId) {
        updateData.document_type_id = documentTypeId;
      }
      if (linkedArticleId) {
        updateData.linked_article_id = linkedArticleId;
      }
      if (result.suggestedTitle) {
        updateData.title = result.suggestedTitle;
      }

      const { error: updateError } = await supabase
        .from("medical_documents_v2")
        .update(updateData)
        .eq("id", documentId);

      if (updateError) {
        console.error("Error updating document:", updateError);
      }
    }

    console.log('Medical document analysis completed successfully');

    return new Response(
      JSON.stringify({
        ...result,
        documentTypeId,
        linkedArticleId
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-medical-document:", error);
    return new Response(
      JSON.stringify({ 
        error: "server_error",
        message: error instanceof Error ? error.message : "Неизвестная ошибка"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
