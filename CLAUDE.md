# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nepriziv.ru** — a Russian-language web app helping military conscripts with AI-powered legal and medical consultation, document generation, and community forums.

## Commands

```bash
# Install (Bun preferred, npm works)
bun install

# Dev server (port 8080)
bun run dev

# Production build
bun run build

# Lint (~250 pre-existing errors; CI runs it with continue-on-error)
npm run lint

# Tests — Deno, not Jest/Vitest
npm test

# Type-check edge functions. tsc does NOT see supabase/functions
# (not in tsconfig, Deno runtime) — only this catches errors there.
deno check supabase/functions/**/index.ts
```

**Tests live in [tests/](tests/) and run on Deno** — the same runtime as the edge functions, so no second test toolchain is needed. They cover pure logic extracted from pages into `src/lib/` plus the shared edge-function modules; React components are not covered.

Deno permissions are declared in **one** place — the `test` script in `package.json`. CI calls `npm test` rather than its own flag string: when the two were duplicated they drifted, and some tests passed locally but failed on CI for missing `--allow-read`.

When you move logic out of a page to make it testable, put the module in `src/lib/` and the test in `tests/<name>_test.ts`. Do **not** put Deno test files under `src/` — that breaks both `tsc` and `vite build`.

## Architecture

**Frontend**: React 18 + TypeScript + Vite, shadcn/ui (Radix) + Tailwind CSS, React Router v6, React Query v5, React Hook Form + Zod.

**Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions in Deno). All AI calls go through Supabase Edge Functions using `OPENAI_API_KEY` — never directly from the frontend.

### Key Directories

