# nepriziv.ru — проект помощи призывникам

Веб-приложение для помощи призывникам в защите своих прав: AI-анализ медицинских документов, генерация юридических документов, база диагнозов, форум, блог, личный кабинет с подпиской.

- **Lovable Project**: https://lovable.dev/projects/50740c09-a321-485c-ac20-c8d60273fcfa
- **Production**: https://nepriziv.ru
- **Preview (Lovable)**: https://nepriziv.lovable.app

---

## 1. Стек технологий

**Frontend**
- React 18 + TypeScript 5
- Vite 5 (dev-сервер и сборка)
- Tailwind CSS v3 + shadcn/ui (Radix UI)
- React Router, React Query, React Hook Form + Zod

**Backend (Supabase)**
- Postgres + Row Level Security
- Supabase Auth (email/password, anonymous sign-in)
- Supabase Storage (медицинские документы)
- Edge Functions (Deno) — серверная логика и интеграции с AI

**AI**
- OpenAI API — через секрет `OPENAI_API_KEY` в Supabase Edge Functions

---

## 2. Требования к окружению

- **Node.js 18+** или **Bun 1.0+** (рекомендуется Bun — быстрее)
- **Git**
- **Cursor** (или любой другой IDE)
- Опционально: **Supabase CLI** — если нужно деплоить edge-функции и миграции вручную из локального окружения

---

## 3. Подключение проекта к GitHub (если ещё не сделано)

1. В Lovable откройте боковую панель → **Connectors** → **GitHub** → **Connect project**.
2. Авторизуйте Lovable GitHub App.
3. Выберите аккаунт/организацию → **Create Repository**.
4. Lovable создаст репозиторий и начнёт двустороннюю синхронизацию.

---

## 4. Локальный запуск в Cursor

```sh
# 1. Клонируйте репозиторий
git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ>
cd <ИМЯ_ПАПКИ>

# 2. Установите зависимости (рекомендуется Bun)
bun install
# или: npm install

# 3. Создайте файл .env в корне проекта
```

Содержимое `.env`:

```env
VITE_SUPABASE_PROJECT_ID="kqbetheonxiclwgyatnm"
VITE_SUPABASE_URL="https://kqbetheonxiclwgyatnm.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxYmV0aGVvbnhpY2x3Z3lhdG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMjgxNjAsImV4cCI6MjA3NDkwNDE2MH0.EETf8kfnnN9NgEj_PKup1cLuZbtORz3RjxWuY65KwlI"
```

> Эти ключи **публичные** (anon key защищён через RLS-политики на стороне Supabase) — их безопасно хранить в репозитории. Service-role key в проект не попадает.

**Переключение окружения — только через `.env`.** Адрес Supabase и ключ читаются из одного места, [`src/lib/supabaseConfig.ts`](src/lib/supabaseConfig.ts): оттуда их берут и клиент, и плагин пре-рендера, и все прямые `fetch` к edge-функциям (через хелпер `functionUrl(name)`). Если `.env` нет — подставляются значения облачного проекта, поэтому сборка в Lovable работает без него.

Раньше адрес и ключ были захардкожены в тринадцати местах, и правка `.env` переключала окружение лишь частично: часть приложения продолжала ходить в облако. Чтобы это не вернулось, за файлами следит тест [`tests/supabaseConfig_test.ts`](tests/supabaseConfig_test.ts) — он падает, если адрес или ключ снова появились в `src/` мимо `supabaseConfig`. Это особенно важно для `src/integrations/supabase/client.ts`: его генерирует Lovable, и при перегенерации он вернёт хардкод обратно.

```sh
# 4. Запустите dev-сервер
bun run dev
# или: npm run dev
```

Откроется по адресу **http://localhost:8080**.

---

## 5. Структура проекта

```
nepriziv/
├── src/
│   ├── pages/                  # Страницы (роуты): Index, Dashboard, AuthPage, MedicalDocumentsPage, ...
│   ├── components/             # UI-компоненты
│   │   ├── ui/                 # shadcn/ui примитивы
│   │   └── profile/            # Формы профиля (личные данные, диагнозы, образование)
│   ├── hooks/                  # Кастомные хуки (useDemoMode, useSubscription, useAnalyticsTracking)
│   ├── integrations/supabase/  # Сгенерированный клиент и типы (НЕ редактировать вручную)
│   ├── lib/                    # Утилиты (sanitize, storage, validations, typography)
│   ├── App.tsx                 # Роутинг
│   └── index.css               # Дизайн-система (HSL-токены, градиенты, тени)
├── supabase/
│   ├── functions/              # Edge Functions (Deno)
│   ├── migrations/             # SQL-миграции БД (применяются по порядку)
│   └── config.toml             # Конфигурация Supabase
├── public/                     # Статика (robots.txt, sitemap.xml, иконки)
├── tailwind.config.ts          # Конфиг Tailwind (использует токены из index.css)
└── vite.config.ts              # Конфиг Vite (порт 8080, alias @/* → src/*)
```

