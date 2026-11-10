# Partial Repayments Implementation Plan

**Goal:** Record partial repayments and correct the confirmed existing in place.
**Architecture:** Add an atomic invoker RPC, retain original shares, and use shared balance helpers across screens.
**Tech Stack:** Existing React/TypeScript, Supabase Postgres, Vite/Vercel.
**Spec:** ../specs/2026-11-10-partial-repayments-design.md

## Constraints
Keep the existing app, styling, connection and data. No automatic note/payer-based repayment inference. Do not duplicate the existing record.

## Review focus
- Repeat submission must not deduct twice.
- Foreign-owned and unauthenticated requests must not mutate data.
- Partial/full payments must preserve original shares and remaining cents.
- Editing/deleting an allocated bill must not break balances.
- History filters and all-date outstanding balance must have distinct labels.

## Tasks
- [x] Add regression tests for remaining cents and History-vs-share totals; confirm failure, implement shared helpers.
- [x] Add migration/RPC with ownership, locking, FIFO allocation, idempotency and mutation guards; verify using rollback-only database fixtures.
- [x] Add repayment form and full-settlement integration; update Dashboard/shared/History remaining amounts and protected edits.
- [ ] Run tests, typecheck, build and independent review; deploy to the existing Vercel project.
- [ ] Back up the exact affected rows, convert the confirmed existing once, verify the remaining balance, and verify the live UI.

Validation: 46 unit tests, TypeScript, production build and authenticated rollback-only database tests passed. Independent review findings addressed. Synthetic phone UI verified at 390px, retry preserved the same ID and amount.
