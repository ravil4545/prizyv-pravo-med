# AGENTS.md

Инструкции для Codex при работе с этим репозиторием (перенесено из `CLAUDE.md`, который писался для Claude Code, + актуальный статус проекта из памяти Claude на 2026-07-05).

## Обзор проекта

**nepriziv.ru** — русскоязычное веб-приложение помощи призывникам: ИИ-консультации (юридические и медицинские), генерация документов, форумы сообщества.

## Команды

```bash
bun install       # установка (Bun предпочтителен, npm тоже работает)
bun run dev        # dev-сервер, порт 8080
bun run build       # прод-сборка
npm run lint        # линт
```

Тестраннер не настроен (нет Jest/Vitest).

## Архитектура

**Фронтенд**: React 18 + TypeScript + Vite, shadcn/ui (Radix) + Tailwind CSS, React Router v6, React Query v5, React Hook Form + Zod.

**Бэкенд**: Supabase (PostgreSQL + Auth + Storage + Edge Functions на Deno). Все вызовы ИИ идут через Supabase Edge Functions с `OPENAI_API_KEY`/Groq — никогда напрямую с фронтенда.

### Ключевые директории

- `src/pages/` — 25 маршрутных страниц (публичные, auth, дашборд, медицина, админка)
- `src/components/` — общие компоненты; `src/components/ui/` — автогенерированный shadcn/ui (не рефакторить вручную)
- `src/hooks/` — `useSubscription`, `useDemoMode`, `useAnalyticsTracking`, `use-mobile`
- `src/integrations/supabase/` — **автогенерируемый** клиент и типы, не редактировать вручную
- `src/lib/` — sanitize (DOMPurify), storage (localStorage), validations (Zod), utils
- `supabase/functions/` — Deno edge-функции: `chat`, `analyze-medical-document`, `analyze-diagnosis`, `generate-document`, `enhance-document`, `find-government-structures`, `lawyer-build-plan`, `lawyer-case-assistant`, `get-context`, `send-deadline-reminders` и др.
- `supabase/migrations/` — датированные SQL-миграции

### Роутинг и навигация

Маршруты в `src/App.tsx`. Алиас пути `@/*` → `src/*`.

Три «зоны» маршрутов, у каждой своя навигационная «рамка»:
- **Публичная/маркетинг** (`/`, `/diagnoses`, `/blog`, …) — `Header` + `Footer`; мобильный `MobileBottomNav` смонтирован глобально в `App.tsx`.
- **Кабинет клиента** (`/dashboard/*`, `/medical-history`, `/medical-questionnaire`, `/profile`, и их брендовые зеркала `/u/:slug/*`) — обёрнуты в `DashboardLayout`.
- **Кабинет юриста** (`/lawyer/*`) — обёрнут в `LawyerLayout`.

**Единый источник навигации.** Навигация кабинета — В ОДНОМ конфиге на кабинет: `src/lib/cabinetNav.ts` (клиент) и `src/lib/lawyerNav.ts` (юрист). Каждый экспортирует `PRIMARY_NAV`+`SECONDARY_NAV`; layout рендерит desktop-сайдбар и мобильный таб-бар из одного списка — менять только конфиг.

**Подавление «рамки».** Внутри кабинета сайтовый `Header`/`Footer` и глобальный `MobileBottomNav` возвращают `null` (`isCabinetPath`/`isLawyerPath` из конфигов навигации).

### Поток данных

1. React Query читает из Supabase JS SDK (`.select()`, `.eq()`, `.order()`)
2. Мутации — `.insert()`/`.update()`/`.delete()`, RLS проверяет права на сервере
3. ИИ-функции — POST на edge-функции `supabase/functions/<name>` с CORS
4. Медицинский ИИ-контекст автоматически подгружается из загруженных пользователем документов и статей о заболеваниях

**ПРАВИЛО (2026-06-25, было причиной «молчащей» аналитики):** в supabase-js v2 билдер `.insert()`/`.update()` ленивый — без `await`/`.then()` запрос НЕ отправляется. Любой fire-and-forget insert обязан иметь `.then()` или `await`.

### Auth и подписки

- Supabase Auth (email/password + анонимный)
- `user_roles` — доступ админа
- `user_subscriptions` — платные квоты
- Бесплатный демо-тариф: 3 ИИ-вопроса + 3 загрузки документов (`useDemoMode()` + localStorage)
- Публичный ИИ-чат без логина: `/ai` (3 бесплатных вопроса, localStorage `nepriziv_ai_public_count`)