---

## 6. Backend (Supabase)

**Project ref**: `kqbetheonxiclwgyatnm`
**Dashboard**: https://supabase.com/dashboard/project/kqbetheonxiclwgyatnm

### Edge Functions

Развёрнуто 30 функций, полный список — в `supabase/functions/`. Основные:

| Функция | Назначение |
|---|---|
| `chat` | AI-чат помощника (OpenAI API) |
| `chat-rag` | Публичный виджет «База знаний» поверх RAG |
| `case-review` | Публичный разбор дела за 3 минуты |
| `analyze-medical-document` | Анализ загруженных медицинских документов |
| `analyze-diagnosis` | Анализ диагноза по Расписанию болезней |
| `questionnaire-analyze` | Разбор медицинского опросника |
| `generate-document` | Генерация юридических документов |
| `generate-appeal` | Черновик жалобы на решение призывной комиссии |
| `parse-summons` | Распознавание повестки по фото |
| `enhance-document` | Фото документа → чистый скан |
| `find-government-structures` | Поиск контактов госорганов |
| `lawyer-*` | Агенты кабинета юриста (план дела, ассистент, подсказки) |
| `sitemap` | Карта сайта |

**Два общих правила для любой новой функции.**

*CORS.* Origin проверяется по белому списку из [`_shared/cors.ts`](supabase/functions/_shared/cors.ts) — `resolveOrigin(req)` возвращает `null` для чужих доменов, и в заголовок уходит строка `"null"` («никому»). Никогда не пишите `origin || "*"`: раньше так и было, и функции возвращали `Access-Control-Allow-Origin` с доменом атакующего. За этим следит отдельная задача CI (`cors-guard`).

*Суточный лимит.* Дорогие ИИ-вызовы закрыты предохранителем [`_shared/aiGuard.ts`](supabase/functions/_shared/aiGuard.ts) — `enforceDailyLimit()` возвращает готовый ответ 429 либо `null`. Ключ — пользователь, если запрос авторизован, и хеш IP, если нет (лимит по IP наказывал бы соседей по общему NAT). При сбое БД запрос пропускается: отказать человеку из-за сбоя счётчика хуже, чем пропустить лишний вызов.

| Функция | Лимит/сутки | Переменная окружения |
|---|---|---|
| `analyze-medical-document` | 40 | `ANALYZE_DOCUMENT_MAX_PER_DAY` |
| `questionnaire-analyze` | 30 | `QUESTIONNAIRE_ANALYZE_MAX_PER_DAY` |
| `enhance-document` | 30 | `ENHANCE_DOCUMENT_MAX_PER_DAY` |
| `parse-summons` | 20 | `PARSE_SUMMONS_MAX_PER_DAY` |
| `generate-appeal` | 15 | `GENERATE_APPEAL_MAX_PER_DAY` |

### Секреты (уже настроены в Supabase)

Менять их не нужно — они хранятся на стороне Supabase и доступны функциям через `Deno.env.get('...')`:

- `OPENAI_API_KEY` — доступ к OpenAI API для AI-функций
- `OPENAI_MODEL_MAIN`, `OPENAI_MODEL_FAST`, `OPENAI_MODEL_VISION`, `OPENAI_MODEL_VISION_FAST` — модели OpenAI для основного, быстрого и vision-сценариев
- `RESEND_API_KEY` — отправка писем
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — авто-инжектируются Supabase

Управление: https://supabase.com/dashboard/project/kqbetheonxiclwgyatnm/settings/functions

---

## 7. Supabase CLI (опционально, для деплоя из Cursor)

```sh
# Установка
npm install -g supabase

# Авторизация
supabase login

# Привязка к проекту
supabase link --project-ref kqbetheonxiclwgyatnm

# Деплой одной edge-функции
supabase functions deploy chat

# Деплой всех функций
supabase functions deploy

# Применить миграции БД
supabase db push

# Создать новую миграцию
supabase migration new <название_миграции>
```

> Если работаете только через Lovable + GitHub, CLI не обязателен — backend деплоится автоматически при пуше.

---

## 8. Синхронизация Lovable ↔ Cursor ↔ GitHub

Двусторонняя синхронизация работает в реальном времени:

