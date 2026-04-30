## Перезапись README.md

Заменю текущий README.md на подробную инструкцию на русском для локальной работы в Cursor с сохранением синхронизации с Lovable.

### Структура нового README

1. **О проекте** — краткое описание (nepriziv.ru, помощь призывникам, AI-анализ медицинских документов).
2. **Стек технологий** — React 18, Vite 5, TypeScript, Tailwind, shadcn/ui, Supabase (Auth, Storage, Edge Functions, Postgres).
3. **Требования** — Node.js 18+ или Bun, Git, аккаунт Supabase (для CLI), Cursor.
4. **Подключение к GitHub** — пошагово через Lovable Connectors (для тех, кто ещё не подключил).
5. **Локальный запуск**:
   - `git clone <repo>`
   - `bun install` (или `npm install`)
   - создание `.env` с тремя переменными:
     ```
     VITE_SUPABASE_PROJECT_ID="kqbetheonxiclwgyatnm"
     VITE_SUPABASE_URL="https://kqbetheonxiclwgyatnm.supabase.co"
     VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJI..."
     ```
   - `bun run dev` → http://localhost:8080
6. **Структура проекта** — карта основных папок (`src/pages`, `src/components`, `src/hooks`, `src/integrations/supabase`, `supabase/functions`, `supabase/migrations`).
7. **Backend (Supabase)**:
   - project ref: `kqbetheonxiclwgyatnm`
   - список Edge Functions: `chat`, `analyze-medical-document`, `analyze-diagnosis`, `generate-document`, `enhance-document`, `find-government-structures`, `import-articles`, `submit-contact`, `notify-payment-click`, `admin-users`
   - секреты, которые уже настроены на стороне Supabase (LOVABLE_API_KEY, RESEND_API_KEY и т.д.) — менять не надо.
8. **Supabase CLI (опционально)**:
   - `npm i -g supabase`
   - `supabase login`
   - `supabase link --project-ref kqbetheonxiclwgyatnm`
   - `supabase functions deploy <name>` — для ручного деплоя из Cursor
   - `supabase db push` — для применения миграций
9. **Синхронизация Lovable ↔ Cursor ↔ GitHub**:
   - правка в Cursor → `git push` → автоматически появляется в Lovable
   - правка в Lovable → автоматический коммит в GitHub → `git pull` в Cursor
   - **важно:** frontend-изменения в Lovable требуют клика "Update" в диалоге Publish, backend (edge functions, миграции) деплоятся сразу
10. **Работа с базой данных** — миграции лежат в `supabase/migrations/`, новые создавать через `supabase migration new <name>`, применять `supabase db push`.
11. **Деплой** — фронт публикуется кнопкой Publish в Lovable; backend деплоится автоматически.
12. **Полезные ссылки** — Lovable project, Supabase dashboard, GitHub docs Lovable, custom domain.
13. **Настройка email-подтверждения** — сохраню существующий блок про Confirm signup template.

### Технические детали

- Файл будет полностью на русском (текущий README — на английском).
- Использую кодовые блоки с указанием языка (`sh`, `env`, `ts`).
- Сохраню секцию про настройку email-подтверждения из текущего README.
- Не буду включать секретные ключи кроме publishable anon key (он публичный по дизайну).
- Размер ~5–7 KB.

После approve — переключусь в Build mode и перезапишу `README.md`.
