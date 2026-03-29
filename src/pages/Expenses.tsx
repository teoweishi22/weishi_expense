import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Expense, Category, Person } from '@/types';
import { format, isToday, isYesterday } from 'date-fns';
import { Search, ReceiptText, X, ImageIcon, FilterX, Trash2, Pencil, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function Expenses() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParam = searchParams.get('filter');
  const navigate = useNavigate();
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [me, setMe] = useState<Person | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  
  // NEW: State for the receipt modal
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [expRes, catRes, peopleRes] = await Promise.all([
        supabase.from('expenses').select('*, category:categories(*), expense_splits(*)').order('expense_date', { ascending: false }),
        supabase.from('categories').select('*').order('name'),
        supabase.from('people').select('*')
      ]);
      
      if (expRes.data) setExpenses(expRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (peopleRes.data) {
        const mePerson = peopleRes.data.find(p => p.name.toLowerCase() === 'me');
        setMe(mePerson || null);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredExpenses = expenses.filter(exp => {
    const matchesSearch = exp.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || exp.category_id === selectedCategory;
    
    let matchesFilter = true;
    if (filterParam === 'claim_pending' && me) {
      // Claim Pending: I paid, someone else owes me, and it's not settled
      matchesFilter = exp.payer_id === me.id && 
        (exp.expense_splits || []).some(split => split.person_id !== me.id && !split.is_settled);
    } else if (filterParam === 'i_owe' && me) {
      // Total I Owe: Someone else paid, I owe them, and it's not settled
      matchesFilter = exp.payer_id !== me.id && 
        (exp.expense_splits || []).some(split => split.person_id === me.id && !split.is_settled);
    }

    return matchesSearch && matchesCategory && matchesFilter;
  });

  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
  const paginatedExpenses = filteredExpenses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const groupedExpenses = paginatedExpenses.reduce((groups, exp) => {
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

  const handleDelete = async (id: string) => {
    try {
      // Delete splits first
      await supabase.from('expense_splits').delete().eq('expense_id', id);
      
      // Delete expense
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      
      setExpenses(prev => prev.filter(e => e.id !== id));
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense.');
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `receipt-${new Date().getTime()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download image.');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading transactions...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-32">
      {/* Hero Section */}
      <section className="space-y-2">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">
              {filterParam === 'claim_pending' ? 'Pending Claims' : filterParam === 'i_owe' ? 'Total I Owe' : `${format(new Date(), 'MMMM')} Spending`}
            </p>
            <div className="flex items-baseline gap-2">
              <h1 className="text-5xl font-extrabold tracking-tight text-black">
                RM {totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h1>
            </div>
          </div>
          {filterParam && (
            <button 
              onClick={() => setSearchParams({})}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors"
            >
              <FilterX className="w-3 h-3" />
              Clear Filter
            </button>
          )}
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
                    <div 
                      className="flex items-center gap-4 cursor-pointer flex-1"
                      onClick={() => navigate(`/edit/${exp.id}`)}
                    >
                      {/* NEW: Clickable icon if receipt exists */}
                      <div 
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center text-white transition-transform active:scale-90 overflow-hidden relative shrink-0",
                          exp.receipt_photo_url ? "ring-2 ring-offset-2 ring-blue-100" : "cursor-default"
                        )}
                        style={{ backgroundColor: exp.category?.color_code || '#000' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (exp.receipt_photo_url) setSelectedImage(exp.receipt_photo_url);
                        }}
                      >
                        {exp.receipt_photo_url ? (
                          <img src={exp.receipt_photo_url} alt="Receipt" className="w-full h-full object-cover absolute inset-0" />
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
                    <div className="text-right flex flex-col items-end justify-between h-full gap-2">
                      <p className="font-extrabold text-black">
                        -RM {Number(exp.total_amount).toFixed(2)}
                      </p>
                      <div className="flex items-center gap-3">
                        <p className="text-[10px] text-gray-400">
                          {format(new Date(exp.created_at), 'hh:mm a')}
                        </p>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(exp.id);
                          }}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-end items-center gap-2 pt-4 pb-8">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setCurrentPage(i + 1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                currentPage === i + 1 
                  ? "bg-black text-white" 
                  : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-200"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

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

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setDeleteConfirmId(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="font-headline font-extrabold text-xl mb-2">Delete Transaction?</h3>
              <p className="text-gray-500 text-sm mb-6">This action cannot be undone. This will permanently delete the transaction and its splits.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}