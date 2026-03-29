import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Person, ExpenseSplit } from '@/types';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  MessageCircle, 
  Copy, 
  CheckCircle2, 
  Utensils, 
  ShoppingBag, 
  Plane, 
  Tag,
  Receipt,
  X,
  Download
} from 'lucide-react';

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [person, setPerson] = useState<Person | null>(null);
  const [me, setMe] = useState<Person | null>(null);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `receipt-${new Date().getTime()}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch the person and "Me"
      const [personRes, meRes] = await Promise.all([
        supabase.from('people').select('*').eq('id', id).single(),
        supabase.from('people').select('*').eq('name', 'Me').single()
      ]);

      if (personRes.data) setPerson(personRes.data);
      const meData = meRes.data;
      if (meData) setMe(meData);

      if (meData && personRes.data) {
        // Fetch all unsettled splits involving either person
        const { data: splitsData } = await supabase
          .from('expense_splits')
          .select('*, expense:expenses(*, category:categories(*))')
          .in('person_id', [id, meData.id])
          .eq('is_settled', false)
          .order('created_at', { ascending: false });

        if (splitsData) {
          // Filter to only include splits between "Me" and this person
          const relevantSplits = splitsData.filter(s => 
            (s.person_id === id && s.expense?.payer_id === meData.id) || 
            (s.person_id === meData.id && s.expense?.payer_id === id)
          );
          setSplits(relevantSplits);
        }
      }
    } catch (error) {
      console.error('Error fetching person details:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (categoryName?: string) => {
    if (!categoryName) return <Tag className="w-5 h-5" />;
    const name = categoryName.toLowerCase();
    if (name.includes('food') || name.includes('dining')) return <Utensils className="w-5 h-5" />;
    if (name.includes('shopping') || name.includes('tech')) return <ShoppingBag className="w-5 h-5" />;
    if (name.includes('travel') || name.includes('flight')) return <Plane className="w-5 h-5" />;
    return <Tag className="w-5 h-5" />;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getShareUrl = (token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/shared/settlement/${token}`;
  };

  const handleWhatsApp = () => {
    if (!person) return;
    const shareUrl = getShareUrl(person.share_token);
    const amount = Math.abs(netBalance);
    const oweText = netBalance > 0 
      ? `Your current outstanding share is RM ${amount.toFixed(2)}.`
      : `I owe you RM ${amount.toFixed(2)}.`;
    const message = `Hey ${person.name}! Just a quick update on our shared expenses. ${oweText} You can view the breakdown and receipt photos here: ${shareUrl}`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  const handleCopyLink = () => {
    if (!person) return;
    const shareUrl = getShareUrl(person.share_token);
    navigator.clipboard.writeText(shareUrl);
    alert('Magic link copied to clipboard!');
  };

  const [selectedSplit, setSelectedSplit] = useState<ExpenseSplit | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');

  const openPaymentModal = (split: ExpenseSplit) => {
    setSelectedSplit(split);
    setPaymentAmount(Math.abs(Number(split.amount_owed)).toString());
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
      const remainingAmount = currentOwed - amountToPay;
      
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

  const handleSettleAll = async () => {
    if (splits.length === 0) return;
    setIsSubmitting(true);
    try {
      const splitIds = splits.map(s => s.id);
      const { error } = await supabase
        .from('expense_splits')
        .update({ amount_owed: 0, is_settled: true })
        .in('id', splitIds);

      if (error) throw error;
      setSplits([]);
    } catch (error) {
      console.error('Error settling all:', error);
      alert('Failed to settle all.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (!person) {
    return <div className="p-6 text-center">Person not found.</div>;
  }

  // Calculate Balances
  const theyOweMeSplits = splits.filter(s => s.person_id === id && s.expense?.payer_id === me?.id);
  const iOweThemSplits = splits.filter(s => s.person_id === me?.id && s.expense?.payer_id === id);

  const theyOweMe = theyOweMeSplits.reduce((sum, split) => sum + Number(split.amount_owed), 0);
  const iOweThem = iOweThemSplits.reduce((sum, split) => sum + Number(split.amount_owed), 0);

  const netBalance = theyOweMe - iOweThem;

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="min-h-screen bg-slate-50 text-slate-900 pb-24"
    >
      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-xl px-6 py-4 flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-200/50 hover:bg-slate-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-lg tracking-tight">Account Details</h1>
      </header>

      <main className="px-6 max-w-2xl mx-auto space-y-8 mt-4">
        {/* Contact Card */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-24 h-24 rounded-full bg-black text-white flex items-center justify-center text-3xl font-bold tracking-tighter shadow-lg">
            {getInitials(person.name)}
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">{person.name}</h2>
            <p className="text-sm text-slate-500 font-medium">Shared Expenses Account</p>
          </div>
        </div>

        {/* Balance Hero Section */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Net Balance</p>
            <h3 className={`text-5xl font-extrabold tracking-tighter ${netBalance > 0 ? 'text-green-600' : netBalance < 0 ? 'text-red-500' : 'text-slate-900'}`}>
              {netBalance > 0 ? '+' : netBalance < 0 ? '-' : ''}RM {Math.abs(netBalance).toFixed(2)}
            </h3>
            <p className="text-sm font-medium text-slate-500">
              {netBalance > 0 ? 'They owe you' : netBalance < 0 ? 'You owe them' : 'All settled up'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div className="bg-slate-50 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">They Owe Me</p>
              <p className="text-xl font-bold text-slate-900">RM {theyOweMe.toFixed(2)}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">I Owe Them</p>
              <p className="text-xl font-bold text-slate-900">RM {iOweThem.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={handleWhatsApp}
            className="flex items-center justify-center gap-2 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 py-3.5 rounded-2xl font-bold transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            <span>WhatsApp</span>
          </button>
          <button 
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 py-3.5 rounded-2xl font-bold transition-colors"
          >
            <Copy className="w-5 h-5" />
            <span>Magic Link</span>
          </button>
          <button 
            onClick={handleSettleAll}
            disabled={splits.length === 0 || isSubmitting}
            className="col-span-2 flex items-center justify-center gap-2 bg-black text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-2xl font-bold text-lg transition-colors shadow-lg shadow-black/10"
          >
            <CheckCircle2 className="w-6 h-6" />
            <span>Settle All Transactions</span>
          </button>
        </div>

        {/* Transaction List */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg tracking-tight px-1">Unsettled Transactions</h3>
          
          {splits.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-sm">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Receipt className="w-8 h-8 text-slate-300" />
              </div>
              <p className="font-bold text-slate-900">No pending transactions</p>
              <p className="text-sm text-slate-500 mt-1">You're all caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {splits.map((split) => {
                const amount = Number(split.amount_owed);
                const isNegative = split.person_id === me?.id;
                const absAmount = Math.abs(amount);
                const categoryColor = split.expense?.category?.color_code || '#cbd5e1';

                return (
                  <div key={split.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div 
                        className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden relative ${split.expense?.receipt_photo_url ? 'cursor-pointer ring-2 ring-offset-2 ring-blue-100 transition-transform active:scale-90' : ''}`}
                        style={{ backgroundColor: `${categoryColor}20`, color: categoryColor }}
                        onClick={() => split.expense?.receipt_photo_url && setSelectedImage(split.expense.receipt_photo_url)}
                      >
                        {split.expense?.receipt_photo_url ? (
                          <img src={split.expense.receipt_photo_url} alt="Receipt" className="w-full h-full object-cover absolute inset-0" />
                        ) : (
                          getCategoryIcon(split.expense?.category?.name)
                        )}
                      </div>
                      <div className="truncate">
                        <p className="font-bold text-slate-900 truncate">{split.expense?.description}</p>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                          {split.expense?.expense_date ? format(new Date(split.expense.expense_date), 'MMM d, yyyy') : 'Unknown date'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end shrink-0">
                      <p className={`font-bold tracking-tight ${isNegative ? 'text-orange-500' : 'text-slate-900'}`}>
                        {isNegative ? 'You owe ' : ''}RM {absAmount.toFixed(2)}
                      </p>
                      <button 
                        onClick={() => openPaymentModal(split)}
                        disabled={isSubmitting}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 mt-1 disabled:opacity-50"
                      >
                        Mark as Paid
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Payment Modal */}
      {selectedSplit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Record Payment</h3>
              <p className="text-sm text-gray-500">For: {selectedSplit.expense?.description}</p>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount Paid (RM)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Total outstanding: RM {Math.abs(Number(selectedSplit.amount_owed)).toFixed(2)}
                </p>
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
            <div className="p-4 bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={closePaymentModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={isSubmitting || !paymentAmount || parseFloat(paymentAmount) <= 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal for Receipts */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 cursor-pointer"
            onClick={() => setSelectedImage(null)}
          >
            <div className="absolute top-10 right-10 flex gap-4">
              <motion.button 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(selectedImage);
                }}
                className="bg-white/10 hover:bg-white/20 p-3 rounded-full text-white transition-colors"
              >
                <Download className="w-6 h-6" />
              </motion.button>
              <motion.button 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImage(null);
                }}
                className="bg-white/10 hover:bg-white/20 p-3 rounded-full text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </motion.button>
            </div>
            <motion.img 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              src={selectedImage} 
              alt="Receipt" 
              className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain"
              onClick={(e) => e.stopPropagation()} 
            />
            <p className="absolute bottom-10 text-white/50 text-xs font-medium tracking-widest uppercase">Tap anywhere to close</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
