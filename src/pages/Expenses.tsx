import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Expense, Category } from '@/types';
import { format, isToday, isYesterday } from 'date-fns';
import { Search, Utensils, Plane, Monitor, HeartPulse, ReceiptText, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useNavigate } from 'react-router-dom';

export default function Expenses() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [expRes, catRes] = await Promise.all([
        supabase.from('expenses').select('*, category:categories(*)').order('expense_date', { ascending: false }),
        supabase.from('categories').select('*').order('name')
      ]);
      if (expRes.data) setExpenses(expRes.data);
      if (catRes.data) setCategories(catRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this expense?')) return;

    try {
      // Delete splits first to avoid foreign key constraint errors if ON DELETE CASCADE is not set
      await supabase.from('expense_splits').delete().eq('expense_id', id);
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      
      if (error) throw error;

      setExpenses(expenses.filter(exp => exp.id !== id));
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense.');
    }
  };

  const filteredExpenses = expenses.filter(exp => {
    const matchesSearch = exp.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || exp.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Grouping logic
  const groupedExpenses = filteredExpenses.reduce((groups, exp) => {
    const date = exp.expense_date;
    if (!groups[date]) groups[date] = [];
    groups[date].push(exp);
    return groups;
  }, {} as Record<string, Expense[]>);

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMMM d');
  };

  const totalSpent = filteredExpenses.reduce((sum, exp) => sum + Number(exp.total_amount), 0);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading transactions...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Hero Section */}
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">
          {format(new Date(), 'MMMM')} Spending
        </p>
        <div className="flex items-baseline gap-2">
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
            RM {totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </h1>
        </div>
      </section>

      {/* Search & Filter */}
      <section className="space-y-4">
        <div className="relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
            <Search className="w-5 h-5" />
          </div>
          <input 
            type="text"
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 bg-white border-none rounded-2xl pl-12 pr-4 shadow-sm focus:ring-2 focus:ring-black/5 transition-all text-gray-900 placeholder:text-gray-400"
          />
        </div>

        <div className="flex gap-3 overflow-x-auto no-scrollbar py-2 -mx-4 px-4">
          <button 
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "px-6 py-2.5 rounded-full font-semibold text-sm flex-shrink-0 transition-all",
              !selectedCategory ? "bg-black text-white" : "bg-white text-gray-600 shadow-sm"
            )}
          >
            All
          </button>
          {categories.map(cat => (
            <button 
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "px-6 py-2.5 rounded-full font-semibold text-sm flex-shrink-0 transition-all",
                selectedCategory === cat.id ? "bg-black text-white" : "bg-white text-gray-600 shadow-sm"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </section>

      {/* Grouped Transactions */}
      <div className="space-y-8 pb-12">
        {Object.keys(groupedExpenses).length === 0 ? (
          <div className="text-center py-12 text-gray-400">No transactions found.</div>
        ) : (
          Object.entries(groupedExpenses).map(([date, items]) => (
            <section key={date} className="space-y-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1">
                {formatDateHeader(date)}
              </h3>
              <div className="space-y-3">
                {items.map(exp => (
                  <div 
                    key={exp.id} 
                    onClick={() => navigate(`/edit/${exp.id}`)}
                    className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-black/[0.03] active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                        style={{ backgroundColor: exp.category?.color_code || '#000' }}
                      >
                        <ReceiptText className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{exp.description}</h4>
                        <p className="text-xs text-gray-500">{exp.category?.name || 'Uncategorized'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-extrabold text-gray-900">
                          -RM {Number(exp.total_amount).toFixed(2)}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {format(new Date(exp.created_at), 'hh:mm a')}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDelete(e, exp.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        aria-label="Delete expense"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
