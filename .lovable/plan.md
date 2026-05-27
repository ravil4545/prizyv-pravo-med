Устранение 26 ошибок TypeScript, возникших после обновления Supabase-типов. Файл `src/integrations/supabase/types.ts` — авто-сгенерированный и read-only, поэтому правки вносятся только в компоненты/страницы.

### 1. Fix column name mismatches in `medical_documents_v2`
**File:** `src/components/DossierExportButton.tsx`
- `file_name` → `title` (in `.select()` and usage)
- `upload_date` → `uploaded_at` (in `.select()`, `.order()`, and usage)

### 2. Fix `ReactMarkdown` className prop (v9 API)
**File:** `src/components/RagChat.tsx`
- Remove `className` from `<ReactMarkdown>`; wrap it in a `<div className="prose prose-sm ...">` instead.

### 3. Fix `LawyerProfile` interface vs Supabase Row mismatch
**File:** `src/hooks/useLawyerProfile.ts`
- Make `id?: string` optional in the `LawyerProfile` interface (Supabase `lawyer_profiles` Row does not expose `id`).

### 4. Fix `window._showAppError` typing
**File:** `src/main.tsx`
- Change type assertion from `Record<string, unknown>` to `Record<string, (...args: string[]) => void>` so the call expression is callable.

### 5. Fix `.insert()` type in AdminBlogPage
**File:** `src/pages/AdminBlogPage.tsx`
- Cast `postData` to `any` on the `.insert(postData as any)` call, since it's built dynamically with conditional `published_at`.

### 6. Add `style` prop to `BrandedAvatar`
**File:** `src/components/BrandedAvatar.tsx`
- Add `style?: React.CSSProperties` to `BrandedAvatarProps` interface and spread it on the root `<div>`.

### 7–9. Fix missing table errors via `(supabase as any)` casts
**Files:**
- `src/pages/CommissariatDetailPage.tsx` — `commissariat_ratings` (2 errors)
- `src/pages/CommissariatDirectoryPage.tsx` — `commissariat_ratings` (3 errors)
- `src/components/LawyerClientDocsUploader.tsx` — `lawyer_client_med_docs` (1 error)
- `src/pages/ForumPage.tsx` — `forum_post_likes` (6 errors)
- `src/pages/SuccessCasesPage.tsx` — `success_cases` (4 errors)

For each: cast the supabase client to `any` for these specific queries, e.g.:
```ts
const { data } = await (supabase as any).from("table_name").select("*");
```
Then cast `data` to the local interface type. This avoids modifying the read-only auto-generated types file.

---
**Expected outcome:** `bunx tsc --noEmit` returns zero errors.