- **Cursor → Lovable**: `git push` в основную ветку → изменения автоматически появляются в Lovable.
- **Lovable → Cursor**: правки в Lovable автоматически коммитятся в GitHub → `git pull` в Cursor.

### Важно про деплой

| Тип изменений | Как попадает в production |
|---|---|
| **Frontend** (React, CSS, компоненты) | Требуется клик **Publish → Update** в Lovable |
| **Backend** (edge functions, миграции) | Деплоится **автоматически** при коммите |

### Рекомендации

- Не работайте одновременно в Lovable и Cursor над одними и теми же файлами — будут конфликты.
- Перед началом работы в Cursor: `git pull`.
- Используйте feature-ветки для крупных изменений, мерджите через PR.

---

## 9. База данных

- Все миграции лежат в `supabase/migrations/` и применяются по порядку имени файла.
- Новую миграцию создавайте через `supabase migration new <name>` — будет создан пустой `.sql` файл с timestamp.
- Применяйте: `supabase db push` (требует `supabase link`).
- **Экспорт данных**: Supabase Dashboard → Database → Tables → Export (CSV).
- **Типы для TypeScript** (`src/integrations/supabase/types.ts`) генерируются автоматически — не редактируйте вручную.

---

## 10. Деплой

- **Frontend**: в Lovable нажмите **Publish** (десктоп — справа вверху, мобильный — снизу справа в режиме Preview).
- **Backend**: edge-функции и миграции применяются автоматически.
- **Custom domain**: Project → Settings → Domains → Connect Domain.

---

## 11. Тесты и CI

Тестов на React-компоненты нет — покрыта чистая логика, вынесенная из страниц в `src/lib/`, и общие модули edge-функций. Раннер — Deno (тот же, что и у функций), поэтому отдельный Jest/Vitest не нужен.

```sh
npm test          # весь набор из tests/
deno check supabase/functions/**/index.ts   # типы edge-функций
```

**`tsc` НЕ видит `supabase/functions`** — они не входят в `tsconfig` и исполняются в Deno. Ошибки там ловит только `deno check`, поэтому в CI это отдельный шаг.

Разрешения Deno заданы ровно в одном месте — в скрипте `test` из `package.json`. CI зовёт `npm test`, а не свою строку с флагами: когда они дублировались, набор разрешений разъехался и часть тестов падала только на CI.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) на каждый push и PR:

| Задача | Что делает |
|---|---|
| `frontend` | `tsc --noEmit`, `eslint`, `vite build` |
| `functions` | `deno check` по всем функциям + `npm test` |
| `cors-guard` | Падает, если в функциях снова появился `origin \|\| "*"`, литерал `"*"` или проверка Origin через `includes("lovable` |

Линтер пока с `continue-on-error`: в проекте накоплено около 250 замечаний, и жёсткая проверка блокировала бы все PR. Снять флаг стоит после разбора долга.

---

## 12. Перенос на свой сервер

Материалы — в папке [`selfhost/`](selfhost/): скрипт переноса файлов Storage, шаблоны `Caddyfile`, конфига Cloudflare Tunnel и `.env`, скрипт резервного копирования. Порядок действий — в `selfhost/README.md`.

---

## 13. Настройка email-подтверждения (Supabase)

Тема и текст письма подтверждения регистрации настраиваются в Supabase Dashboard:

1. **Authentication → Email Templates → Confirm signup**
2. Задайте:
   - **Subject**: `nepriziv.ru подтверждение регистрации`
   - В теле письма используйте фразу: `nepriziv.ru подтверждение регистрации`
3. Сохраните изменения.

---

## 14. Полезные ссылки

- **Lovable Project**: https://lovable.dev/projects/50740c09-a321-485c-ac20-c8d60273fcfa
- **Supabase Dashboard**: https://supabase.com/dashboard/project/kqbetheonxiclwgyatnm
- **SQL Editor**: https://supabase.com/dashboard/project/kqbetheonxiclwgyatnm/sql/new
- **Edge Functions**: https://supabase.com/dashboard/project/kqbetheonxiclwgyatnm/functions
- **Auth Users**: https://supabase.com/dashboard/project/kqbetheonxiclwgyatnm/auth/users
- **Storage**: https://supabase.com/dashboard/project/kqbetheonxiclwgyatnm/storage/buckets
- **Lovable Docs — GitHub Integration**: https://docs.lovable.dev/integrations/github
- **Lovable Docs — Custom Domain**: https://docs.lovable.dev/features/custom-domain

---

## Лицензия

Внутренний проект. Все права защищены.
