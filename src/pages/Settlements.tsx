import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ExpenseSplit, Person } from '@/types';
import { 
  CheckCircle2, 
  MessageCircle, 
  ChevronRight, 
  Plus, 
  Send,
  CreditCard,
  User as UserIcon,
  ReceiptText
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function Settlements() {
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  // Identify "Me" - Replace with your actual logic to find your user record
  const me = people.find(p => p.name.toLowerCase() === 'me');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (!userId) {
        setLoading(false);
        return;
      }

      const [splitsRes, peopleRes] = await Promise.all([
        supabase
          .from('expense_splits')
          .select('*, person:people(*), expenses!inner(*)')
          .eq('is_settled', false)
          .eq('expenses.user_id', userId)
          .order('created_at', { ascending: false }),
        supabase.from('people').select('*').order('name'),
      ]);

      if (splitsRes.data) {
        // Map the result back to the expected structure (expense: expenses instead of expenses: expenses)
        const mappedSplits = splitsRes.data.map((split: any) => ({
          ...split,
          expense: split.expenses
        }));
        setSplits(mappedSplits);
      }
      if (peopleRes.data) setPeople(peopleRes.data);
    } catch (error) {
      console.error('Error fetching settlements:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsSettled = async (splitId: string) => {
    try {
      const split = splits.find(s => s.id === splitId);
      if (!split) return;

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      const { error } = await supabase
        .from('expense_splits')
        .update({ is_settled: true })
        .eq('id', splitId);

      if (error) throw error;

      // Create a settlement record in the expenses table so it shows up in history
      if (userId) {
        const originalPayerIsMe = split.expense?.payer_id === me?.id;
        let description = '';
        let payerId = '';

        if (originalPayerIsMe) {
          description = `[Settlement] ${split.person?.name || 'Someone'} paid back for ${split.expense?.description || 'Expense'}`;
          payerId = split.person_id;
        } else {
          description = `[Settlement] Me paid back to ${split.person?.name || 'Someone'} for ${split.expense?.description || 'Expense'}`;
          payerId = me?.id || '';
        }

        await supabase.from('expenses').insert([{
          description,
          total_amount: Number(split.amount_owed),
          expense_date: new Date().toISOString().split('T')[0],
          category_id: split.expense?.category_id || null,
          payment_method_id: split.expense?.payment_method_id || null,
          payer_id: payerId || null,
          user_id: userId
        }]);
      }

      setSplits(splits.filter(s => s.id !== splitId));
    } catch (error) {
      console.error('Error marking as settled:', error);
    }
  };

  const getShareUrl = (token: string) => {
    return `${window.location.origin}/shared/settlement/${token}`;
  };

  const sendWhatsAppReminder = (person: Person, amount: number) => {
    const shareUrl = getShareUrl(person.share_token);
    const message = `Hey ${person.name}! Just a quick update on our shared expenses. Your current outstanding share is RM ${amount.toFixed(2)}. You can view the breakdown and receipt photos here: ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Net balances by person
  const balancesByPerson = people
    .filter(p => p.id !== me?.id)
    .map(person => {
      // Amount they owe YOU (You were the payer, they were the person in split)
      const theyOweMeSplits = splits.filter(s => s.person_id === person.id && s.expense?.payer_id === me?.id);
      const theyOweMe = theyOweMeSplits.reduce((sum, split) => sum + Number(split.amount_owed), 0);
      
      // Amount YOU owe them (They were the payer, you were the person in split)
      const iOweThemSplits = splits.filter(s => s.person_id === me?.id && s.expense?.payer_id === person.id);
      const iOweThem = iOweThemSplits.reduce((sum, split) => sum + Number(split.amount_owed), 0);
      
      const net = theyOweMe - iOweThem;
      
      // Combine splits for display
      const allRelatedSplits = [...theyOweMeSplits, ...iOweThemSplits];
      
      return { person, splits: allRelatedSplits, totalOwed: net };
    })
    .filter(b => b.totalOwed !== 0);

  // Summary Totals
  const totalClaimPending = balancesByPerson
    .filter(b => b.totalOwed > 0)
    .reduce((sum, b) => sum + b.totalOwed, 0);
  
  const totalIOwe = balancesByPerson
    .filter(b => b.totalOwed < 0)
    .reduce((sum, b) => sum + Math.abs(b.totalOwed), 0);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading settlements...</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="pb-32"
    >
      {/* Page Title & Massive Header */}
      <div className="mb-12">
        <h1 className="font-headline font-extrabold text-5xl md:text-7xl tracking-tighter mb-8 leading-none">
          Owed & <br/><span className="text-gray-300">Owned</span>
        </h1>

        {/* Summary Hero Card */}
        <div className="mesh-gradient rounded-3xl p-8 md:p-12 text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-end gap-8">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-tertiary-fixed opacity-10 rounded-full blur-3xl" />
          
          <div className="w-full md:w-auto">
            <p className="text-gray-400 text-xs font-bold tracking-widest uppercase mb-2">Total Owed to You</p>
            <h2 className="font-headline font-extrabold text-6xl md:text-7xl tracking-tighter text-tertiary-fixed">
              RM {totalClaimPending.toFixed(2)}
            </h2>
          </div>
          
          <div className="w-full md:w-auto text-right">
            <p className="text-gray-400 text-xs font-bold tracking-widest uppercase mb-2">Total You Owe</p>
            <p className="font-headline font-extrabold text-4xl md:text-5xl tracking-tighter text-red-400">
              -RM {totalIOwe.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* People Grid (Bento Style Layout) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {balancesByPerson.length === 0 ? (
          <div className="md:col-span-12 bg-white rounded-3xl p-12 text-center border border-dashed border-gray-200">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900">All Settled Up</h3>
            <p className="text-gray-500">No pending claims found from your sisters.</p>
          </div>
        ) : (
          balancesByPerson.map(({ person, splits: personSplits, totalOwed }, index) => {
            // Keep the visual hierarchy layout
            const isLarge = index === 0;
            
            return (
              <section 
                key={person.id}
                className={cn(
                  "bg-white rounded-3xl p-6 md:p-8 shadow-sm transition-all hover:shadow-md border border-gray-100",
                  isLarge ? "md:col-span-8" : "md:col-span-4"
                )}
              >
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xl font-bold text-gray-400 shrink-0">
                      {person.name.charAt(0)}
                    </div>
                    <div className="text-left min-w-0">
                      <h3 className="font-headline font-extrabold text-lg sm:text-xl tracking-tight truncate max-w-[120px] sm:max-w-none">{person.name}</h3>
                      <p className="text-gray-400 text-[10px] sm:text-xs">Sister / Family</p>
                    </div>
                  </div>
                  
                  <div className="text-left sm:text-right w-full sm:w-auto shrink-0 flex sm:flex-col justify-between sm:justify-start items-center sm:items-end gap-2 sm:gap-0 mt-2 sm:mt-0">
                    <span className={cn(
                      "block font-headline font-extrabold text-2xl sm:text-3xl",
                      totalOwed > 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {totalOwed > 0 ? '+' : '-'}RM {Math.abs(totalOwed).toFixed(2)}
                    </span>
                    {totalOwed > 0 && (
                      <button 
                        onClick={() => sendWhatsAppReminder(person, totalOwed)}
                        className="px-4 py-1.5 bg-black text-white rounded-full font-bold text-[10px] hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Remind
                      </button>
                    )}
                  </div>
                </div>

                {/* Individual Transactions (Shown on all cards for maximum transparency) */}
                <div className="space-y-3 mt-4">
                  {personSplits.slice(0, 5).map(split => (
                    <div key={split.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl group hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {split.expense?.receipt_photo_url ? (
                          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
                            <img src={split.expense.receipt_photo_url} alt="Receipt" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                            <ReceiptText className="text-gray-400 w-4.5 h-4.5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-xs sm:text-sm text-gray-900 truncate max-w-[100px] sm:max-w-[140px] md:max-w-[180px]">{split.expense?.description}</p>
                          <p className="text-[9px] sm:text-[10px] text-gray-400">
                            {split.expense?.expense_date && format(new Date(split.expense.expense_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          "font-bold text-xs sm:text-sm",
                          split.expense?.payer_id === me?.id ? "text-green-600" : "text-red-600"
                        )}>
                          {split.expense?.payer_id === me?.id ? '+' : '-'}RM {Number(split.amount_owed).toFixed(2)}
                        </span>
                        <button 
                          onClick={() => markAsSettled(split.id)}
                          className="p-1.5 bg-white rounded-full text-blue-600 shadow-sm hover:scale-105 active:scale-95 transition-transform"
                          title="Mark as Settled"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {personSplits.length === 0 && (
                    <p className="text-center text-xs text-gray-400 py-2">No active splits</p>
                  )}
                </div>
              </section>
            );
          })
        )}

        {/* Quick Action Bento Box */}
        <Link 
          to="/add"
          className="md:col-span-6 bg-black rounded-3xl p-8 shadow-xl flex items-center justify-between text-white overflow-hidden relative group active:scale-[0.98] transition-transform"
        >
          <div className="relative z-10">
            <h3 className="font-headline font-extrabold text-3xl tracking-tight mb-2">Split a Bill</h3>
            <p className="text-gray-400 text-sm max-w-[200px]">Create a new shared expense in seconds.</p>
          </div>
          <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center relative z-10 group-hover:bg-white/20 transition-all">
            <Plus className="text-white w-10 h-10 group-hover:rotate-90 transition-transform duration-300" />
          </div>
          <div className="absolute right-[-10%] bottom-[-20%] w-48 h-48 bg-white/5 rounded-full blur-3xl" />
        </Link>
      </div>
    </motion.div>
  );
}