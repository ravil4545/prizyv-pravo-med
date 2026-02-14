import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "https://esm.sh/docx@8.5.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const getAllowedOrigin = () => {
  const origin = Deno.env.get("ALLOWED_ORIGIN");
  return origin || "*";
};

const corsHeaders = {
  "Access-Control-Allow-Origin": getAllowedOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, docType, format, customContent } = await req.json();

    console.log("Generating document:", { userId, docType, format, hasCustomContent: !!customContent });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // For questionnaire and obsledovaniya, profile is not required
    let profile: any = null;
    let diagnoses: any[] = [];

    if (docType !== "questionnaire" && docType !== "obsledovaniya") {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        throw new Error("Не удалось загрузить данные профиля");
      }
      profile = profileData;

      const { data: diagData } = await supabase.from("user_diagnoses").select("*").eq("user_id", userId);
      diagnoses = diagData || [];
    }

    console.log("Document generation:", { docType, format, hasProfile: !!profile });

    // Генерируем контент документа в зависимости от типа
    let textContent = "";

    switch (docType) {
      case "priobschenie":
        textContent = generatePriobschenieDocument(profile, diagnoses || []);
        break;
      case "vypiska":
        textContent = generateVypiskaDocument(profile);
        break;
      case "obzhalovanie":
        textContent = generateObzhalovanieDocument(profile, diagnoses || []);
        break;
      case "prokuratura":
        textContent = generateProkuraturaDocument(profile);
        break;
      case "isk_sud":
        textContent = generateIskSudDocument(profile, diagnoses || []);
        break;
      case "apellyaciya":
        textContent = generateApellyaciyaDocument(profile);
        break;
      case "obsledovaniya":
        textContent = customContent || "Нет данных для обследований";
        break;
      case "questionnaire":
        textContent = customContent || "Нет данных опросника";
        break;
      default:
        throw new Error("Неизвестный тип документа");
    }

    // Генерируем файл в зависимости от формата
    if (format === "docx") {
      const doc = generateDocxDocument(textContent);
      const buffer = await Packer.toBuffer(doc);

      return new Response(buffer, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${docType}.docx"`,
        },
      });
    } else if (format === "xlsx") {
      const workbook = generateXlsxDocument(textContent);
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      return new Response(buffer, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${docType}.xlsx"`,
        },
      });
    } else {
      throw new Error("Неподдерживаемый формат");
    }
  } catch (error) {
    console.error("Error generating document:", error);
    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generatePriobschenieDocument(profile: any, diagnoses: any[]): string {
  return `В ${profile.military_commissariat || "[Название военкомата]"}
${profile.military_commissariat_address || "[Адрес военкомата]"}

От: ${profile.full_name || "[ФИО]"}
${profile.registration_address || "[Адрес регистрации]"}
Телефон: ${profile.phone || "[Телефон]"}

ЗАЯВЛЕНИЕ
о приобщении документов к делу призывника

Я, ${profile.full_name || "[ФИО]"}, ${profile.birth_date || "[дата рождения]"} года рождения, 
зарегистрированный по адресу: ${profile.registration_address || "[адрес]"},
паспорт ${profile.passport_series || "[серия]"} ${profile.passport_number || "[номер]"}, 
выдан ${profile.passport_issued_by || "[кем выдан]"} ${profile.passport_issue_date || "[дата выдачи]"},

Прошу приобщить к моему личному делу призывника следующие медицинские документы:

${diagnoses.map((d, i) => `${i + 1}. ${d.diagnosis_name}${d.medical_documents ? " - " + d.medical_documents : ""}`).join("\n") || "1. [Список документов]"}

Данные документы подтверждают наличие у меня заболеваний, препятствующих прохождению военной службы.

Дата: ${new Date().toLocaleDateString("ru-RU")}
Подпись: _______________ ${profile.full_name || "[ФИО]"}`;
}

function generateVypiskaDocument(profile: any): string {
  return `В ${profile.military_commissariat || "[Название военкомата]"}
${profile.military_commissariat_address || "[Адрес военкомата]"}

От: ${profile.full_name || "[ФИО]"}
${profile.registration_address || "[Адрес регистрации]"}
Телефон: ${profile.phone || "[Телефон]"}

ЗАЯВЛЕНИЕ
о получении выписки из протокола заседания призывной комиссии

Прошу выдать мне выписку из протокола заседания призывной комиссии от [дата заседания] 
по результатам моего медицинского освидетельствования и определения категории годности к военной службе.

Выписка необходима для дальнейшего обжалования решения призывной комиссии.

Прошу направить выписку по адресу: ${profile.registration_address || "[адрес]"}
или выдать на руки при личном обращении.

Дата: ${new Date().toLocaleDateString("ru-RU")}
Подпись: _______________ ${profile.full_name || "[ФИО]"}`;
}

function generateObzhalovanieDocument(profile: any, diagnoses: any[]): string {
  return `В ${profile.superior_military_commissariat || "[Название вышестоящего военкомата]"}
${profile.superior_military_commissariat_address || "[Адрес]"}

От: ${profile.full_name || "[ФИО]"}
${profile.registration_address || "[Адрес регистрации]"}
Телефон: ${profile.phone || "[Телефон]"}

ЖАЛОБА
на решение призывной комиссии

Я, ${profile.full_name || "[ФИО]"}, ${profile.birth_date || "[дата рождения]"} года рождения,
не согласен с решением призывной комиссии ${profile.military_commissariat || "[военкомат]"}
от [дата решения] о признании меня годным к военной службе.

Считаю данное решение незаконным и необоснованным по следующим основаниям:

1. При вынесении решения не были учтены следующие заболевания:
${diagnoses.map((d, i) => `${i + 1}. ${d.diagnosis_name}${d.user_article ? " (статья " + d.user_article + " Расписания болезней)" : ""}`).join("\n") || "[Список заболеваний]"}

2. Имеющиеся у меня заболевания подтверждаются медицинскими документами.

3. Призывная комиссия не провела необходимое дополнительное обследование.

На основании изложенного и руководствуясь статьей 28 Федерального закона "О воинской обязанности и военной службе",

ПРОШУ:
1. Отменить решение призывной комиссии ${profile.military_commissariat || "[военкомат]"} от [дата].
2. Направить меня на дополнительное медицинское обследование.
3. Вынести новое решение с учетом всех имеющихся заболеваний.

Приложения:
1. Копии медицинских документов.
2. Выписка из протокола призывной комиссии.

Дата: ${new Date().toLocaleDateString("ru-RU")}
Подпись: _______________ ${profile.full_name || "[ФИО]"}`;
}

function generateProkuraturaDocument(profile: any): string {
  return `В ${profile.prosecutor_office || "[Название прокуратуры]"}

От: ${profile.full_name || "[ФИО]"}
${profile.registration_address || "[Адрес регистрации]"}
Телефон: ${profile.phone || "[Телефон]"}

ЖАЛОБА
на действия военного комиссариата

Я, ${profile.full_name || "[ФИО]"}, обращаюсь с жалобой на неправомерные действия 
${profile.military_commissariat || "[военкомат]"}.

[Описание ситуации и нарушений]

Считаю действия военного комиссариата нарушающими мои права, предусмотренные:
- Конституцией РФ
- Федеральным законом "О воинской обязанности и военной службе"
- Положением о военно-врачебной экспертизе

ПРОШУ:
1. Провести проверку действий военного комиссариата.
2. Принять меры к восстановлению моих нарушенных прав.
3. Привлечь виновных лиц к ответственности.

Дата: ${new Date().toLocaleDateString("ru-RU")}
Подпись: _______________ ${profile.full_name || "[ФИО]"}`;
}

function generateIskSudDocument(profile: any, diagnoses: any[]): string {
  return `В ${profile.court_by_registration || "[Название суда]"}

Истец: ${profile.full_name || "[ФИО]"}
${profile.registration_address || "[Адрес регистрации]"}

Ответчик: ${profile.military_commissariat || "[Название военкомата]"}
${profile.military_commissariat_address || "[Адрес]"}

ИСКОВОЕ ЗАЯВЛЕНИЕ
об оспаривании решения призывной комиссии

Я, ${profile.full_name || "[ФИО]"}, ${profile.birth_date || "[дата рождения]"} года рождения,
проживающий по адресу: ${profile.registration_address || "[адрес]"},
паспорт ${profile.passport_series || "[серия]"} ${profile.passport_number || "[номер]"},

Решением призывной комиссии ${profile.military_commissariat || "[военкомат]"} 
от [дата] я был признан годным к военной службе (категория годности [категория]).

Считаю данное решение незаконным и необоснованным, нарушающим мои права по следующим основаниям:

1. У меня имеются следующие заболевания:
${diagnoses.map((d, i) => `${i + 1}. ${d.diagnosis_name}${d.user_article ? " (статья " + d.user_article + " Расписания болезней)" : ""}`).join("\n") || "[Список заболеваний]"}

2. Согласно Расписанию болезней, утвержденному Постановлением Правительства РФ,
при данных заболеваниях я должен быть признан [категория годности].

3. Призывная комиссия не учла представленные медицинские документы.

На основании статей 254, 255 Гражданского процессуального кодекса РФ,

ПРОШУ СУД:
1. Признать незаконным решение призывной комиссии от [дата].
2. Обязать ответчика направить меня на дополнительное обследование.
3. Обязать ответчика вынести новое решение с учетом всех заболеваний.

Приложения:
1. Копии медицинских документов
2. Копия решения призывной комиссии
3. Квитанция об оплате госпошлины

Дата: ${new Date().toLocaleDateString("ru-RU")}
Подпись: _______________ ${profile.full_name || "[ФИО]"}`;
}

function generateApellyaciyaDocument(profile: any): string {
  return `В ${profile.court_by_registration || "[Название суда]"} (апелляционная инстанция)

От: ${profile.full_name || "[ФИО]"}
${profile.registration_address || "[Адрес регистрации]"}

АПЕЛЛЯЦИОННАЯ ЖАЛОБА
на решение суда первой инстанции

Решением ${profile.court_by_registration || "[суд]"} от [дата] по делу № [номер]
по иску ${profile.full_name || "[ФИО]"} к ${profile.military_commissariat || "[военкомат]"}
об оспаривании решения призывной комиссии было [результат решения].

Считаю данное решение незаконным и необоснованным по следующим основаниям:

1. [Основание 1]
2. [Основание 2]
3. [Основание 3]

На основании статей 320, 321 Гражданского процессуального кодекса РФ,

ПРОШУ:
1. Отменить решение суда первой инстанции.
2. Принять новое решение, которым удовлетворить исковые требования.

Приложения:
1. Копия решения суда первой инстанции
2. Дополнительные доказательства

Дата: ${new Date().toLocaleDateString("ru-RU")}
Подпись: _______________ ${profile.full_name || "[ФИО]"}`;
}

function generateDocxDocument(textContent: string): Document {
  const lines = textContent.split("\n");
  const paragraphs = lines.map((line) => {
    const trimmedLine = line.trim();

    // Определяем, является ли строка заголовком (в верхнем регистре)
    const isHeading =
      trimmedLine === trimmedLine.toUpperCase() &&
      trimmedLine.length > 0 &&
      trimmedLine.length < 100 &&
      !trimmedLine.startsWith("От:") &&
      !trimmedLine.startsWith("Дата:");

    if (isHeading && trimmedLine.length > 0) {
      return new Paragraph({
        text: trimmedLine,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
      });
    }

    return new Paragraph({
      children: [new TextRun(line)],
      spacing: { after: 120 },
    });
  });

  return new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });
}

function generateXlsxDocument(textContent: string) {
  const lines = textContent.split("\n").map((line) => [line]);
  const worksheet = XLSX.utils.aoa_to_sheet(lines);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Документ");

  return workbook;
}
