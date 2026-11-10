# Partial repayments

User authorized correcting the existing existing repayment and adding partial repayments. Keep the existing React/Vite design, Vercel project and Supabase connection.

A Record Repayment action on each Settlement card accepts amount, local date and note. Apply money to that person's oldest unpaid shares, retain original share amounts and record allocations, and show remaining balances consistently in Settlement, Dashboard, shared summary and History. Reject amounts exceeding the relevant balance, nonpositive/overprecision values, missing login and foreign-owned records. Retry with the same payment ID must not apply money twice. Existing full-settlement actions use the same atomic path.

Convert the existing confirmed existing record in place, retaining its ID, date, attachment and note. Verify the resulting balance against the original shares minus the confirmed payment. Do not infer repayments from payer names or arbitrary notes.

Approach: additive paid_amount on splits, repayment_person_id on expenses and a private-to-owner allocation ledger. A SECURITY INVOKER RPC checks ownership and records the payment plus allocations in one transaction. A synthetic reverse debt would distort history; changing original split amounts would discard the audit trail, so neither is used. Linked expenses are protected from direct edits/deletes that would invalidate repayments.

History keeps whole-bill totals but labels them clearly, excludes repayments from spending, and shows the selected person's all-date outstanding balance separately. No scan/API-key changes are included.
