# Migration verification — 18 September 2026

This report records verification of the separate local migration before the subsequent deployment request. It is a snapshot of that verification, not the current live deployment status.

## Preserved

- All 18 files under `src/` match the ZIP byte-for-byte except the exact loading-text replacement “Gemini AI is analyzing” → “OpenAI is analyzing”.
- CSS source, page layouts, routes, Supabase client, auth logic, database queries, and storage operations are unchanged.
- The original receipt extraction system prompt is identical.
- The browser tab title changes from “My Google AI Studio App” to “Expenses Track”.
- The original ZIP SHA-256 remains `329d37bf0018b5062c847756c34218b78733cddd87af413c84641aec85ed6b65`.

## Verification

- 19 receipt API tests passed, using the real handler/SDK with external transport mocked.
- Coverage includes image/PDF request formats, actual HEIC/HEIF conversion, a 4 MB upload, structured fields, unreadable data, configuration errors, invalid input, incomplete/refused/invalid AI output, and upstream failures.
- TypeScript check and production build passed.
- Clean `npm ci` succeeded; the Bun lockfile passed frozen validation.
- Local production startup passed health, SPA-route, upload-validation, and missing-key smoke checks. The test server was stopped afterward.
- A private API-key sentinel was absent from the browser build.
- Generated CSS matches the baseline except removal of an unused `.contents` utility that Tailwind previously detected in the Gemini request code.
- Existing large-bundle build warning remains; it also occurs in the original export.

## Dependencies

The Google AI SDK was removed. OpenAI and HEIC conversion dependencies were added. The shared `ws` dependency moves from 8.20.0 to 8.21.3 to satisfy the OpenAI SDK's `^8.21.0` peer requirement; it also satisfies Supabase's existing `^8.18.2` requirement. Other retained npm dependency versions match the original lockfile.

## Not exercised

No real OpenAI receipt call, login, or database operation was performed. Live receipt accuracy requires an OpenAI API key with access to the configured model and representative receipts. The supplied ZIP contains only environment placeholders. The existing missing admin create-user endpoint is outside this migration.

No Vercel deployment, Vercel environment variable, or connected Supabase resource was accessed or changed.

## Changed original files

- `metadata.json`
- `README.md`
- `index.html`
- `server.ts`
- `package.json`
- `bun.lock`
- `package-lock.json`
- `.env.example`
- `src/pages/AddExpense.tsx`
- `vite.config.ts`
- `api/scan-receipt.ts`
