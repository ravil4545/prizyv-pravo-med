import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const getAllowedOrigin = (req?: Request) => {
  const requestOrigin = req?.headers.get("origin") || "";
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";
  if (allowedOrigin && requestOrigin === allowedOrigin) return requestOrigin;
  if (requestOrigin === "https://nepriziv.ru" || requestOrigin === "https://www.nepriziv.ru") return requestOrigin;
  if (requestOrigin.endsWith(".lovable.app")) return requestOrigin;
  if (requestOrigin.startsWith("http://localhost")) return requestOrigin;
  return allowedOrigin || "*";
};

const getCorsHeaders = (req?: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
});

// Retry helper with exponential backoff for image processing errors
async function callAIWithRetry(url: string, options: RequestInit, maxRetries: number = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`AI API call attempt ${attempt}/${maxRetries}`);
      const response = await fetch(url, options);

      // If response is OK, return it
      if (response.ok) {
        return response;
      }

      // For non-retriable errors, return immediately
      if (response.status === 429 || response.status === 402) {
        return response;
      }

      // Check if it's an image processing error (retriable)
      const errorText = await response.text();
      console.error(`AI API error (attempt ${attempt}):`, response.status, errorText);

      const isImageProcessingError =
        errorText.includes("Unable to process input image") ||
        errorText.includes("Could not process image") ||
        errorText.includes("Invalid image") ||
        (response.status === 400 && errorText.toLowerCase().includes("image"));

      if (isImageProcessingError && attempt < maxRetries) {
        // Wait with exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`Image processing error, retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      // Non-retriable error or last attempt
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`Request failed, retrying in ${delayMs}ms...`, lastError.message);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error("All retry attempts failed");
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check - require valid JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Требуется аутентификация" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Verify user token
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Неверный токен авторизации" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, documentId, userId, manualText, isHandwritten } = await req.json();

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use service role client for DB operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    const documentTypesStr = documentTypes?.map((t) => `${t.code}: ${t.name}`).join(", ") || "";
    const articlesStr = articles?.map((a) => `Статья ${a.article_number}: ${a.title}`).join("\n") || "";

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
      console.log("Starting handwritten document analysis based on user-entered text");

      // Check if this is a questionnaire (longer text with multiple sections)
      const isQuestionnaire = manualText.length > 500;

      const examinationsList = `ПОЛНЫЙ СПИСОК ДОСТУПНЫХ ОБСЛЕДОВАНИЙ (назначай из этого списка максимально широко):

АНАЛИЗЫ КРОВИ И МОЧИ:
- Клинический анализ крови: общий анализ, лейкоформула, СОЭ
- Клинический анализ мочи
- Общий белок мочи (разовая/суточная)
- Тромбоциты, микроскопия (подсчет по методу Фонио)
- Скорость клубочковой фильтрации (по Кокрофту-Голту)
- Биохимия крови, расширенный профиль
- Посев мочи
- Коагулограмма развернутая
- ТТГ тиреотропный гормон
- Т4 свободный
- Т3 свободный
- Антитела к тиреопероксидазе (АТ-ТПО)
- Антитела к тиреоглобулину (АТ-ТГ)
- Комплексное серологическое исследование: сифилис, ВИЧ, гепатит В (HBsAg), гепатит С (a-HCV)
- Общий иммуноглобулин IgE
- Анализ крови "Фадиатоп"
- Гликированный гемоглобин (HbA1c)
- Пероральный глюкозотолерантный тест (ПТТГ)
- Агрегация тромбоцитов
- Активность фактора фон Виллебранда
- Активность фактора VIII
- Мутация фактора V (Лейденская мутация)
- Мутация гена протромбина G20210A
- Антистрептолизин-О (АСЛ-О)
- С-реактивный белок (СРБ)
- Ревматоидный фактор (РФ)
- Анализ мочи на микроальбуминурию
- Антитела к циклическому цитруллинированному пептиду
- Антиген HLA-B27
- Антинуклеарный фактор (АНФ) на HEp-2 клетках
- Антинуклеарные антитела (АНА, иммуноблот)
- Антинейтрофильные цитоплазматические антитела (АНЦА, ANCA)
- Анализ полиморфизмов в генах F2 и F5
- Расширенное исследование генов системы гемостаза: F2, F5, MTHFR, MTR, MTRR, F13, FGB, ITGA2, ITGB3, F7, PAI-1

ГЕНЕТИЧЕСКИЕ ИССЛЕДОВАНИЯ:
- ДНК-диагностика хореи Гентингтона
- Молекулярно-генетическое исследование при спиноцеребеллярной атаксии
- ДНК-диагностика атаксии Фридрейха
- Генетическая диагностика спинальной мышечной атрофии
- Поиск делеций и дупликаций в гене дистрофина (DMD)
- ДНК-диагностика миотонической дистрофии 1 типа

КОНСУЛЬТАЦИИ ВРАЧЕЙ:
- Консультация врача-дерматолога
- Биопсия кожи при дерматозах
- Гистологическое исследование биоптата кожи

РЕНТГЕНОГРАФИЯ:
- Рентген длинных трубчатых костей
- Рентген стоп в боковой проекции с нагрузкой
- Рентген шейного отдела позвоночника в прямой и боковой проекциях
- Рентген грудного отдела позвоночника в прямой и боковой проекциях
- Рентген поясничного отдела позвоночника в прямой и боковой проекциях
- Рентген крупных суставов в двух проекциях
- Рентгенография нижних конечностей с измерением длины
- Рентгенография органов грудной клетки
- Внутривенная (экскреторная) урография

УЛЬТРАЗВУКОВЫЕ ИССЛЕДОВАНИЯ:
- Эхокардиография
- Эхокардиография с физической нагрузкой (Стресс ЭХО)
- УЗИ щитовидной железы и паращитовидных желез
- УЗИ почек и надпочечников
- УЗИ органов мошонки
- УЗИ органов брюшной полости (комплексное)
- УЗИ щитовидной железы, экспертное
- Дуплексное сканирование сонных и позвоночных артерий
- Дуплексное сканирование экстракраниальных и транскраниальных отделов брахиоцефальных артерий
- Дуплексное сканирование артерий почек
- УЗИ глазного яблока (В-сканирование)

МРТ:
- МРТ головного мозга
- МРТ грудного и поясничного отделов позвоночника
- МРТ коленного сустава (1 сустав)
- МРТ крестца, копчика и крестцово-подвздошных сочленений
- МРТ позвоночника (шейный, грудной, поясничный, крестцовый) один отдел
- МРТ плечевых суставов (1 сустав)

КТ:
- КТ околоносовых пазух
- КТ органов грудной клетки

ФУНКЦИОНАЛЬНАЯ ДИАГНОСТИКА:
- Регистрация и расшифровка электрокардиограммы
- Суточное мониторирование артериального давления 24 часа
- Тредмил-тест (нагрузочная проба)
- Холтеровское мониторирование сердечного ритма (24 часа)
- Электроэнцефалография
- Электронейромиография (ЭНМГ)
- Тилт-тест
- Велоэргометрия
- Вызванные потенциалы различных модальностей
- Спирометрия с проведением бронхолитического теста
- Спирометрия с проведением провокационного теста

ОФТАЛЬМОЛОГИЯ:
- Оптическая когерентная томография (ОКТ) сетчатки
- Офтальмоскопия с медикаментозным расширением зрачка
- Авторефрактометрия в условиях циклоплегии

АУДИОЛОГИЯ:
- Тональная пороговая аудиометрия
- Речевая аудиометрия
- Акустическая импедансометрия

ЛОР:
- Эндоскопическое исследование полости носа

ЭНДОСКОПИЯ:
- Рентгеноскопия пищевода, желудка и двенадцатипёрстной кишки
- Гастроскопия, в т.ч. с биопсией
- Колоноскопия, в т.ч. с биопсией

ДРУГОЕ:
- Радиоизотопные исследования (динамическая нефросцинтиграфия)
- Люмбальная пункция
- Пункция сустава с исследованием синовиальной жидкости`;

      prompt = `${basePrompt}

ЗАДАЧА: Проанализируй информацию, введённую пользователем из ${isQuestionnaire ? "медицинского опросника призывника" : "рукописного медицинского документа"}:

ТЕКСТ ИЗ ДОКУМЕНТА:
${manualText}

${examinationsList}

КРИТИЧЕСКИ ВАЖНО — АЛГОРИТМ АНАЛИЗА ОПРОСНИКА:

ЭТАП 1: Для КАЖДОЙ жалобы или симптома из опросника:
  a) Выдели конкретную жалобу (например: "головные боли", "боли в пояснице", "одышка")
  b) Предположи ВСЕ возможные диагнозы, которые могут вызывать эту жалобу (дифференциальная диагностика)
     Например: "головные боли" → мигрень, внутричерепная гипертензия, остеохондроз шейного отдела, сосудистая патология, новообразование
  c) Для КАЖДОГО предполагаемого диагноза определи МИНИМАЛЬНЫЙ набор обследований для подтверждения/исключения

ЭТАП 2: Объедини все обследования из всех диагнозов, убрав дубликаты.

ЭТАП 3: Сгруппируй итоговые рекомендации по категориям:
  - Анализы крови и мочи
  - Инструментальные обследования (МРТ, КТ, рентген, УЗИ, ЭКГ и т.д.)
  - Консультации врачей-специалистов

ПРАВИЛА РЕКОМЕНДАЦИЙ:
1. НЕ рекомендуй лечение, терапию, приём препаратов или курсы лечения!
2. Рекомендуй ТОЛЬКО обследования, анализы и консультации врачей из списка выше.
3. Назначай МАКСИМАЛЬНО ШИРОКИЙ перечень обследований — лучше назначить больше, чем пропустить важное.
4. Формат: указывай ТОЛЬКО название (например: "Клинический анализ крови", "МРТ головного мозга", "Консультация невролога")
5. Чем больше жалоб — тем шире должен быть список обследований.

На основе этого текста выполни следующее:

1. ОПРЕДЕЛЕНИЕ ТИПА ДОКУМЕНТА:
   Выбери наиболее подходящий тип из списка:
   ${documentTypesStr}
   
   Если не подходит ни один - выбери "other" или "unknown"

2. СВЯЗЬ СО СТАТЬЯМИ РАСПИСАНИЯ БОЛЕЗНЕЙ (МНОЖЕСТВЕННАЯ!):
   Определи ВСЕ статьи Постановления №565, к которым относятся диагнозы/жалобы в документе:
   ${articlesStr}
   
   ВАЖНО! Правильное соответствие статей и заболеваний:
   - Статья 42: Ревматизм, болезни сердца (ПМК, пороки клапанов)
   - Статья 49: Болезни носа и придаточных пазух (синусит, гайморит, ринит)
   - Статья 57: Болезни КИШЕЧНИКА
   - Статья 58: Болезни ПЕЧЕНИ, желчного пузыря, поджелудочной железы
   - Статья 59: Грыжи
   - Статья 65: Болезни и повреждения суставов, связок (разрыв связок, артрит)
   - Статья 68: Плоскостопие и деформации стоп
   
   Для КАЖДОГО найденного диагноза/жалобы укажи соответствующую статью!

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
   Указывай конкретные обследования, анализы и консультации из списка выше.
   НЕ УКАЗЫВАЙ лечение!

Верни результат СТРОГО в формате JSON:
{
  "extractedText": "повтор введённого пользователем текста",
  "documentDate": null,
  "documentTypeCode": "код типа документа",
  "diagnosticReasoning": [
    {
      "complaint": "конкретная жалоба пациента",
      "possibleDiagnoses": ["диагноз 1", "диагноз 2", "диагноз 3"],
      "requiredExaminations": ["обследование 1", "обследование 2"]
    }
  ],
  "linkedArticles": [
    {
      "articleNumber": "номер статьи",
      "diagnosisFound": "какой диагноз/жалоба относится к этой статье",
      "fitnessCategory": "А, Б, В, Г или Д",
      "categoryBChance": число от 0 до 100,
      "explanation": "обоснование для этой статьи",
      "recommendations": ["обследование 1", "обследование 2", "Консультация специалиста"]
    }
  ],
  "primaryArticleNumber": "номер основной статьи (с максимальным шансом В)",
  "fitnessCategory": "А, Б, В, Г или Д (общая)",
  "categoryBChance": число от 0 до 100 (максимальное из всех),
  "explanation": "общее обоснование с перечислением ключевых жалоб и предполагаемых диагнозов",
  "recommendations": ["ПОЛНЫЙ ОБЪЕДИНЁННЫЙ список ВСЕХ обследований из ВСЕХ жалоб и диагнозов, без дубликатов"],
  "suggestedTitle": "предложенное название документа"
}`;

      requestBody = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
      };
    } else {
      // Обычный анализ документа с изображением
      console.log("Starting comprehensive medical document analysis with Lovable AI");

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
      let base64Data = imageBase64.includes("base64,") ? imageBase64.split("base64,")[1] : imageBase64;

      // Clean base64 string - remove any whitespace or newlines
      base64Data = base64Data.replace(/\s/g, "");

      // Validate base64 length
      console.log("Image base64 length:", base64Data.length);

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
                text: prompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      };
    }

    // Use retry mechanism for AI API calls (especially for image processing)
    let response: Response;
    try {
      response = await callAIWithRetry(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
        3, // max 3 retries
      );
    } catch (retryError) {
      console.error("All AI API retry attempts failed:", retryError);

      // Check if it was an image processing error
      const errorMessage = retryError instanceof Error ? retryError.message : String(retryError);
      if (errorMessage.includes("image") || errorMessage.includes("Unable to process")) {
        return new Response(
          JSON.stringify({
            error: "image_processing_error",
            message:
              "Не удалось распознать изображение. Попробуйте загрузить документ в другом формате (JPG, PNG) или используйте режим ручного ввода для рукописных документов.",
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      throw retryError;
    }

    // Handle specific error responses
    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "rate_limit",
            message: "Превышен лимит запросов. Попробуйте позже.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "payment_required",
            message: "Требуется пополнение баланса AI.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
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
        suggestedTitle: "Медицинский документ",
      };
    }

    // Находим ID типа документа по коду
    let documentTypeId = null;
    if (result.documentTypeCode && documentTypes) {
      const foundType = documentTypes.find((t) => t.code === result.documentTypeCode);
      documentTypeId = foundType?.id || null;
    }

    // Находим ID основной статьи (для обратной совместимости)
    let primaryArticleId = null;
    const primaryArticleNumber = result.primaryArticleNumber || result.linkedArticleNumber;
    if (primaryArticleNumber && articles) {
      const foundArticle = articles.find((a) => a.article_number === String(primaryArticleNumber));
      primaryArticleId = foundArticle?.id || null;
    }

    // Обновляем документ в базе данных если есть documentId
    if (documentId) {
      // Сначала получаем текущий документ чтобы проверить meta
      const { data: currentDoc } = await supabase
        .from("medical_documents_v2")
        .select("meta, title")
        .eq("id", documentId)
        .single();

      const hasParts =
        currentDoc?.meta?.parts && Array.isArray(currentDoc.meta.parts) && currentDoc.meta.parts.length > 1;

      const updateData: Record<string, any> = {
        raw_text: result.extractedText,
        is_classified: true,
        ai_fitness_category: result.fitnessCategory,
        ai_category_chance: result.categoryBChance || 0,
        ai_recommendations: result.recommendations || [],
        ai_explanation: result.explanation,
        updated_at: new Date().toISOString(),
      };

      if (result.documentDate) {
        // Parse date from various formats (DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.)
        let parsedDate: string | null = null;
        const dateStr = String(result.documentDate).trim();
        
        // Try DD.MM.YYYY or DD/MM/YYYY format
        const dmyMatch = dateStr.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
        if (dmyMatch) {
          const [, day, month, year] = dmyMatch;
          parsedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        // Try YYYY-MM-DD format (already correct)
        else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          parsedDate = dateStr;
        }
        
        if (parsedDate) {
          updateData.document_date = parsedDate;
        } else {
          console.warn("Could not parse document date:", dateStr);
        }
      }
      if (documentTypeId) {
        updateData.document_type_id = documentTypeId;

        // Если есть parts в meta, обновляем тип первой части
        if (currentDoc?.meta?.parts && Array.isArray(currentDoc.meta.parts)) {
          const foundType = documentTypes?.find((t) => t.id === documentTypeId);
          const updatedParts = [...currentDoc.meta.parts];
          if (updatedParts[0]) {
            updatedParts[0].type_id = documentTypeId;
            updatedParts[0].type_name = foundType?.name || null;
          }
          updateData.meta = { parts: updatedParts };
        }
      }
      if (primaryArticleId) {
        updateData.linked_article_id = primaryArticleId;
      }
      // Не перезаписываем title если документ объединён из нескольких частей
      if (result.suggestedTitle && !hasParts) {
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
          const foundArticle = articles?.find((a) => a.article_number === articleNum);

          if (foundArticle) {
            linksToInsert.push({
              document_id: documentId,
              article_id: foundArticle.id,
              ai_fitness_category: articleLink.fitnessCategory,
              ai_category_chance: articleLink.categoryBChance || 0,
              ai_recommendations: articleLink.recommendations || [],
              ai_explanation: articleLink.explanation || `Диагноз: ${articleLink.diagnosisFound}`,
            });
          }
        }

        if (linksToInsert.length > 0) {
          const { error: insertError } = await supabase.from("document_article_links").insert(linksToInsert);

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
          const { error: insertError } = await supabase.from("document_article_links").insert({
            document_id: documentId,
            article_id: primaryArticleId,
            ai_fitness_category: result.fitnessCategory,
            ai_category_chance: result.categoryBChance || 0,
            ai_recommendations: result.recommendations || [],
            ai_explanation: result.explanation,
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
        suggestedTitle: result.suggestedTitle,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in analyze-medical-document:", error);
    return new Response(
      JSON.stringify({
        error: "processing_error",
        message: error instanceof Error ? error.message : "Произошла ошибка при анализе документа",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
