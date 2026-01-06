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
    const { imageBase64, documentId, userId, manualText, isHandwritten } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

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

    // Базовый промпт с правилами
    const basePrompt = `Ты медицинский эксперт-документовед высшей категории, специализирующийся на анализе медицинских документов для определения годности к военной службе по Постановлению Правительства РФ №565 (Расписание болезней).

КРИТИЧЕСКИ ВАЖНО - ПРАВИЛА ОЦЕНКИ СТЕПЕНЕЙ ЗАБОЛЕВАНИЙ:

СТАТЬЯ 68 (ПЛОСКОСТОПИЕ) - ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
- Плоскостопие I степени (продольное или поперечное): НЕ является основанием для освобождения! Категория А или Б. Шанс В = 0-10%
- Плоскостопие II степени: только при наличии артроза II стадии в суставах среднего отдела стопы. Шанс В = 40-60%
- Плоскостопие III степени: категория В (ограниченно годен). Шанс В = 70-90%

ЦИТАТА ИЗ СТАТЬИ 68: "Продольное или поперечное плоскостопие I степени не является основанием для применения этой статьи, не препятствует прохождению военной службы и поступлению в военно-учебные заведения."

ВАЖНО: Один документ может содержать НЕСКОЛЬКО диагнозов, относящихся к РАЗНЫМ статьям!
Например, выписка может содержать:
- ПМК (пролапс митрального клапана) → Статья 42
- Разрыв связок коленного сустава → Статья 65
- Синусит → Статья 49

Ты должен найти ВСЕ диагнозы и указать ВСЕ соответствующие статьи с отдельными рекомендациями для каждой!`;

    let prompt: string;
    let requestBody: any;

    if (isHandwritten && manualText) {
      // Анализ рукописного документа на основе текста, введённого пользователем
      console.log('Starting handwritten document analysis based on user-entered text');
      
      prompt = `${basePrompt}

ЗАДАЧА: Проанализируй информацию, введённую пользователем из рукописного медицинского документа:

ТЕКСТ ИЗ ДОКУМЕНТА:
${manualText}

На основе этого текста выполни следующее:

1. ОПРЕДЕЛЕНИЕ ТИПА ДОКУМЕНТА:
   Выбери наиболее подходящий тип из списка:
   ${documentTypesStr}
   
   Если не подходит ни один - выбери "other" или "unknown"

2. СВЯЗЬ СО СТАТЬЯМИ РАСПИСАНИЯ БОЛЕЗНЕЙ (МНОЖЕСТВЕННАЯ!):
   Определи ВСЕ статьи Постановления №565, к которым относятся диагнозы в документе:
   ${articlesStr}
   
   ВАЖНО! Правильное соответствие статей и заболеваний:
   - Статья 42: Ревматизм, болезни сердца (ПМК, пороки клапанов)
   - Статья 49: Болезни носа и придаточных пазух (синусит, гайморит, ринит)
   - Статья 57: Болезни КИШЕЧНИКА
   - Статья 58: Болезни ПЕЧЕНИ, желчного пузыря, поджелудочной железы
   - Статья 59: Грыжи
   - Статья 65: Болезни и повреждения суставов, связок (разрыв связок, артрит)
   - Статья 68: Плоскостопие и деформации стоп
   
   Для КАЖДОГО найденного диагноза укажи соответствующую статью!

3. КАТЕГОРИЯ ГОДНОСТИ (для основного диагноза):
   Определи предварительную категорию годности:
   - А - годен (норма, заболевания I степени)
   - Б - годен с ограничениями (минимальные отклонения)
   - В - ограниченно годен (хронические заболевания II-III степени)
   - Г - временно не годен
   - Д - не годен

4. ШАНС НЕПРИЗЫВНОЙ КАТЕГОРИИ (В):
   ВАЖНЕЙШИЕ ИСКЛЮЧЕНИЯ (ШАНС БЛИЗОК К 0%):
   - Плоскостопие I степени: 0-10%
   - Сколиоз I степени: 0-10%
   
   СРЕДНИЙ ШАНС (40-60%):
   - Плоскостопие II степени с артрозом: 50-60%
   - Сколиоз II степени: 50-65%
   
   ВЫСОКИЙ ШАНС (70-90%):
   - Плоскостопие III степени: 75-90%
   - Сколиоз III степени: 80-95%

5. РЕКОМЕНДАЦИИ ДЛЯ КАЖДОЙ СТАТЬИ:
   Укажи конкретные рекомендации по дополнительным обследованиям для каждой найденной статьи.

Верни результат СТРОГО в формате JSON:
{
  "extractedText": "повтор введённого пользователем текста",
  "documentDate": null,
  "documentTypeCode": "код типа документа",
  "linkedArticles": [
    {
      "articleNumber": "номер статьи",
      "diagnosisFound": "какой диагноз относится к этой статье",
      "fitnessCategory": "А, Б, В, Г или Д",
      "categoryBChance": число от 0 до 100,
      "explanation": "обоснование для этой статьи",
      "recommendations": ["Рекомендация 1 для этой статьи", "Рекомендация 2"]
    }
  ],
  "primaryArticleNumber": "номер основной статьи (с максимальным шансом В)",
  "fitnessCategory": "А, Б, В, Г или Д (общая)",
  "categoryBChance": число от 0 до 100 (максимальное из всех),
  "explanation": "общее обоснование",
  "recommendations": ["Общая рекомендация 1", "Общая рекомендация 2"],
  "suggestedTitle": "предложенное название документа"
}`;

      requestBody = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      };
    } else {
      // Обычный анализ документа с изображением
      console.log('Starting comprehensive medical document analysis with Lovable AI');
      
      prompt = `${basePrompt}

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

4. СВЯЗЬ СО СТАТЬЯМИ РАСПИСАНИЯ БОЛЕЗНЕЙ (МНОЖЕСТВЕННАЯ!):
   Определи ВСЕ статьи Постановления №565, к которым относятся диагнозы в документе:
   ${articlesStr}
   
   ВАЖНО! Правильное соответствие статей и заболеваний:
   - Статья 42: Ревматизм, болезни сердца (ПМК - пролапс митрального клапана, пороки клапанов, аритмии)
   - Статья 49: Болезни носа и придаточных пазух (синусит, гайморит, полипы носа, хронический ринит)
   - Статья 57: Болезни КИШЕЧНИКА (эрозивный илеит, болезнь Крона, неспецифический язвенный колит, хронический колит, проктит, сигмоидит, энтерит, колоноскопия с патологией)
   - Статья 58: Болезни ПЕЧЕНИ, желчного пузыря, поджелудочной железы (гепатит, холецистит, панкреатит, цирроз)
   - Статья 59: Грыжи (паховая, пупочная, бедренная, послеоперационная грыжа)
   - Статья 65: Болезни и повреждения крупных суставов, связок (разрыв связок, нестабильность сустава, привычный вывих, артрит, артроз крупных суставов)
   - Статья 68: Плоскостопие и деформации стоп
   
   НЕ ПУТАЙ: Колоноскопия, илеит, колит = Статья 57 (кишечник), НЕ статья 59!
   
   Для КАЖДОГО найденного диагноза укажи соответствующую статью!

5. КАТЕГОРИЯ ГОДНОСТИ:
   Определи предварительную категорию годности к военной службе:
   - А - годен к военной службе (норма, заболевания I степени)
   - Б - годен с незначительными ограничениями (минимальные отклонения, плоскостопие I степени)
   - В - ограниченно годен (НЕ подлежит призыву в мирное время) - при хронических заболеваниях II-III степени
   - Г - временно не годен (острые заболевания, требующие лечения)
   - Д - не годен к военной службе (тяжёлые патологии)

6. ШАНС НЕПРИЗЫВНОЙ КАТЕГОРИИ (В) для каждой статьи:
   ВАЖНЕЙШИЕ ИСКЛЮЧЕНИЯ (ШАНС БЛИЗОК К 0%):
   - Плоскостопие I степени: 0-10% (НЕ освобождает от службы!)
   - Сколиоз I степени (до 10°): 0-10%
   - Близорукость до -6 диоптрий: 0-10%
   - Анализы в пределах нормы: 0%
   
   СРЕДНИЙ ШАНС (40-60%):
   - Плоскостопие II степени с артрозом II стадии: 50-60%
   - Сколиоз II степени (11-25°): 50-65%
   - ПМК с регургитацией: 40-60%
   
   ВЫСОКИЙ ШАНС (70-90%):
   - Плоскостопие III степени: 75-90%
   - Сколиоз III степени (более 25°): 80-95%
   - Грыжи межпозвонковых дисков с неврологической симптоматикой: 75-90%
   - Разрыв связок с нестабильностью сустава: 60-80%

7. РЕКОМЕНДАЦИИ ДЛЯ КАЖДОЙ СТАТЬИ:
   Укажи конкретные рекомендации:
   - Какие СПЕЦИАЛИСТЫ нужны для подтверждения диагноза
   - Какие дополнительные обследования требуются
   - Какие документы ещё нужно собрать

Верни результат СТРОГО в формате JSON:
{
  "extractedText": "полный извлечённый текст документа",
  "documentDate": "YYYY-MM-DD или null если не определена",
  "documentTypeCode": "код типа документа",
  "linkedArticles": [
    {
      "articleNumber": "номер статьи (только число)",
      "diagnosisFound": "какой конкретно диагноз из документа относится к этой статье",
      "fitnessCategory": "А, Б, В, Г или Д",
      "categoryBChance": число от 0 до 100,
      "explanation": "обоснование выбора статьи и категории (2-3 предложения)",
      "recommendations": ["Рекомендация 1 для этой статьи", "Рекомендация 2"]
    }
  ],
  "primaryArticleNumber": "номер основной статьи с максимальным шансом категории В",
  "fitnessCategory": "А, Б, В, Г или Д (общая категория по худшему диагнозу)",
  "categoryBChance": число от 0 до 100 (максимальное из всех статей),
  "explanation": "общее обоснование (3-5 предложений)",
  "recommendations": [
    "Общая рекомендация 1",
    "Общая рекомендация 2",
    "Общая рекомендация 3"
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

      requestBody = {
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
      };
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
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
        linkedArticles: [],
        primaryArticleNumber: null,
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

    // Находим ID основной статьи (для обратной совместимости)
    let primaryArticleId = null;
    const primaryArticleNumber = result.primaryArticleNumber || result.linkedArticleNumber;
    if (primaryArticleNumber && articles) {
      const foundArticle = articles.find(a => a.article_number === String(primaryArticleNumber));
      primaryArticleId = foundArticle?.id || null;
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
      if (primaryArticleId) {
        updateData.linked_article_id = primaryArticleId;
      }
      if (result.suggestedTitle) {
        updateData.title = result.suggestedTitle;
      }

      const { error: updateError } = await supabase
        .from("medical_documents_v2")
        .update(updateData)
        .eq("id", documentId);

      if (updateError) {
        console.error("Failed to update document:", updateError);
      }

      // Удаляем старые связи и создаём новые в junction-таблице
      if (result.linkedArticles && Array.isArray(result.linkedArticles) && result.linkedArticles.length > 0) {
        // Сначала удаляем старые связи
        const { error: deleteError } = await supabase
          .from("document_article_links")
          .delete()
          .eq("document_id", documentId);

        if (deleteError) {
          console.error("Failed to delete old article links:", deleteError);
        }

        // Создаём новые связи для каждой статьи
        const linksToInsert = [];
        for (const articleLink of result.linkedArticles) {
          const articleNum = String(articleLink.articleNumber);
          const foundArticle = articles?.find(a => a.article_number === articleNum);
          
          if (foundArticle) {
            linksToInsert.push({
              document_id: documentId,
              article_id: foundArticle.id,
              ai_fitness_category: articleLink.fitnessCategory,
              ai_category_chance: articleLink.categoryBChance || 0,
              ai_recommendations: articleLink.recommendations || [],
              ai_explanation: articleLink.explanation || `Диагноз: ${articleLink.diagnosisFound}`
            });
          }
        }

        if (linksToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("document_article_links")
            .insert(linksToInsert);

          if (insertError) {
            console.error("Failed to insert article links:", insertError);
          } else {
            console.log(`Successfully linked document to ${linksToInsert.length} articles`);
          }
        }
      } else if (primaryArticleId) {
        // Если нет массива linkedArticles, но есть основная статья - создаём одну связь
        const { error: deleteError } = await supabase
          .from("document_article_links")
          .delete()
          .eq("document_id", documentId);

        if (!deleteError) {
          const { error: insertError } = await supabase
            .from("document_article_links")
            .insert({
              document_id: documentId,
              article_id: primaryArticleId,
              ai_fitness_category: result.fitnessCategory,
              ai_category_chance: result.categoryBChance || 0,
              ai_recommendations: result.recommendations || [],
              ai_explanation: result.explanation
            });

          if (insertError) {
            console.error("Failed to insert single article link:", insertError);
          }
        }
      }
    }

    console.log("Medical document analysis completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        extractedText: result.extractedText,
        documentDate: result.documentDate,
        documentTypeCode: result.documentTypeCode,
        linkedArticles: result.linkedArticles || [],
        primaryArticleNumber: primaryArticleNumber,
        fitnessCategory: result.fitnessCategory,
        categoryBChance: result.categoryBChance || 0,
        explanation: result.explanation,
        recommendations: result.recommendations || [],
        suggestedTitle: result.suggestedTitle
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-medical-document:", error);
    return new Response(
      JSON.stringify({ 
        error: "processing_error",
        message: error instanceof Error ? error.message : "Произошла ошибка при анализе документа"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});