### Ключевые таблицы БД

`profiles`, `user_subscriptions`, `user_roles`, `medical_documents_v2`, `document_article_links`, `disease_articles_565`, `forum_posts`, `forum_comments`, `blog_posts`, `testimonials`, `analytics_events`, `lawyer_clients`, `lawyer_client_med_docs`, `case_events`, `case_notes`, `examination_plan_items`, `action_plan_items`, `llm_usage_daily`.

### Стили

Дизайн-токены — HSL CSS-переменные в `src/index.css`. Тёмная тема через класс `.dark`. Radius `0.75rem`.

**НЕ использовать `backdrop-blur`/`backdrop-filter` в кабинетах** (клиент `/dashboard,/profile,/medical-*`, юрист `/lawyer/*`, админ `/admin/*`) — вызывает мерцание на слабых мобильных GPU. Есть страховка в CSS (`.cabinet-shell [class*="backdrop-blur"]{backdrop-filter:none!important}`), но новый код всё равно не должен его добавлять. На публичных/лендинговых страницах glassmorphism оставлен намеренно.

### Переменные окружения

`.env` содержит публичные ключи Supabase (можно коммитить). Секреты бэкенда (`OPENAI_API_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY`) — только в Supabase Dashboard secrets.

### Деплой (ВАЖНО, модель проверена на практике)

- Фронт публикуется через Lovable UI — нужен ручной клик **Publish/Update** после изменений кода.
- Edge-функции и миграции БД: **вопреки первоначальному предположению, НЕ всегда авто-деплоятся при `git push`**. Надёжный способ — деплой вручную: `supabase functions deploy <name>` (залинкованный CLI, project-ref `kqbetheonxiclwgyatnm`) и `apply_migration`/`supabase db push` для миграций. Перед тем как считать что-то «задеплоенным», проверять факт напрямую (`list_tables`/`list_edge_functions`/curl по функции), не доверять истории миграций в репо.
- **Прод-деплой (push в main, применение миграций, деплой функций) — только с явного разрешения пользователя на каждое конкретное действие.** Обычно работа ведётся в feature-ветках, ждущих ревью.
- Живой сайт: https://nepriziv.ru

### Lovable ↔ GitHub sync

Двусторонний синк: пуш в репо → появляется в Lovable; правки в Lovable → авто-коммитятся в GitHub.

## RAG / «Второй мозг» (база знаний ИИ)

Экспертная база знаний юриста живёт в Obsidian-волте **`D:\Obsidian\SecondBrain`** — единственный канонический источник (заболевания, юр.процедуры, документооборот, FAQ+консультации в `14_FAQ/Консультации`, расписание болезней, прецеденты в `60_Прецеденты`). Читают ОБА потребителя: сайт (этот ingest → Supabase) и локальный агент Hermes (`hermes-tools/rag_pipeline.py`). **Правило волта: НИКАКИХ отсылок к CRM (amocrm/deal_id/voennik365) и ПДн** — оригиналы с идентификаторами лежат в `D:\Obsidian\Main\amoCRM_Кейсы`, в RAG не попадают.

**Конвейер:** `scripts/ingest_rag.py` читает волт → строгая проверка всего корпуса → пакетные эмбеддинги Jina v3 (1024 dims) → `rag_chunks_staging` → проверка количества → атомарная публикация в `rag_chunks`. Активная база не очищается до готовности новой сборки.
- `rag_chunks` — активные чанки знаний с `source_path`, `source_title`, `content_hash`, `build_id` и секционными `schedule_articles`. **`category` строго по папке волта** (см. `FOLDER_CATEGORY`, ручной frontmatter не главнее). 14 категорий: `medical_condition`, `legal_procedure`, `document_guide`, `faq`, `schedule_rb`, `rb_official`, `reference`, `strategy`, `web_source`, `case`, `doctor_qa`, `consultation`, `transcript`, `precedent`.
- `rag_builds` — журнал полных и точечных публикаций; `rag_chunks_staging` — временная сборка, не обслуживает пользовательские запросы.
- `rag_system_context` — 5 фундаментальных блоков, включаются в каждый промпт.
- `rag_index` (VIEW) — оглавление файл→категория→статьи.
- Навигационные файлы (`_MOC_*`, `Home`, `README`, `00_Index`, `00_Start_Here`, `00_Home`) не индексируются.
- **ПДн-гейт (152-ФЗ):** `check_pii` детектит телефон/email/CRM-ссылки/ФИО и блокирует файл в ЛЮБОЙ категории. Таблицы/RPC RAG не доступны `anon` и `authenticated` напрямую; все потребители работают через edge-функции с `service_role`.
- Поиск (гибрид, дефолт): RPC `hybrid_rag_chunks` — Postgres FTS по заголовку/тегам/секции/тексту + pgvector, RRF-слияние. Документы индексируются как `retrieval.passage`, запросы — `retrieval.query`; `query_embedding` опционален (NULL → FTS-only).
- Поиск (вектор, откат): RPC `match_rag_chunks`.
- Вектор-индекс: HNSW (`vector_cosine_ops`, m=16, ef_construction=64).

