import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Expense, ExpenseSplit } from '@/types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { format } from 'date-fns';
import { Wallet, Bell, Clock, TrendingUp, Utensils, ShoppingBag, Plane, Tag } from 'lucide-react';

export default function Dashboard() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select(`
          *,
          category:categories(*),
          payment_method:payment_methods(*)
        `)
        .gte('expense_date', startOfMonth.toISOString().split('T')[0])
        .order('expense_date', { ascending: false });

      if (expensesError) throw expensesError;

      const { data: splitsData, error: splitsError } = await supabase
        .from('expense_splits')
        .select('*, person:people(*)')
        .eq('is_settled', false);

      if (splitsError) throw splitsError;

      setExpenses(expensesData || []);
      setSplits(splitsData || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.total_amount), 0);
  const totalClaimPending = splits.reduce((sum, split) => sum + Number(split.amount_owed), 0);
  
  const totalIOwe = 0; // Simplified for this scope

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
          <h1 className="font-headline font-extrabold tracking-tight text-xl text-black">Precision</h1>
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
                <p className="font-label text-xs uppercase tracking-widest opacity-50">Spending Limit</p>
                <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-tertiary-fixed w-3/4"></div>
                </div>
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
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-label text-secondary text-sm font-medium">Claim Pending</p>
              <p className="font-headline font-extrabold text-3xl text-error tracking-tight">RM {totalClaimPending.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-error-container/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-error" />
            </div>
          </div>
          
          {/* Savings Goal Card (Total I Owe) */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex items-center justify-between">
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
            <button className="font-label text-sm font-bold text-primary hover:opacity-70 transition-opacity">View All</button>
          </div>
          
          <div className="space-y-3">
            {expenses.slice(0, 5).map((expense) => (
              <div key={expense.id} className="bg-surface-container-lowest rounded-lg p-5 flex items-center justify-between hover:translate-x-2 transition-transform duration-300 group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors"
                    style={{ color: expense.category?.color_code }}
                  >
                    {getCategoryIcon(expense.category?.name || '')}
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
    </>
  );
}

