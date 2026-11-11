import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Read-only smoke test against a migrated Supabase project. No credentials or
// account IDs are committed. Run with SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
// and EXPENSE_TEST_OWNER_ID; the key must have read access to that test ledger.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const owner = process.env.EXPENSE_TEST_OWNER_ID;
let queryCount = 0;
for (const page of ['Expenses', 'Dashboard', 'Settlements', 'SharedSettlement', 'AddExpense', 'PersonDetail']) {
  const source = readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8');
  const selects = [...source.matchAll(/\.select\('([^']+)'\)/g)]
    .map(match => match[1]).filter(select => /expense_splits[!(]|expenses!/.test(select));
  for (const [index, select] of selects.entries()) {
    queryCount++;
    test(`${page} relationship query ${index + 1} resolves against migrated schema`, { skip: !url || !key || !owner }, async () => {
      const isExpense = /(?:^|[, ])expense_splits[!(]/.test(select);
      const relation = select.includes('expense:expenses') ? 'expense' : 'expenses';
      const params = new URLSearchParams({ select, limit: '1', [isExpense ? 'user_id' : `${relation}.user_id`]: `eq.${owner}` });
      const response = await fetch(`${url}/rest/v1/${isExpense ? 'expenses' : 'expense_splits'}?${params}`, { headers: { apikey: key! } });
      const data = await response.json();
      assert.equal(response.status, 200, `Relationship query failed: ${data.code || response.status}`);
      assert.ok(Array.isArray(data) && data.length > 0, 'Use a test ledger with expenses and splits');
      if (isExpense) assert.ok(Array.isArray(data[0].expense_splits));
      else assert.equal(data[0][relation].user_id, owner);
    });
  }
}
test('relationship smoke checks cover all seven embedded queries', () => {
  assert.equal(queryCount, 7);
});
