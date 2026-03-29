import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Expense, ExpenseSplit } from '@/types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { format } from 'date-fns';

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
  
  // For "Total I Owe", we'd need a way to distinguish if the user owes someone else.
  // Assuming the user is always the one paying and others owe them for now,
  // or we need a specific "Me" person. Let's assume for now the user is the payer.
  const totalIOwe = 0; // Simplified for this scope unless we add payer_id to expenses.

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

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <p className="text-sm text-gray-500 font-medium">Total Expenses</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">RM {totalExpenses.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">This Month</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <p className="text-sm text-gray-500 font-medium">Claim Pending</p>
          <p className="text-2xl font-bold text-green-600 mt-1">RM {totalClaimPending.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">Others owe me</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Spending Behavior</h2>
        {pieData.length > 0 ? (
          <div className="h-64">
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
          </div>
        ) : (
          <p className="text-center text-gray-500 py-8">No expenses this month.</p>
        )}
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h2>
        <div className="space-y-4">
          {expenses.slice(0, 5).map((expense) => (
            <div key={expense.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: expense.category?.color_code || '#cbd5e1' }}
                >
                  {expense.category?.name.charAt(0) || '?'}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{expense.description}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(expense.expense_date), 'MMM d, yyyy')} • {expense.payment_method?.name}
                  </p>
                </div>
              </div>
              <p className="font-bold text-gray-900">RM {Number(expense.total_amount).toFixed(2)}</p>
            </div>
          ))}
          {expenses.length === 0 && (
            <p className="text-center text-gray-500 py-4">No recent transactions.</p>
          )}
        </div>
      </div>
    </div>
  );
}
