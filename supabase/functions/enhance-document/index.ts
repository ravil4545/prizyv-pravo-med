import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const getAllowedOrigin = () => {
  const origin = Deno.env.get("ALLOWED_ORIGIN");
  return origin || "*";
};

const corsHeaders = {
  'Access-Control-Allow-Origin': getAllowedOrigin(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: true, message: 'Image base64 is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Clean base64 if it has data URL prefix
    let cleanBase64 = imageBase64;
    if (imageBase64.includes(',')) {
      cleanBase64 = imageBase64.split(',')[1];
    }

    // Detect image type from base64 or default to jpeg
    let mimeType = 'image/jpeg';
    if (imageBase64.startsWith('data:image/png')) {
      mimeType = 'image/png';
    } else if (imageBase64.startsWith('data:image/webp')) {
      mimeType = 'image/webp';
    }

    console.log('Sending image for enhancement, size:', Math.round(cleanBase64.length / 1024), 'KB');

    const prompt = `СТРОГО ЗАПРЕЩЕНО: Генерировать, изменять, добавлять или удалять ЛЮБОЙ текст, печати, подписи, штампы или другое содержимое документа! Ты ТОЛЬКО улучшаешь визуальное качество изображения, НЕ изменяя содержимое.

Преобразуй эту фотографию медицинского документа в качественный скан:

КРИТИЧНО - ОБРЕЗКА:
- Обрежи изображение ТОЧНО по краям бумаги документа
- Удали ВСЁ что находится за пределами листа бумаги: стол, руки, другие предметы, фон
- На итоговом изображении должен быть ТОЛЬКО сам документ, ничего вокруг

ВЫРАВНИВАНИЕ:
- Если документ сфотографирован под углом, выровняй его до прямоугольной формы
- Текст должен быть горизонтальным

БУМАГА И ФОН:
- Сделай бумагу документа белой и однородной
- Полностью удали все тени, блики, отражения света
- Убери следы от фотографирования

УЛУЧШЕНИЕ КАЧЕСТВА (БЕЗ изменения содержимого!):
- Повысь резкость и контрастность СУЩЕСТВУЮЩЕГО текста
- Улучши читаемость СУЩЕСТВУЮЩИХ печатей и штампов
- Сохрани ОРИГИНАЛЬНЫЕ цвета печатей (синий, фиолетовый)

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:
- Придумывать или добавлять текст
- Генерировать новые печати или штампы
- Изменять существующий текст
- Добавлять элементы, которых нет в оригинале

Результат: чистый белый документ с улучшенной читаемостью ОРИГИНАЛЬНОГО содержимого.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${cleanBase64}`
                }
              }
            ]
          }
        ],
        modalities: ['image', 'text']
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: true, message: 'Слишком много запросов, подождите минуту' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received');

    // Extract enhanced image from response
    const enhancedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!enhancedImageUrl) {
      console.log('No enhanced image in response, returning original');
      return new Response(
        JSON.stringify({ 
          success: true, 
          enhancedBase64: `data:${mimeType};base64,${cleanBase64}`,
          wasEnhanced: false,
          message: 'Изображение уже хорошего качества'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Image enhanced successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        enhancedBase64: enhancedImageUrl,
        wasEnhanced: true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Enhancement error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: true, message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
