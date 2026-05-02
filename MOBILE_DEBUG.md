# Отладка загрузки сайта на Android Chrome

## Симптомы
- Сайт не загружается на Android Chrome (десктоп работает)
- Прогресс-бар зависает на 1/5, чёрный экран
- При нажатии «Стоп» появляется синий спиннер (из HTML) — значит HTML грузится
- Спиннер крутится вечно — JS не загружается / React не монтируется
- Режим инкогнито — та же проблема (не кеш)

## Что было сделано (хронология коммитов)

### 1. Исходная проблема — баг `suggestions`
Коммит `455ee06`: в `LawyerChatPage.tsx` строка 570 использовала `suggestions.length`  
вместо `suggestionHistory.length`. Переменная `suggestions` не объявлена → ReferenceError  
при рендере мобильной кнопки (класс `lg:hidden` — рендерится только на мобильном).  
**Фикс** `72cc0ef`: заменил на `suggestionHistory.length`.  
→ Десктоп заработал. Мобильный — всё равно нет.

### 2. Попытки с manualChunks

**Попытка 1** (было до этой сессии, коммит `7591403`):  
Разбивка на `vendor-react` / `vendor-ecosystem` / `vendor-supabase` / `vendor-radix` + тяжёлые чанки.  
Результат: неизвестно — мобильный не тестировался отдельно.

**Попытка 2** (коммит `c8cc3b5`):  
Убрали manualChunks полностью. Vite создал два огромных `index-*.js` (466 + 491 kB).  
→ Десктоп работает. Мобильный — белый экран.

**Попытка 3** (коммит `d0ada88`):  
Один `vendor` чанк для всего (1.45 MB / 430 kB gzip) + отдельный `vendor-supabase`.  
→ Десктоп работает. Мобильный — то же самое.

**Попытка 4** (коммит `9669bc4`):  
Вернули оригинальный multi-vendor split: vendor-react (46 kB gzip), vendor-ecosystem (16 kB),  
vendor-supabase (35 kB), vendor-radix (40 kB) — параллельная загрузка по HTTP/2.  
→ Спиннер появляется. Мобильный — всё равно зависает.

### 3. Защитные меры (коммит `1587dc8`)
- Добавили HTML-спиннер в `index.html` внутри `<div id="root">` — виден до загрузки JS
- Добавили `unhandledrejection` handler в `main.tsx` для перехвата ошибок чанков
- Результат: спиннер появляется — подтвердил что HTML грузится, JS нет

### 4. Единый ErrorBoundary (коммит `ba1b094`)
Обернули ВСЁ (`QuickActionFAB`, `MobileBottomNav`, `RagChat`) в один `<ErrorBoundary>`.  
→ Не изменило поведение мобильного.

### 5. Удаление preconnect (коммит `251b268`) — последний актуальный фикс
Удалили из `index.html`:
```html
<link rel="dns-prefetch" href="https://kqbetheonxiclwgyatnm.supabase.co" />
<link rel="preconnect" href="https://kqbetheonxiclwgyatnm.supabase.co" crossorigin />
```
**Гипотеза**: известный баг Chrome Android — `preconnect crossorigin` блокирует первый рендер.  
**Статус**: запушено, результат на момент написания неизвестен.

---

## Текущее состояние кода (после всех фиксов)

### `index.html`
- HTML-спиннер внутри `<div id="root">` (CSS-анимация, без JS)
- Убраны `dns-prefetch` и `preconnect` для Supabase
- `theme-color`, мобильные мета-теги остались

### `src/main.tsx`
- `unhandledrejection` handler: перехватывает chunk load errors до монтирования React
- При первой ошибке: авто-перезагрузка (sessionStorage `chunk_reload`)
- При второй: показывает inline-сообщение "Ошибка загрузки" с кнопкой

### `src/App.tsx`
- Все страницы lazy-loaded (`React.lazy`)
- Один `<ErrorBoundary>` оборачивает ВСЁ включая `MobileBottomNav` и `QuickActionFAB`
- `ErrorBoundary` ловит ChunkLoadError → авто-reload один раз
- `QueryClient`: `staleTime: 60000, retry: 1, refetchOnWindowFocus: false`

### `vite.config.ts` (актуальное — после фикса `c0cf6cb`)
```
manualChunks (только статические зависимости entry):
  vendor-react:      142 kB (46 kB gzip)  — React, react-dom, scheduler
  vendor-ecosystem:   48 kB (16 kB gzip)  — react-router, tanstack/react-query
  vendor-supabase:   132 kB (36 kB gzip)  — @supabase/*
  vendor-radix:      122 kB (40 kB gzip)  — @radix-ui/*
  index (app):        88 kB (28 kB gzip)  — основной код приложения

Lazy chunks (грузятся только по требованию):
  jspdf.es.min-*.js:  413 kB (135 kB gzip) — jspdf
  PieChart-*.js:      363 kB ( 98 kB gzip) — recharts + d3
  DocxViewer-*.js:    417 kB (123 kB gzip) — mammoth
  html2canvas-*.js:   201 kB ( 48 kB gzip) — html2canvas
  index-*.js:         492 kB (129 kB gzip) — pdfjs-dist
  RichTextEditor-*.js: 227 kB ( 59 kB gzip) — quill
  index-BVlO*.js:     156 kB ( 47 kB gzip) — react-markdown + remark
```

