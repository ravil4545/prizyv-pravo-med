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

# Lint
npm run lint
```

No test runner is configured (no Jest/Vitest).

## Architecture

**Frontend**: React 18 + TypeScript + Vite, shadcn/ui (Radix) + Tailwind CSS, React Router v6, React Query v5, React Hook Form + Zod.

**Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions in Deno). All AI calls go through Supabase Edge Functions using `LOVABLE_API_KEY` — never directly from the frontend.

### Key Directories

- [src/pages/](src/pages/) — 25 route pages (public, auth, dashboard, medical, admin)
- [src/components/](src/components/) — shared components; [src/components/ui/](src/components/ui/) is auto-generated shadcn/ui (don't manually refactor)
- [src/hooks/](src/hooks/) — `useSubscription`, `useDemoMode`, `useAnalyticsTracking`, `use-mobile`
- [src/integrations/supabase/](src/integrations/supabase/) — **auto-generated** client and types, do not edit manually
- [src/lib/](src/lib/) — sanitize (DOMPurify), storage (localStorage), validations (Zod schemas), utils
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

### Auth & Subscriptions

- Supabase Auth (email/password + anonymous)
- `user_roles` table controls admin access
- `user_subscriptions` table controls paid quotas
- Free demo tier: 3 AI questions + 3 document uploads, tracked via `useDemoMode()` + localStorage

### Key Database Tables

`profiles`, `user_subscriptions`, `user_roles`, `medical_documents_v2`, `document_article_links`, `disease_articles_565`, `forum_posts`, `forum_comments`, `blog_posts`, `testimonials`, `analytics_events`

### Styling

Design tokens are HSL CSS variables defined in [src/index.css](src/index.css). Dark mode uses `.dark` class. Tailwind config extends these variables for colors, gradients, shadows, and animations. Radius is `0.75rem`.

### Environment Variables

[.env](.env) contains public Supabase keys (safe to commit). Backend secrets (`LOVABLE_API_KEY`, `RESEND_API_KEY`) live only in the Supabase Dashboard.

### Deployment

Frontend is published via the Lovable UI (requires manual "Update" click after code changes). Edge functions and migrations deploy automatically on GitHub push. The live site is https://nepriziv.ru.

To deploy edge functions locally:
```bash
supabase link --project-ref kqbetheonxiclwgyatnm
supabase functions deploy <function-name>
supabase db push
```

### Lovable ↔ GitHub Sync

The repo has bidirectional sync with the Lovable platform. Push changes here → they appear in Lovable. Changes made in Lovable auto-commit to GitHub.
