import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Expense, Category } from '@/types';
import { format, isToday, isYesterday } from 'date-fns';
import { Search, ReceiptText, X, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // NEW: State for the receipt modal
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

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

  const filteredExpenses = expenses.filter(exp => {
    const matchesSearch = exp.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || exp.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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
    <div className="space-y-8 animate-in fade-in duration-500 pb-32">
      {/* Hero Section */}
      <section className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">
          {format(new Date(), 'MMMM')} Spending
        </p>
        <div className="flex items-baseline gap-2">
          <h1 className="text-5xl font-extrabold tracking-tight text-black">
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
            className="w-full h-14 bg-white border-none rounded-2xl pl-12 pr-4 shadow-sm focus:ring-2 focus:ring-black/5 transition-all text-black placeholder:text-gray-400"
          />
        </div>

        <div className="flex gap-3 overflow-x-auto no-scrollbar py-2 -mx-4 px-4">
          <button 
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "px-6 py-2.5 rounded-full font-bold text-xs flex-shrink-0 transition-all",
              !selectedCategory ? "bg-black text-white" : "bg-white text-gray-500 shadow-sm"
            )}
          >
            ALL
          </button>
          {categories.map(cat => (
            <button 
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "px-6 py-2.5 rounded-full font-bold text-xs flex-shrink-0 transition-all",
                selectedCategory === cat.id ? "bg-black text-white" : "bg-white text-gray-500 shadow-sm"
              )}
            >
              {cat.name.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {/* Grouped Transactions */}
      <div className="space-y-8">
        {Object.keys(groupedExpenses).length === 0 ? (
          <div className="text-center py-12 text-gray-400 font-medium">No transactions found.</div>
        ) : (
          Object.entries(groupedExpenses).map(([date, items]) => (
            <section key={date} className="space-y-4">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">
                {formatDateHeader(date)}
              </h3>
              <div className="space-y-3">
                {items.map(exp => (
                  <div 
                    key={exp.id} 
                    className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-black/[0.03] active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-4">
                      {/* NEW: Clickable icon if receipt exists */}
                      <div 
                        className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center text-white transition-transform active:scale-90",
                          exp.receipt_photo_url ? "cursor-pointer ring-2 ring-offset-2 ring-blue-100" : "cursor-default"
                        )}
                        style={{ backgroundColor: exp.category?.color_code || '#000' }}
                        onClick={() => exp.receipt_photo_url && setSelectedImage(exp.receipt_photo_url)}
                      >
                        {exp.receipt_photo_url ? (
                          <ImageIcon className="w-6 h-6 animate-pulse" />
                        ) : (
                          <ReceiptText className="w-6 h-6" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-black">{exp.description}</h4>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-400">{exp.category?.name || 'Uncategorized'}</p>
                          {exp.receipt_photo_url && (
                            <span className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-bold uppercase">Photo Attached</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold text-black">
                        -RM {Number(exp.total_amount).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {format(new Date(exp.created_at), 'hh:mm a')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* NEW: Image Modal for Receipts */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 cursor-pointer"
            onClick={() => setSelectedImage(null)}
          >
            <motion.button 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-10 right-10 bg-white/10 hover:bg-white/20 p-3 rounded-full text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </motion.button>
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
    </div>
  );
}