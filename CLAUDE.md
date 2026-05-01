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

### Routing

Routes are defined in [src/App.tsx](src/App.tsx). Path alias `@/*` maps to `src/*`.

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