- [src/pages/](src/pages/) — 25 route pages (public, auth, dashboard, medical, admin)
- [src/components/](src/components/) — shared components; [src/components/ui/](src/components/ui/) is auto-generated shadcn/ui (don't manually refactor)
- [src/hooks/](src/hooks/) — `useSubscription`, `useDemoMode`, `useAnalyticsTracking`, `use-mobile`
- [src/integrations/supabase/](src/integrations/supabase/) — **auto-generated** types, do not edit manually. `client.ts` is also generated, but carries one deliberate manual edit: it imports the URL and key from `@/lib/supabaseConfig` instead of hardcoding them (see «Supabase configuration» below)
- [src/lib/](src/lib/) — sanitize (DOMPurify), escapeHtml, storage, validations (Zod), utils, and the logic extracted from oversized pages (see below)
- [selfhost/](selfhost/) — scripts and config templates for moving off Supabase Cloud onto the owner's own machine

### Supabase configuration — single source

The project URL and anon key come from **[`src/lib/supabaseConfig.ts`](src/lib/supabaseConfig.ts) only**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `functionUrl(name)` for direct `fetch` to edge functions (needed where the response is an SSE stream — `supabase.functions.invoke` buffers the whole body in the browser).

Values are read from the environment, with the cloud project's values as a fallback so the Lovable build works without a local `.env`.

They used to be hardcoded in thirteen places, which meant editing `.env` switched the environment only partially — half the app kept talking to the cloud. [`tests/supabaseConfig_test.ts`](tests/supabaseConfig_test.ts) fails if a Supabase URL or anon key reappears anywhere under `src/`. This matters most for `client.ts`: Lovable regenerates it and will put the hardcoded constants back.

### Modules extracted from `MedicalDocumentsPage`

The page was 2834 lines and nothing in it could be tested — importing it pulls in pdfjs, jsPDF and half of shadcn/ui. Reach for these instead of re-implementing:

- [`medicalDocumentTypes.ts`](src/lib/medicalDocumentTypes.ts) — shared types
- [`documentSort.ts`](src/lib/documentSort.ts) — filter, sort, «what to do next» summary, category badge variant
- [`imagePipeline.ts`](src/lib/imagePipeline.ts) — photo/PDF → JPEG → compress → build PDF; sets up the pdfjs worker itself
- [`documentExport.ts`](src/lib/documentExport.ts) — download, save extracted text, print window
- [`escapeHtml.ts`](src/lib/escapeHtml.ts) — **use this whenever HTML is assembled as a string.** The print window interpolated the document title straight into markup, and the title comes from the uploaded filename; the window inherits the site origin along with the Supabase session in localStorage

Fitness categories (А/Б/В/Г/Д) live in [`fitnessCategories.ts`](src/lib/fitnessCategories.ts) and are the single source for their meaning and colour. Note the semantics: **В and Д are the desired outcome** for a conscript — do not paint them red.
- [supabase/functions/](supabase/functions/) — Deno edge functions: `chat`, `analyze-medical-document`, `analyze-diagnosis`, `generate-document`, `enhance-document`, `find-government-structures`, etc.
- [supabase/migrations/](supabase/migrations/) — timestamped SQL migrations

### Routing & Navigation

Routes are defined in [src/App.tsx](src/App.tsx). Path alias `@/*` maps to `src/*`.

There are three route zones, each with its own "chrome" (navigation shell):

- **Public / marketing** (`/`, `/diagnoses`, `/blog`, …) — render the site [`Header`](src/components/Header.tsx) + [`Footer`](src/components/Footer.tsx); a mobile [`MobileBottomNav`](src/components/MobileBottomNav.tsx) is mounted globally in `App.tsx`.
- **Client cabinet** (`/dashboard/*`, `/medical-history`, `/medical-questionnaire`, `/profile`, and their `/u/:slug/*` branded mirrors) — wrapped in [`DashboardLayout`](src/components/DashboardLayout.tsx).
- **Lawyer cabinet** (`/lawyer/*`) — wrapped in [`LawyerLayout`](src/components/LawyerLayout.tsx).

**Single source of nav.** Cabinet navigation lives in ONE config per cabinet:
[`src/lib/cabinetNav.ts`](src/lib/cabinetNav.ts) (client) and [`src/lib/lawyerNav.ts`](src/lib/lawyerNav.ts) (lawyer). Each exports `PRIMARY_NAV` + `SECONDARY_NAV`. The layout renders **both** views from that one list:
- **Desktop:** a left sidebar (`hidden md:flex`) — primary items, divider, secondary items, account/logout.
- **Mobile:** a bottom tab bar — the 4 `PRIMARY_NAV` items + an «Ещё» tab that opens a `Sheet` listing `SECONDARY_NAV` + account.

So desktop and mobile navigation can never drift — **to add/rename/reorder a cabinet item, edit only the config.** Touch targets are ≥44px, labels ≥11px, with `env(safe-area-inset-bottom)`.

**Chrome suppression.** Inside a cabinet, the site `Header`/`Footer` and the global `MobileBottomNav` return `null` (so there's no double navigation) — they early-return on `isCabinetPath(pathname)` / `isLawyerPath(pathname)` (exported from the two nav configs). The `*Layout` is then the only chrome. `isCabinetPath` matches the DashboardLayout routes above (and `/u/:slug` mirrors); `isLawyerPath` matches `/lawyer(/*)` but NOT the public `/lawyers` catalog.

Branded `/u/:slug/*` links are resolved with [`withBrandPath`](src/lib/brandPath.ts); nav items with `external: true` (e.g. the public lawyer catalog) are not brand-prefixed.

### Data Flow

1. React Query fetches from Supabase JS SDK (`.select()`, `.eq()`, `.order()`)
2. Mutations use `.insert()`, `.update()`, `.delete()` — RLS policies enforce auth server-side
3. AI features POST to edge functions at `supabase/functions/<name>` with CORS headers
4. Medical AI context is auto-loaded from the user's uploaded documents and disease articles

### Edge-function rules — apply to every new function

**CORS.** Resolve the Origin through the shared whitelist in [`_shared/cors.ts`](supabase/functions/_shared/cors.ts): `resolveOrigin(req) ?? "null"`. The string `"null"` means «nobody» — the browser will not hand the response to a foreign page. Never write `origin || "*"`; that is what the code used to do, and functions were echoing the attacker's Origin back. The `cors-guard` CI job fails the build if that pattern returns.

**Daily limit on expensive calls.** Wrap them in `enforceDailyLimit()` from [`_shared/aiGuard.ts`](supabase/functions/_shared/aiGuard.ts) — it returns a ready 429 `Response` or `null`. Key by user when the request is authenticated, by IP hash otherwise: an IP-only limit punishes everyone behind a shared NAT (dorm, office, mobile carrier). Raw IPs are never stored. It fails **open** — a database outage lets the request through, because denying someone their document analysis over a broken counter is worse than one extra call. Limits are overridable per function via env vars (see README).

**Do not trust `verify_jwt`.** `analyze-medical-document` and `enhance-document` run with `verify_jwt = false` in `config.toml`; the first checks the token itself, the second has no auth at all and is therefore the most exposed expensive endpoint.

### Auth & Subscriptions

- Supabase Auth (email/password + anonymous)
- `user_roles` table controls admin access
- `user_subscriptions` table controls paid quotas
- Free demo tier: 3 AI questions + 3 document uploads, tracked via `useDemoMode()` + localStorage

### Key Database Tables

`profiles`, `user_subscriptions`, `user_roles`, `medical_documents_v2`, `document_article_links`, `disease_articles_565`, `forum_posts`, `forum_comments`, `blog_posts`, `testimonials`, `analytics_events`

### Styling

Design tokens are HSL CSS variables defined in [src/index.css](src/index.css). Dark mode uses `.dark` class. Tailwind config extends these variables for colors, gradients, shadows, and animations. Radius is `0.75rem`.

### Storage buckets

| Bucket | Public | Contents |
|---|---|---|
| `blog-images`, `lawyer-brand-assets` | yes | site imagery |
| `medical-documents`, `test-results` | **no** | client medical records |
| `chat-attachments` | **no** | client↔lawyer chat files |

Private buckets are served through signed URLs — store the storage **path** in the database, never a public URL (see [`src/lib/storage.ts`](src/lib/storage.ts)). `chat-attachments` was public until 25.07.2026: the migration making it private sat in the repo for two months without being applied, and because it had no `INSERT` policy either, attachments could not be uploaded at all.

Upload paths are policy-relevant: `medical-documents` uses `{user_id}/…`, `chat-attachments` uses `chat/{lawyer_client_id}/…`. RLS reads the first path segments, so changing the layout silently breaks access.

### Environment Variables

[.env](.env) contains public Supabase keys (safe to commit). Backend secrets (`OPENAI_API_KEY`, `RESEND_API_KEY`) live only in the Supabase Dashboard.

Frontend code must **not** read `import.meta.env` for Supabase values directly — go through `@/lib/supabaseConfig` (see above). `vite.config.ts` passes the values to the pre-render plugin via `loadEnv`, because Vite does not put `.env` into `process.env`.

### Deployment

**Nothing deploys on `git push`.** `.github/workflows/` contains only `ci.yml`, which type-checks, lints, builds and runs tests — it has no deploy step, and there is no Supabase GitHub Action. An earlier version of this file claimed edge functions and migrations deploy automatically on push; they do not.

| What | How it reaches production |
|---|---|
| Frontend | Manual **Update / Publish** click in the Lovable UI |
| Edge functions | `npx supabase functions deploy <name> --project-ref kqbetheonxiclwgyatnm` |
| Migrations | Applied deliberately — via the Supabase MCP/dashboard, or `supabase db push` |

The live site is https://nepriziv.ru.

**Do not run a blind `supabase db push`.** Repo filenames and the versions recorded in prod `supabase_migrations.schema_migrations` have never matched: Lovable applies SQL through its own integration and records its own version numbers. As of 25.07.2026, 92 of 107 files in `supabase/migrations/` look «unapplied» to the CLI while the schema they describe is long since live. A blind push would replay them and fail on the first `CREATE TABLE`.

When you apply a migration yourself, name the repo file with the **exact version the database recorded**, so the CLI sees it as applied. The seven July files follow this rule; the older ones are historical and left alone.

```bash
supabase link --project-ref kqbetheonxiclwgyatnm
supabase functions deploy <function-name>
```

### Lovable ↔ GitHub Sync

The repo has bidirectional sync with the Lovable platform. Push changes here → they appear in Lovable. Changes made in Lovable auto-commit to GitHub.

## RAG / «Второй мозг» (база знаний ИИ)

Экспертная база знаний юриста живёт в Obsidian-волте **`D:\Obsidian\SecondBrain`** — это ЕДИНСТВЕННЫЙ канонический мозг (заболевания, юр.процедуры, документооборот, FAQ + Q&A-консультации в `14_FAQ/Консультации`, расписание болезней, прецеденты в `60_Прецеденты` + реальная практика: кейсы, вопросы врачу, консультации, стратегии). Его читают ОБА потребителя: сайт (этот ingest → Supabase) и локальный агент Hermes (`C:\Users\Ravil\hermes-tools\rag_pipeline.py`). Правило волта: НИКАКИХ отсылок к CRM (amocrm/deal_id/voennik365) и ПДн — оригиналы с идентификаторами сделок лежат в сыром слое `D:\Obsidian\Main\amoCRM_Кейсы` и в RAG не попадают.

**Конвейер:** [`scripts/ingest_rag.py`](scripts/ingest_rag.py) читает волт → эмбеддинги Jina v3 (1024 dims) → таблицы:
- `rag_chunks` — чанки знаний с метаданными. **`category` задаётся СТРОГО ПО ПАПКЕ волта** (источник истины — `FOLDER_CATEGORY` в ingest; ручной frontmatter `category` НЕ главнее — он рассинхронивался). 14 канонических категорий: `medical_condition`, `legal_procedure`, `document_guide`, `faq` (включая Q&A-заметки консультаций из `14_FAQ/Консультации`), `schedule_rb` (разбор глав РБ), `rb_official` (дословный текст РБ-565), `reference`, `strategy`, `web_source`, `case`, `doctor_qa`, `consultation`, `transcript`, `precedent` (обезличенные кейсы из `SecondBrain\60_Прецеденты`; с 2026-07-03 индексируются общим обходом волта, отдельного `--only-precedents` больше нет).
- `rag_system_context` — 5 фундаментальных блоков (рамка консультации, мед./процедурные тонкости, диагностический анализ, правила улучшения), включаются в каждый промпт.
- `rag_index` (VIEW) — оглавление: файл → категория, статьи РБ, размер. Для роутинга и генерации `00_Home/Оглавление.md`.
- Навигационные файлы (`_MOC_*`, `Home`, `README`, `00_Index`, `00_Start_Here`, папка `00_Home`) НЕ индексируются (см. `SKIP_*` в ingest).
- **ПДн-гейт (152-ФЗ):** `check_pii` в ingest детектит телефон/email/CRM-ссылки/ФИО-паттерн. Для ПУБЛИЧНЫХ категорий (`PUBLIC_CATEGORIES` = зеркало `KNOWLEDGE_CATEGORIES`) файл с ПДн **блокируется** (⛔, не ингестится), для внутренних — предупреждение.
- Поиск (гибрид, дефолт): RPC `hybrid_rag_chunks(query_text, query_embedding?, match_count, filter_categories?, filter_articles?, full_text_weight?, semantic_weight?, rrf_k?)` — Postgres FTS (`'russian'`, генерируемая колонка `content_fts` (section_title=A/content=B) + GIN) **+** pgvector, слияние Reciprocal Rank Fusion. `query_embedding` опционален: NULL → FTS-only (работает без Jina). FTS строит OR-запрос из лексем (`tsvector_to_array`), ранжирует `ts_rank_cd`.
- Поиск (чистый вектор, откат): RPC `match_rag_chunks(query_embedding, match_count, min_similarity, filter_categories?, filter_articles?)` — два последних параметра опциональны.
- Вектор-индекс: HNSW (`vector_cosine_ops`, m=16, ef_construction=64).

Ключи берутся из env или из gitignored `scripts/ingest.secrets.env` (шаблон — `ingest.secrets.example.env`). НЕ хардкодить ключи в коде.

**Где ИИ использует базу** (общий модуль [`supabase/functions/_shared/ragSearch.ts`](supabase/functions/_shared/ragSearch.ts)):
- `chat-rag` — публичный виджет «База знаний» (гибрид FTS+вектор RRF → над-извлечение 12 → LLM-реранк `rerankChunks` до 6, срез `KNOWLEDGE_CATEGORIES`).
- `chat` — клиентский ИИ-ассистент: подмешивает релевантные чанки в system-prompt (гибрид FTS+вектор + реранк, срез `KNOWLEDGE_CATEGORIES`, fail-open).
- `analyze-medical-document` — после анализа сверяет документ с экспертными требованиями по статьям (`searchByArticles`) и возвращает `documentGaps` (чего не хватает в документе).
- Агенты-юристы (`lawyer-case-assistant`, `lawyer-build-plan`) — инструмент `search_knowledge` в [`_shared/agentTools.ts`](supabase/functions/_shared/agentTools.ts).

**Пополнение базы — «запомнить факт → второй мозг».** Когда пользователь просит запомнить доменный факт/правило/особенность диагноза (про призыв, ВВК, РБ-565, документы), это знание должно попасть В ВОЛТ, а не только в память ассистента:
- CLI: [`scripts/add_note.py`](scripts/add_note.py) `--category <medical_condition|legal_procedure|document_guide|faq|reference|strategy|case> --title "…" --articles 68 --content "…"` — создаёт заметку с frontmatter и сразу индексирует в `rag_chunks`.
- Вручную: создать `.md` в нужной папке `SecondBrain` с frontmatter (`category`, `schedule_articles`, `target_category`, `type`, `anonymized: true`) → прогнать `ingest_rag.py` (idempotent upsert по id).
- Личная оперативная память ассистента (заметки о ходе проекта) — это ДРУГОЕ; доменные знания о призыве идут в SecondBrain.

После правок волта — перезапустить `ingest_rag.py` (полная пересборка: `--fresh`), затем `build_index.py` (обновляет `00_Home/Оглавление.md` — карту разделов + индекс по статьям РБ). NB: категория = РАСПОЛОЖЕНИЕ файла (папка), не frontmatter.

**Точечный поиск (чтобы не раздувать промпт)** — пресеты и хелперы в `ragSearch.ts`:
- `KNOWLEDGE_CATEGORIES` / `PRACTICE_CATEGORIES` — срезы базы. Публичный `chat-rag` и клиентский `chat` ищут ТОЛЬКО по `KNOWLEDGE_CATEGORIES`. Сырая практика (консультации/транскрипты с возможными ПДн) НЕ подмешивается. Обезличенные прецеденты `precedent` (`SecondBrain\60_Прецеденты`, плейсхолдеры [ПЕРСОНА_NNN], прошли аудит анонимизации) ВХОДЯТ в `KNOWLEDGE_CATEGORIES` — публичный чат цитирует реальные кейсы.
- `extractArticleNumbers(text)` — вытащить статьи РБ из запроса (для фильтра `filter_articles`).
- `searchByArticles` — точная выборка по статьям РБ без эмбеддинга (используется в `analyze-medical-document`).
