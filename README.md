# Expenses Track — OpenAI migration

This is a separate copy of the supplied expense tracker. Receipt scanning now uses the server-side OpenAI Responses API. The React/Vite/Tailwind frontend, routes, Supabase client, authentication, database queries, and receipt storage code are preserved. The scanner's loading text now says “OpenAI,” and the browser tab title is “Expenses Track.”

The source ZIP remains untouched. This project is configured for the existing `weishi-expense` Vercel deployment and its existing Supabase connection.

## Run locally

Use Node.js 22.18 or newer.

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local`.
3. Set `OPENAI_API_KEY` to your OpenAI API key. Keep it server-only; never prefix it with `VITE_`.
4. Use the same existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values. No Supabase schema, policy, or connection changes are needed for the AI provider migration. The ZIP includes placeholders only; it does not include the actual credentials.
5. Run `npm run dev` and open <http://localhost:3000>.

The server reads `.env.local`, then `.env`, without replacing values already set in the environment. `OPENAI_MODEL` is optional and defaults to `gpt-5.6-luna`. If overridden, use a model supporting image/PDF input, Structured Outputs, and `reasoning.effort: low`.

Using the existing Supabase credentials connects this copy to your existing data. Normal save/delete actions still affect that database. Automated migration checks use synthetic fixtures and mocked OpenAI transport; they do not log in to or write to Supabase.

## What changed

- Replaced the Google AI SDK with the OpenAI SDK and server-only `OPENAI_API_KEY`.
- Kept `POST /api/scan-receipt` and its request/response fields unchanged. The local Express server uses the same handler as the existing deployment API entry point.
- Preserved the receipt extraction prompt and category rules. Structured JSON includes merchant, raw merchant name, date, amount, currency, category, unreadable flag, and confidence scores.
- Images use OpenAI image input; PDFs use file input. HEIC/HEIF photos are converted to JPEG on the server to preserve iPhone uploads.
- Set `store: false`, a 45-second API timeout, and no automatic retries. Invalid, incomplete, or refused responses return the existing `{ error }` response shape.
- Removed the Gemini browser build variable and AI Studio capability metadata. Updated both dependency lockfiles.

OpenAI receipt results can differ from Gemini results; identical OCR accuracy has not been established. A real receipt scan requires a configured OpenAI API key with access to the selected model.

## Checks

```sh
npm test
npm run lint
npm run build
```

Tests cover the real API handler and OpenAI SDK with a mocked external response, including structured fields, PDF routing, actual HEIC decoding, unreadable receipts, missing credentials, invalid uploads, incomplete/refused responses, and provider errors. They make no paid AI calls.

`vercel.json` builds the Vite frontend with npm and serves app routes through `index.html`, so opening or refreshing `/login` and `/expenses` works. API and asset paths are excluded from that fallback. The receipt function retains a 60-second duration limit.

The existing Vercel project must have `OPENAI_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` set for Production. Keep the existing Supabase values. Deploy through the connected `teoweishi22/weishi_expense` repository; no Supabase migration is required.

The admin form now uses `POST /api/admin/create-user` to create confirmed internal username accounts. It requires the existing server-only `SUPABASE_SERVICE_ROLE_KEY` and verifies the signed-in user through Supabase Auth. Admin authority comes only from `app_metadata.role`, never user-editable `user_metadata`. Use your email account with its existing trusted admin role; legacy accounts with only a user-metadata role do not receive admin access. New users can sign in with the username and password assigned in the form.

## References

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI PDF inputs](https://developers.openai.com/api/docs/guides/file-inputs)
- [GPT-5.6 Luna model capabilities](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
