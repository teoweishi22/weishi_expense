import type { Expense, ExpenseSplit } from '../types';
const cents = (value: number | string) => Math.round(Number(value) * 100);
export function outstanding(split: Pick<ExpenseSplit, 'amount_owed' | 'is_settled' | 'paid_amount'>): number {
  return split.is_settled ? 0 : Math.max(0, cents(split.amount_owed) - cents(split.paid_amount || 0)) / 100;
}
export function netBalance(splits: ExpenseSplit[], meId: string, personId: string): number {
  return splits.reduce((total, split) => {
    const payer = (split.expense || split.expenses)?.payer_id;
    const sign = payer === meId && split.person_id === personId ? 1 : payer === personId && split.person_id === meId ? -1 : 0;
    return total + sign * cents(outstanding(split));
  }, 0) / 100;
}
export function isRepayment(expense: Pick<Expense, 'description' | 'repayment_person_id'>): boolean {
  return !!expense.repayment_person_id || expense.description.startsWith('[Settlement]');
}
export function billTotal(expenses: Expense[]): number {
  return expenses.filter(e => !isRepayment(e)).reduce((total, e) => total + cents(e.total_amount), 0) / 100;
}
export function paymentProtected(expense: Expense): boolean {
  return isRepayment(expense) || !!expense.expense_splits?.some(s => Number(s.paid_amount) > 0);
}
export function parsePaymentAmount(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a positive amount with at most two decimal places.');
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99) throw new Error('Enter an amount greater than RM0.00 and no more than RM99,999,999.99.');
  return amount;
}
