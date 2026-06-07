import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { llmChat, MODEL_MAIN, isLlmConfigured } from "../_shared/llmGateway.ts";

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
    const { city, address, region } = await req.json();

    if (!isLlmConfigured()) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const prompt = `На основе следующих данных, найди и предоставь точную информацию о государственных структурах:

Город: ${city}
Регион: ${region}
Адрес регистрации: ${address}

ВАЖНО: в КАЖДОМ поле укажи ОДНО учреждение и ОДИН адрес. НЕ объединяй несколько учреждений или адресов в одном поле (без перечисления через запятую, «и», перенос строки). Не дублируй адрес.

Пожалуйста, найди и укажи:
1. Название районного отдела военного комиссариата по месту регистрации и его адрес. Для Москвы укажи именно РАЙОННЫЙ отдел по месту жительства (а не единый пункт призыва).
2. Название вышестоящего военного комиссариата (субъекта РФ) и его адрес. Для Москвы — Военный комиссариат города Москвы.

Также укажи:
3. Название районного суда по адресу военкомата
4. Название районного суда по адресу регистрации
5. Название прокуратуры района/города
6. Название и адрес взрослой районной поликлиники по адресу регистрации (к которой прикрепляются по месту жительства)
7. Название и адрес психоневрологического диспансера (ПНД), обслуживающего адрес регистрации
8. Название и адрес наркологического диспансера, обслуживающего адрес регистрации
9. Название и адрес кожно-венерологического диспансера (КВД), обслуживающего адрес регистрации

Если по какому-то пункту нет точных данных — верни пустую строку для этого поля, не выдумывай несуществующие учреждения.

Предоставь информацию в формате JSON:
{
  "military_commissariat": "название",
  "military_commissariat_address": "адрес",
  "superior_military_commissariat": "название",
  "superior_military_commissariat_address": "адрес",
  "court_by_military": "название суда",
  "court_by_registration": "название суда",
  "prosecutor_office": "название прокуратуры",
  "polyclinic": "название поликлиники",
  "polyclinic_address": "адрес поликлиники",
  "psychoneurological_dispensary": "название ПНД",
  "psychoneurological_dispensary_address": "адрес ПНД",
  "narcological_dispensary": "название наркодиспансера",
  "narcological_dispensary_address": "адрес наркодиспансера",
  "kvd": "название КВД",
  "kvd_address": "адрес КВД"
}`;

    const response = await llmChat({
      model: MODEL_MAIN,
      temperature: 0.3,
      responseFormat: "json_object",
      messages: [
        {
          role: "system",
          content:
            "Ты помощник, который помогает найти точную информацию о государственных структурах России. Отвечай строго в формате JSON без дополнительного текста.",
        },
        { role: "user", content: prompt },
      ],
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Извлекаем JSON из ответа
    let suggestions;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        suggestions = JSON.parse(content);
      }
    } catch (e) {
      console.error("Failed to parse JSON:", e);
      suggestions = {
        military_commissariat: "Не удалось определить",
        military_commissariat_address: "",
        superior_military_commissariat: "",
        superior_military_commissariat_address: "",
        court_by_military: "",
        court_by_registration: "",
        prosecutor_office: "",
        polyclinic: "",
        polyclinic_address: "",
        psychoneurological_dispensary: "",
        psychoneurological_dispensary_address: "",
        narcological_dispensary: "",
        narcological_dispensary_address: "",
        kvd: "",
        kvd_address: "",
      };
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in find-government-structures:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
