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
      const [splitsRes, peopleRes] = await Promise.all([
        supabase
          .from('expense_splits')
          .select('*, person:people(*), expense:expenses(*)')
          .eq('is_settled', false)
          .order('created_at', { ascending: false }),
        supabase.from('people').select('*').order('name'),
      ]);

      if (splitsRes.data) setSplits(splitsRes.data);
      if (peopleRes.data) setPeople(peopleRes.data);
    } catch (error) {
      console.error('Error fetching settlements:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsSettled = async (splitId: string) => {
    try {
      const { error } = await supabase
        .from('expense_splits')
        .update({ is_settled: true })
        .eq('id', splitId);

      if (error) throw error;
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

  // Group balances by person
  const balancesByPerson = people
    .filter(p => p.id !== me?.id)
    .map(person => {
      const personSplits = splits.filter(s => s.person_id === person.id);
      const totalOwed = personSplits.reduce((sum, split) => sum + Number(split.amount_owed), 0);
      return { person, splits: personSplits, totalOwed };
    })
    .filter(b => b.totalOwed > 0);

  // Summary Totals
  const totalClaimPending = balancesByPerson.reduce((sum, b) => sum + b.totalOwed, 0);
  
  // This will sum up splits where YOU owe someone else (requires payer_id logic)
  const totalIOwe = splits
    .filter(s => s.person_id === me?.id)
    .reduce((sum, s) => sum + Number(s.amount_owed), 0);

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
            // Make the first card larger (col-span-8) for a "Bento" look
            const isLarge = index === 0;
            
            return (
              <section 
                key={person.id}
                className={cn(
                  "bg-white rounded-3xl p-6 md:p-8 shadow-sm transition-all hover:shadow-md border border-gray-100",
                  isLarge ? "md:col-span-8" : "md:col-span-4"
                )}
              >
                <div className={cn(
                  "flex justify-between gap-6 mb-8",
                  isLarge ? "flex-col md:flex-row md:items-center" : "flex-col items-center text-center"
                )}>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl font-bold text-gray-400">
                      {person.name.charAt(0)}
                    </div>
                    <div className={isLarge ? "text-left" : "text-center"}>
                      <h3 className="font-headline font-extrabold text-2xl tracking-tight">{person.name}</h3>
                      <p className="text-gray-400 text-xs">Sister / Family</p>
                    </div>
                  </div>
                  
                  <div className={isLarge ? "text-right" : "text-center"}>
                    <span className="block font-headline font-extrabold text-3xl text-green-600">
                      +RM {totalOwed.toFixed(2)}
                    </span>
                    <button 
                      onClick={() => sendWhatsAppReminder(person, totalOwed)}
                      className="mt-4 px-6 py-2 bg-black text-white rounded-full font-bold text-xs hover:opacity-90 active:scale-95 transition-all flex items-center gap-2 mx-auto md:ml-auto"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Remind
                    </button>
                  </div>
                </div>

                {/* Individual Transactions (Only show in large cards) */}
                {isLarge && (
                  <div className="space-y-3">
                    {personSplits.slice(0, 3).map(split => (
                      <div key={split.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl group hover:bg-slate-100 transition-colors">
                        <div className="flex items-center gap-4">
                          <ReceiptText className="text-gray-400 w-5 h-5" />
                          <div>
                            <p className="font-bold text-sm text-gray-900">{split.expense?.description}</p>
                            <p className="text-[10px] text-gray-400">
                              {split.expense?.expense_date && format(new Date(split.expense.expense_date), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-gray-900">RM {Number(split.amount_owed).toFixed(2)}</span>
                          <button 
                            onClick={() => markAsSettled(split.id)}
                            className="p-2 bg-white rounded-full text-blue-600 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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