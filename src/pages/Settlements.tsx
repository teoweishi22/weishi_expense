import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ExpenseSplit, Person } from '@/types';
import { CheckCircle2, MessageCircle, ExternalLink, X } from 'lucide-react';
import { format } from 'date-fns';

export default function Settlements() {
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Payment Modal State
  const [selectedSplit, setSelectedSplit] = useState<ExpenseSplit | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const openPaymentModal = (split: ExpenseSplit) => {
    setSelectedSplit(split);
    setPaymentAmount(Math.abs(Number(split.amount_owed)).toFixed(2));
  };

  const closePaymentModal = () => {
    setSelectedSplit(null);
    setPaymentAmount('');
  };

  const handlePayment = async () => {
    if (!selectedSplit || !paymentAmount) return;
    
    const amountToPay = parseFloat(paymentAmount);
    if (isNaN(amountToPay) || amountToPay <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    setIsSubmitting(true);
    try {
      const currentOwed = Number(selectedSplit.amount_owed);
      const isNegative = currentOwed < 0;
      
      // If currentOwed is negative (I owe them), adding payment increases it towards 0
      // If currentOwed is positive (they owe me), subtracting payment decreases it towards 0
      const remainingAmount = isNegative 
        ? currentOwed + amountToPay 
        : currentOwed - amountToPay;
      
      const isSettled = Math.abs(remainingAmount) <= 0.01; // Account for floating point precision
      
      const { error } = await supabase
        .from('expense_splits')
        .update({ 
          amount_owed: isSettled ? 0 : remainingAmount,
          is_settled: isSettled 
        })
        .eq('id', selectedSplit.id);

      if (error) throw error;
      
      // Optimistic update
      if (isSettled) {
        setSplits(splits.filter(s => s.id !== selectedSplit.id));
      } else {
        setSplits(splits.map(s => 
          s.id === selectedSplit.id 
            ? { ...s, amount_owed: remainingAmount } 
            : s
        ));
      }
      
      closePaymentModal();
    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Failed to process payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getShareUrl = (token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/shared/settlement/${token}`;
  };

  const sendWhatsAppReminder = (person: Person, amount: number) => {
    const shareUrl = getShareUrl(person.share_token);
    const message = `Hey ${person.name}! Just a quick update on our shared expenses. Your current outstanding share is RM ${amount.toFixed(2)}. You can view the breakdown and receipt photos here: ${shareUrl}`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  // Group by person
  const balancesByPerson = people.map(person => {
    const personSplits = splits.filter(s => s.person_id === person.id);
    const totalOwed = personSplits.reduce((sum, split) => sum + Number(split.amount_owed), 0);
    return { person, splits: personSplits, totalOwed };
  }).filter(b => b.splits.length > 0);

  if (loading) return <div className="p-4 text-center">Loading settlements...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Settlements</h2>

      {balancesByPerson.length === 0 ? (
        <div className="bg-white p-8 rounded-xl shadow-sm border text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">All settled up!</p>
          <p className="text-sm text-gray-400 mt-1">No pending claims found.</p>
        </div>
      ) : (
        balancesByPerson.map(({ person, splits, totalOwed }) => (
          <div key={person.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{person.name}</h3>
                <p className="text-sm text-gray-500">
                  {totalOwed > 0 ? (
                    <>Owes you <span className="font-semibold text-red-600">RM {totalOwed.toFixed(2)}</span></>
                  ) : totalOwed < 0 ? (
                    <>You owe <span className="font-semibold text-orange-600">RM {Math.abs(totalOwed).toFixed(2)}</span></>
                  ) : (
                    <span className="font-semibold text-green-600">Settled</span>
                  )}
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => sendWhatsAppReminder(person, totalOwed)}
                  className="flex items-center space-x-1 bg-green-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Remind</span>
                </button>
              </div>
            </div>
            
            <div className="divide-y">
              {splits.map(split => (
                <div key={split.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="font-medium text-gray-900">{split.expense?.description}</p>
                    <p className="text-xs text-gray-500">
                      {split.expense?.expense_date ? format(new Date(split.expense.expense_date), 'MMM d, yyyy') : 'Unknown date'}
                      {' • '}
                      Total: RM {Number(split.expense?.total_amount || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <p className={`font-bold ${Number(split.amount_owed) < 0 ? 'text-orange-600' : 'text-gray-900'}`}>
                      {Number(split.amount_owed) < 0 ? 'You owe ' : ''}RM {Math.abs(Number(split.amount_owed)).toFixed(2)}
                    </p>
                    <button
                      onClick={() => openPaymentModal(split)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      Mark Paid
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-3 bg-gray-50 border-t flex justify-end">
               <a 
                 href={getShareUrl(person.share_token)} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="text-xs text-gray-500 hover:text-blue-600 flex items-center space-x-1"
               >
                 <span>View Magic Link</span>
                 <ExternalLink className="w-3 h-3" />
               </a>
            </div>
          </div>
        ))
      )}

      {/* Payment Modal */}
      {selectedSplit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">Record Payment</h3>
              <button 
                onClick={closePaymentModal}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Expense</p>
                <p className="text-gray-900 font-medium">{selectedSplit.expense?.description}</p>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <p className="text-sm font-medium text-blue-800 mb-1">Total Remaining Balance</p>
                <p className="text-2xl font-bold text-blue-900">RM {Math.abs(Number(selectedSplit.amount_owed)).toFixed(2)}</p>
              </div>
              
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Payment Amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">RM</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={Math.abs(Number(selectedSplit.amount_owed))}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium text-lg"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setPaymentAmount(Math.abs(Number(selectedSplit.amount_owed)).toFixed(2))}
                    className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                  >
                    Full Amount
                  </button>
                  <button
                    onClick={() => setPaymentAmount((Math.abs(Number(selectedSplit.amount_owed)) / 2).toFixed(2))}
                    className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                  >
                    Half Amount
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button
                onClick={closePaymentModal}
                className="flex-1 py-3 px-4 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={isSubmitting || !paymentAmount || parseFloat(paymentAmount) <= 0}
                className="flex-1 py-3 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
