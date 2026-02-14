import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const isMoscow = city?.toLowerCase().includes("москва") || region?.toLowerCase().includes("москва");

    const prompt = `На основе следующих данных, найди и предоставь точную информацию о государственных структурах:

Город: ${city}
Регион: ${region}
Адрес регистрации: ${address}

${
  isMoscow
    ? `
ВАЖНО ДЛЯ МОСКВЫ: 
1. В поле "military_commissariat" укажи ОБА военкомата через "\\n\\n":
   - Районный военкомат по месту регистрации
   - Единый пункт призыва города Москвы
2. В поле "military_commissariat_address" укажи ОБА адреса через "\\n\\n":
   - Адрес районного военкомата
   - г. Москва, ул. Яблочкова, д. 5, стр. 5
3. Вышестоящий военкомат - Военный комиссариат города Москвы, адрес: г. Москва, Проспект Мира, д. 15, стр. 2
`
    : `
Пожалуйста, найди и укажи:
1. Название районного военного комиссариата по месту регистрации и его адрес
2. Название вышестоящего военного комиссариата (областного/регионального) и его адрес
`
}

Также укажи:
3. Название районного суда по адресу военкомата
4. Название районного суда по адресу регистрации
5. Название прокуратуры района/города

Предоставь информацию в формате JSON:
{
  "military_commissariat": "название",
  "military_commissariat_address": "адрес",
  "superior_military_commissariat": "название",
  "superior_military_commissariat_address": "адрес",
  "court_by_military": "название суда",
  "court_by_registration": "название суда",
  "prosecutor_office": "название прокуратуры"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Ты помощник, который помогает найти точную информацию о государственных структурах России. Отвечай строго в формате JSON без дополнительного текста.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
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