---

## Диагностика production (сессия 2026-05-03)

Проведён анализ живого сайта через curl:

- **Сборка корректна**: entry chunk `index-qUKQoDYY.js` — 4 статических импорта, без pdfjs/recharts
- **Gzip работает**: `Content-Encoding: gzip` при `Accept-Encoding: gzip` заголовке
- **CDN НЕ кеширует**: отсутствует `CF-Cache-Status` в ответах Cloudflare → каждый запрос идёт на origin
- **Нет `Cache-Control` заголовков** от Lovable → браузер и CDN не могут кешировать

Добавлены улучшения (сессия 2026-05-03):
- `index.html`: `window.onerror` показывает JS-ошибки прямо на экране (до монтирования React)
- `index.html`: таймаут 20с → сообщение "загрузка занимает время" + кнопки обновить/Telegram
- `index.html`: `<script nomodule>` — сообщение об устаревшем браузере
- `index.html`: `<noscript>` fallback для отключённого JS
- `index.html`: `min-height:100svh` → `min-height:100vh` (svh не поддерживается в Chrome < 108)
- `main.tsx`: `createRoot().render()` обёрнут в try-catch → все bootstrap ошибки видимы
- `vite.config.ts`: убран `crossorigin` со ссылки на CSS (не нужен без SRI integrity)

## ✅ РЕШЕНО — коммит `c0cf6cb` (сессия 2026-05-02)

### Корневая причина: `__vite_preload` в `vendor-pdf`

**Как нашли**: запросили live HTML через curl от имени Android Chrome.  
В `index.html` обнаружили `<link rel="modulepreload">` на `vendor-pdf` (433 kB gzip)  
и `vendor-charts` (110 kB gzip) — несмотря на то, что эти чанки должны грузиться  
только лениво, при открытии конкретных страниц.

**Диагноз**: проверили скомпилированный `dist/assets/index-*.js`:
```
import{_ as w}from"./vendor-pdf-....js"   // статический импорт!
import{b as yt}from"./vendor-charts-....js"
```
Символ `_` (`vB`) в vendor-pdf — это внутренний хелпер Vite `__vite_preload`  
(~200 байт), который Rollup поместил в vendor-pdf, т.к. pdfjs-dist был первым  
и самым большим модулем, использовавшим его. Весь `manualChunks`-чанк стал  
статической зависимостью entry — и браузер тянул **1.5 MB** pdfjs на каждой странице.

**Цепочка**:
```
entry (index.js)
  → vendor-pdf (433 kB gzip) [ради 200 байт хелпера!]
    → vendor-charts (110 kB gzip)
  → vendor-react / vendor-supabase / vendor-radix / vendor-ecosystem  [нужны]
```

**Итог до фикса**: initial load = ~709 kB gzip  
**Итог после фикса**: initial load = ~166 kB gzip

### Фикс: убрать lazy-dep чанки из `manualChunks`

В `vite.config.ts` удалили группировку для `vendor-pdf`, `vendor-charts`,  
`vendor-markdown`, `vendor-editor`. Теперь Rollup сам создаёт динамические  
shared-чанки (e.g. `jspdf.es.min-*.js`, `PieChart-*.js`) — они грузятся только  
когда пользователь переходит на страницу с нужной функцией.

`manualChunks` теперь содержит только **реально статические** зависимости entry:
```
vendor-react:      46 kB gzip — react, react-dom, scheduler
vendor-ecosystem:  16 kB gzip — react-router, tanstack/react-query
vendor-supabase:   36 kB gzip — @supabase/*
vendor-radix:      40 kB gzip — @radix-ui/*
```

---

## Что ещё можно попробовать если что-то снова сломается

1. **Проверить через USB debugging**: подключить Android к компьютеру,  
   открыть `chrome://inspect/#devices` на десктопном Chrome → видно консоль мобильного.  
   Там будет точная ошибка.

2. **Lovable публикация**: проверить что в Lovable нажата кнопка "Publish/Update" —  
   по умолчанию frontend требует ручной публикации (см. CLAUDE.md).

3. **Проверить сжатие на CDN**: убедиться что Lovable CDN отдаёт gzip для мобильных  
   (открыть DevTools Network на Android через `chrome://inspect` → проверить Content-Encoding)

---

## Файлы затронутые в этой сессии
- `src/pages/LawyerChatPage.tsx` — основная функциональность + баг-фикс
- `supabase/functions/lawyer-chat-suggest/index.ts` — новая логика ИИ (фокус на последнем вопросе)
- `src/App.tsx` — ErrorBoundary, lazy loading
- `src/main.tsx` — unhandledrejection handler
- `vite.config.ts` — manualChunks (много итераций)
- `index.html` — спиннер, мета-теги, удалён preconnect
- `src/hooks/useUnreadMessages.ts` — debounce
- `src/components/Hero.tsx` — hidden md:block для фонового изображения
- `src/components/RagChat.tsx` — исключение dashboard/chat из виджета
