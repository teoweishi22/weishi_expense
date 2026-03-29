import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Expense, ExpenseSplit, Person } from '@/types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { format } from 'date-fns';
import { Wallet, Bell, Clock, TrendingUp, Utensils, ShoppingBag, Plane, Tag, X, Download } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
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
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [expensesRes, splitsRes, peopleRes] = await Promise.all([
        supabase
          .from('expenses')
          .select(`
            *,
            category:categories(*),
            payment_method:payment_methods(*)
          `)
          .gte('expense_date', startOfMonth.toISOString().split('T')[0])
          .order('expense_date', { ascending: false }),
        supabase
          .from('expense_splits')
          .select('*, person:people(*), expense:expenses(*)')
          .eq('is_settled', false),
        supabase.from('people').select('*')
      ]);

      if (expensesRes.error) throw expensesRes.error;
      if (splitsRes.error) throw splitsRes.error;
      if (peopleRes.error) throw peopleRes.error;

      setExpenses(expensesRes.data || []);
      setSplits(splitsRes.data || []);
      setPeople(peopleRes.data || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.total_amount), 0);
  
  // 1. Find the "Me" person (assuming your name is "Me" or you have a specific ID)
  const me = people.find(p => p.name.toLowerCase() === "me"); 

  // 2. Calculate "Total I Owe"
  // This sums up all splits where YOU are the person owing, and someone ELSE was the payer.
  const totalIOwe = splits.reduce((sum, split) => {
    if (split.person_id === me?.id && split.expense?.payer_id !== me?.id) {
      return sum + Number(split.amount_owed);
    }
    return sum;
  }, 0);

  // 3. Update "Claim Pending"
  // This sums up all splits where SOMEONE ELSE is the person owing, and YOU were the payer.
  const totalClaimPending = splits.reduce((sum, split) => {
    if (split.person_id !== me?.id && split.expense?.payer_id === me?.id) {
      return sum + Number(split.amount_owed);
    }
    return sum;
  }, 0);

  const expensesByCategory = expenses.reduce((acc, exp) => {
    const catName = exp.category?.name || 'Uncategorized';
    const amount = Number(exp.total_amount);
    if (!acc[catName]) {
      acc[catName] = { name: catName, value: 0, color: exp.category?.color_code || '#cbd5e1' };
    }
    acc[catName].value += amount;
    return acc;
  }, {} as Record<string, { name: string; value: number; color: string }>);

  const pieData = Object.values(expensesByCategory);

  const getCategoryIcon = (categoryName: string) => {
    const name = categoryName.toLowerCase();
    if (name.includes('food') || name.includes('dining')) return <Utensils className="w-6 h-6" />;
    if (name.includes('shopping') || name.includes('tech')) return <ShoppingBag className="w-6 h-6" />;
    if (name.includes('travel') || name.includes('flight')) return <Plane className="w-6 h-6" />;
    return <Tag className="w-6 h-6" />;
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  // 1. Add this logic above your return statement
  // Use a strict check for the limit
  const monthlyLimit = (me && me.monthly_limit !== undefined && me.monthly_limit !== null && me.monthly_limit > 0) 
    ? Number(me.monthly_limit) 
    : 1000;
  const percentage = Math.min((totalExpenses / monthlyLimit) * 100, 100);

  // Determine bar color based on percentage
  const getBarColor = () => {
    if (percentage >= 85) return 'bg-red-500';      // Red for high spending
    if (percentage >= 50) return 'bg-yellow-400';   // Yellow for warning
    return 'bg-tertiary-fixed';                    // Green (default theme color) for safe
  };

  // Determine text color based on percentage
  const getTextColor = () => {
    if (percentage >= 85) return 'text-red-500 opacity-100';      
    if (percentage >= 50) return 'text-yellow-400 opacity-100';   
    return 'text-white opacity-60'; // Keep it subtle when safe
  };

  return (
    <>
      {/* TopAppBar */}
      <header className="fixed top-0 left-0 w-full flex justify-between items-center px-6 py-4 bg-slate-50/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-high">
            <img 
              alt="User Profile" 
              className="w-full h-full object-cover" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCtbOvu0tK7A-kdAXTHgz8HfswSk38qBahXxKFWsNX6ZT_D8hdkXCNOVMNExGWKU91DG5vNpRTmzbrlLrdcFHXfrI04hz6iCFoWp4U2nLQIMGZJ78HWDXtJui5lm2L__kpGgy164uyJqfnQ0Ff0WNwMbfhWoPdHL5FP2HUR-GWAqS5-d6gPn3pLVQFngNMejHSK6bUHyVI27K_TlMzRczPK3nT3sNHDRGwXts6gTO7VP5ldP_FWO53x74Q89oa9mPAvMjsOPc19NOQ"
            />
          </div>
          <h1 className="font-headline font-extrabold tracking-tight text-xl text-black">My Expenses Track</h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors">
            <Bell className="w-6 h-6 text-black" />
          </button>
        </div>
      </header>

      <div className="pt-24 pb-32 px-6 max-w-5xl mx-auto space-y-8">
        {/* Hero Section: Total Expenses Card */}
        <section className="relative group">
          <div 
            className="rounded-xl p-8 text-white shadow-2xl overflow-hidden relative min-h-[240px] flex flex-col justify-between"
            style={{
              backgroundColor: '#000000',
              backgroundImage: 'radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), radial-gradient(at 50% 0%, hsla(225,39%,30%,1) 0, transparent 50%), radial-gradient(at 100% 0%, hsla(339,49%,30%,1) 0, transparent 50%)'
            }}
          >
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 p-8 opacity-20">
              <Wallet className="w-16 h-16" />
            </div>
            
            <div>
              <p className="font-label text-sm uppercase tracking-widest opacity-60 mb-2">Total Monthly Expenses</p>
              <h2 className="font-headline font-extrabold text-5xl md:text-6xl tracking-tighter">
                RM {totalExpenses.toFixed(2)}
              </h2>
            </div>
            
            <div className="flex justify-between items-end">
              <div className="space-y-1">
                <div className="flex justify-between items-center w-48">
                  <p className="font-label text-[10px] uppercase tracking-widest opacity-50">Spending Limit</p>
                  <p className="font-label text-[10px] font-bold opacity-80">
                    {percentage.toFixed(0)}%
                  </p>
                </div>
                
                {/* The dynamic progress bar */}
                <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ease-out ${getBarColor()}`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
                
                <p className={`text-[10px] font-medium transition-colors ${getTextColor()}`}>
                  {totalExpenses > monthlyLimit 
                    ? `RM ${(totalExpenses - monthlyLimit).toFixed(2)} over limit` 
                    : `RM ${(monthlyLimit - totalExpenses).toFixed(2)} remaining`}
                </p>
              </div>
              <div className="text-right">
                <span className="font-label text-sm font-semibold text-tertiary-fixed">+2.4% from last month</span>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Bento Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Claim Pending Card */}
          <div 
            onClick={() => navigate('/expenses?filter=claim_pending')}
            className="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors active:scale-[0.98]"
          >
            <div className="space-y-1">
              <p className="font-label text-secondary text-sm font-medium">Claim Pending</p>
              <p className="font-headline font-extrabold text-3xl text-error tracking-tight">RM {totalClaimPending.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-error-container/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-error" />
            </div>
          </div>
          
          {/* Savings Goal Card (Total I Owe) */}
          <div 
            onClick={() => navigate('/expenses?filter=i_owe')}
            className="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors active:scale-[0.98]"
          >
            <div className="space-y-1">
              <p className="font-label text-secondary text-sm font-medium">Total I Owe</p>
              <p className="font-headline font-extrabold text-3xl text-on-tertiary-container tracking-tight">RM {totalIOwe.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-tertiary-fixed/20 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-on-tertiary-container" />
            </div>
          </div>
        </section>

        {/* Spending Trends (Pie Chart) */}
        <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-headline font-extrabold text-xl tracking-tight">Spending Trends</h3>
            <div className="flex gap-2">
              <button className="px-4 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold">WEEKLY</button>
              <button className="px-4 py-1.5 rounded-full bg-surface-container-high text-secondary text-xs font-bold">MONTHLY</button>
            </div>
          </div>
          
          <div className="h-64 w-full relative">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => `RM ${value.toFixed(2)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-secondary font-medium">
                No expenses this month.
              </div>
            )}
          </div>
        </section>

        {/* Recent Transactions */}
        <section className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-headline font-extrabold text-xl tracking-tight">Recent Transactions</h3>
            <button 
              onClick={() => navigate('/expenses')}
              className="font-label text-sm font-bold text-primary hover:opacity-70 transition-opacity"
            >
              View All
            </button>
          </div>
          
          <div className="space-y-3">
            {expenses.slice(0, 5).map((expense) => (
              <div 
                key={expense.id} 
                onClick={() => navigate(`/edit/${expense.id}`)}
                className="bg-surface-container-lowest rounded-lg p-5 flex items-center justify-between hover:translate-x-2 transition-transform duration-300 group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div 
                    className={`w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors overflow-hidden relative ${expense.receipt_photo_url ? 'cursor-pointer ring-2 ring-offset-2 ring-blue-100 transition-transform active:scale-90' : ''}`}
                    style={{ color: expense.category?.color_code }}
                    onClick={(e) => {
                      if (expense.receipt_photo_url) {
                        e.stopPropagation();
                        setSelectedImage(expense.receipt_photo_url);
                      }
                    }}
                  >
                    {expense.receipt_photo_url ? (
                      <img src={expense.receipt_photo_url} alt="Receipt" className="w-full h-full object-cover absolute inset-0" />
                    ) : (
                      getCategoryIcon(expense.category?.name || '')
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-black">{expense.description}</p>
                    <span className="inline-block px-2 py-0.5 mt-1 bg-surface-container-high rounded text-[10px] font-bold uppercase tracking-wider text-secondary">
                      {expense.category?.name || 'Uncategorized'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-black">-RM {Number(expense.total_amount).toFixed(2)}</p>
                  <p className="text-[10px] text-secondary font-medium">
                    {format(new Date(expense.expense_date), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
            ))}
            
            {expenses.length === 0 && (
              <div className="text-center py-8 text-secondary font-medium">
                No recent transactions.
              </div>
            )}
          </div>
        </section>
      </div>

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
    </>
  );
}

