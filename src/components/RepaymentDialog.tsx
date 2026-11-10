import { useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { parsePaymentAmount } from '@/lib/balances';
import type { Person } from '@/types';

type Props = { person: Person; balance: number; splitId?: string; onClose: () => void; onSaved: () => void };
export default function RepaymentDialog({ person, balance, splitId, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState(Math.abs(balance).toFixed(2));
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Keep the same ID for retries, including a lost network response.
  const [paymentId] = useState(() => crypto.randomUUID());
  const [attempt, setAttempt] = useState<Record<string, unknown> | null>(null);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError('');
    try {
      const value = parsePaymentAmount(amount);
      if (value > Math.abs(balance)) throw new Error('The repayment cannot exceed the outstanding balance.');
      const payload = attempt || { p_person_id:person.id, p_amount:value, p_date:date,
        p_direction:balance > 0 ? 'received' : 'paid', p_note:note.trim(), p_payment_id:paymentId,
        p_existing:false, p_split_id:splitId || null };
      setAttempt(payload);
      setSaving(true);
      const { error } = await supabase.rpc('record_repayment', payload);
      if (error) throw error;
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Could not confirm repayment. Retry to safely check the same payment.');
    } finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="repayment-title">
    <form onSubmit={save} className="bg-white rounded-3xl p-6 w-full max-w-md space-y-4 max-h-[90dvh] overflow-y-auto">
      <h2 id="repayment-title" className="text-2xl font-bold">Record Repayment</h2>
      <p className="text-sm text-gray-600">{balance > 0 ? `${person.name} paid you` : `You paid ${person.name}`} · Outstanding RM {Math.abs(balance).toFixed(2)}</p>
      <label className="block text-sm font-bold">Amount (RM)
        <input autoFocus type="number" inputMode="decimal" min="0.01" step="0.01" max={Math.abs(balance)} required value={amount} disabled={!!attempt || saving} onChange={e=>setAmount(e.target.value)} className="block mt-1 w-full rounded-xl border p-3" />
      </label>
      <label className="block text-sm font-bold">Payment date
        <input type="date" required max={format(new Date(),'yyyy-MM-dd')} value={date} disabled={!!attempt || saving} onChange={e=>setDate(e.target.value)} className="block mt-1 w-full rounded-xl border p-3" />
      </label>
      <label className="block text-sm font-bold">Note (optional)
        <input maxLength={500} value={note} disabled={!!attempt || saving} onChange={e=>setNote(e.target.value)} placeholder="e.g. TNG transfer" className="block mt-1 w-full rounded-xl border p-3" />
      </label>
      <p className="text-xs text-gray-500">{splitId ? 'Applies to this share.' : 'Applies to the oldest unpaid shares first.'} This records a payment already made; it does not transfer money.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="button" disabled={saving} onClick={onClose} className="flex-1 p-3 rounded-full border">{attempt ? 'Close and Refresh' : 'Close'}</button>
        <button type="submit" disabled={saving} className="flex-1 p-3 rounded-full bg-black text-white font-bold disabled:opacity-50">{saving ? 'Saving…' : attempt ? 'Retry Same Payment' : 'Save Repayment'}</button>
      </div>
      {attempt && error && <p className="text-xs text-gray-500">Retry checks this same payment and will not deduct twice. If you close, refresh History before starting another payment.</p>}
    </form>
  </div>;
}
