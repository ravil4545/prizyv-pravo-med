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
- Lovable AI Gateway (модели Google Gemini, OpenAI) — через секрет `LOVABLE_API_KEY`

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

Список развёрнутых функций (`supabase/functions/<name>/index.ts`):

| Функция | Назначение |
|---|---|
| `chat` | AI-чат помощника (Lovable AI Gateway) |
| `analyze-medical-document` | Анализ загруженных медицинских документов |
| `analyze-diagnosis` | Анализ диагноза по Расписанию болезней |
| `generate-document` | Генерация юридических документов |
| `enhance-document` | Улучшение/доработка готового документа |
| `find-government-structures` | Поиск контактов госорганов |
| `import-articles` | Импорт статей в блог |
| `submit-contact` | Обработка формы обратной связи |
| `notify-payment-click` | Логирование клика по кнопке оплаты |
| `admin-users` | Админские операции с пользователями |

### Секреты (уже настроены в Supabase)

Менять их не нужно — они хранятся на стороне Supabase и доступны функциям через `Deno.env.get('...')`:

- `LOVABLE_API_KEY` — доступ к AI Gateway
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

## 11. Настройка email-подтверждения (Supabase)

Тема и текст письма подтверждения регистрации настраиваются в Supabase Dashboard:

1. **Authentication → Email Templates → Confirm signup**
2. Задайте:
   - **Subject**: `nepriziv.ru подтверждение регистрации`
   - В теле письма используйте фразу: `nepriziv.ru подтверждение регистрации`
3. Сохраните изменения.

---

## 12. Полезные ссылки

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