Ключи — из env или gitignored `scripts/ingest.secrets.env`. НЕ хардкодить.

**Где используется** (общий модуль `supabase/functions/_shared/ragSearch.ts`): `chat-rag` (публичный виджет «База знаний»), `chat` (клиентский ИИ), `analyze-medical-document` (сверка требований по статьям), `lawyer-case-assistant`/`lawyer-build-plan` (инструмент `search_knowledge`).

**Пополнение базы.** Доменный факт о призыве → должен попасть В ВОЛТ, не только в память ассистента: `scripts/add_note.py --category <...> --title "…" --articles NN --content "…"` либо вручную `.md` с frontmatter. Перед публикацией: `python scripts/audit_rag.py` и `python scripts/ingest_rag.py --dry-run`. Полная публикация: `python scripts/ingest_rag.py`; точечная: `python scripts/ingest_rag.py --match=<путь>`. Затем `python scripts/build_index.py` и отдельный реиндекс Hermes. Retrieval-регрессии проверяются `python scripts/eval_rag.py`.

## Groq / LLM-архитектура (5-агентная оркестрация, частично на нестабильной ветке)

Текстовые агенты переведены на Groq (llama-3.3-70b) через общий `_shared/llmGateway.ts`; vision-функции (`analyze-medical-document`, `parse-summons`, `enhance-document`) остаются на Gemini (Groq картинки не читает). **Правило для function-calling схем под Groq/llama:** НЕ объявлять `integer`/`number` параметры инструментов — модель может вернуть их строкой и Groq строго валидирует схему; только `string` + парсинг в коде.

Context Bundle (`_shared/contextBundle.ts`) собирает контекст клиента/юриста для агентов; инструменты — `_shared/agentTools.ts` (`search_rb`, `get_rb_article`, `read_document`, `update_examination_plan`, `update_action_plan` и др., запись только через `source='ai'`, якорь контекста берётся из проверенного `ToolContext`, не из модели).

## Известные риски безопасности / гигиена (актуально на момент последнего аудита)

- `/admin/*` защищён только RLS таблиц — фронтовый route guard добавлен (`AdminGuard`), но проверять актуальность.
- Утечка медданных во внешний LLM без фиксации согласия по 152-ФЗ — есть `PdnConsentGate`/`pdn_consent_at`, проверять что влито в main.
- Leaked Password Protection в Supabase Auth отключена (требует тариф Pro, проект на Free) — принято решение оставить.
- Артефакт-таблица `public."ravil4545@gmail.com"` в БД — мусор, кандидат на удаление (уточнить у пользователя перед DELETE).

## Аналитика

Яндекс.Метрика (счётчик `109765864`), Webvisor включён с маскировкой медданных классом `ym-hide-content` на всех layout-ах кабинетов и лентах ИИ-чатов — **менять Webvisor только сохраняя эти маски**. Свой трекинг кликов (`initClickTracking`) → `analytics_events`. Админ-раздел «Поведение» (`AdminBehavior.tsx`).

## Текущий статус доработок (снимок на 2026-07-05, может устареть — сверяться с git log/Supabase)

Основная ветка разработки — `main`, репозиторий `github.com/ravil4545/prizyv-pravo-med`. Крупные пройденные этапы: security-фиксы (IDOR), целостность связки клиент↔юрист, эскалация ИИ→юрист, Groq LLM-фундамент + 5-агентная оркестрация (планировщик/ассистент юриста), модернизация кабинетов (сайдбар, лента дела, realtime), SEO-prerender per-route, воронка конверсии (публичный `/ai`, упрощение регистрации), фикс «молчащей» аналитики, единый второй мозг для сайта+Hermes. Несколько веток/миграций на момент записи ждали ручного деплоя/подтверждения владельца — перед стартом работы стоит проверить актуальное состояние через `git log`, `git status` и Supabase (`list_migrations`, `list_edge_functions`), а не полагаться на этот снимок.
