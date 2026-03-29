import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Category, PaymentMethod, Person } from '@/types';
import { 
  X, 
  Calendar, 
  FileText, 
  Receipt, 
  Plus, 
  CheckCircle,
  CreditCard,
  Tag
} from 'lucide-react';

type FormData = {
  description: string;
  amount: number;
  date: string;
  category_id: string;
  payment_method_id: string;
  paid_by_id: string;
  receipt_photo: FileList;
  splits: { person_id: string; amount_owed: string | number }[];
};

export default function AddExpenseForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, control, handleSubmit, watch, setValue, reset } = useForm<FormData>({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      paid_by_id: 'me',
      splits: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "splits"
  });

  // Fetch dropdown data on mount
  useEffect(() => {
    async function fetchData() {
      const [catsRes, payRes, peopleRes] = await Promise.all([
        supabase.from('categories').select('*'),
        supabase.from('payment_methods').select('*'),
        supabase.from('people').select('*')
      ]);
      setCategories(catsRes.data || []);
      setPaymentMethods(payRes.data || []);
      setPeople(peopleRes.data || []);

      if (isEditing) {
        // Fetch existing expense data
        const { data: expenseData, error: expenseError } = await supabase
          .from('expenses')
          .select('*, expense_splits(*)')
          .eq('id', id)
          .single();

        if (expenseData && !expenseError) {
          reset({
            description: expenseData.description,
            amount: expenseData.total_amount,
            date: expenseData.expense_date,
            category_id: expenseData.category_id,
            payment_method_id: expenseData.payment_method_id,
            paid_by_id: expenseData.paid_by_id || 'me',
            splits: expenseData.expense_splits
              ?.filter((split: any) => split.amount_owed > 0)
              .map((split: any) => ({
                person_id: split.person_id,
                amount_owed: split.amount_owed
              })) || []
          });
          
          const hasPositiveSplits = expenseData.expense_splits?.some((split: any) => split.amount_owed > 0);
          if (hasPositiveSplits) {
            setIsSplitting(true);
          }
        }
      }
    }
    fetchData();
  }, [id, isEditing, reset]);

  const totalAmount = watch("amount");

  // Helper to split equally
  const splitEqually = () => {
    if (!totalAmount || fields.length === 0) return;
    const splitAmount = (Number(totalAmount) / fields.length).toFixed(2);
    fields.forEach((field, index) => {
      setValue(`splits.${index}.amount_owed`, splitAmount);
    });
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      // 1. Upload photo if exists
      let photoUrl = null;
      if (data.receipt_photo && data.receipt_photo.length > 0) {
        const file = data.receipt_photo[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, file);
        
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(fileName);
          photoUrl = publicUrlData.publicUrl;
        }
      }

      // 2. Insert or Update core Expense
      let expenseId = id;
      
      if (isEditing) {
        const { error: updateError } = await supabase
          .from('expenses')
          .update({
            description: data.description,
            total_amount: data.amount,
            expense_date: data.date,
            category_id: data.category_id,
            payment_method_id: data.payment_method_id,
            paid_by_id: data.paid_by_id === 'me' ? null : data.paid_by_id,
            ...(photoUrl ? { receipt_photo_url: photoUrl } : {})
          })
          .eq('id', id);
          
        if (updateError) throw updateError;
      } else {
        const { data: expenseData, error: expenseError } = await supabase
          .from('expenses')
          .insert([{
            description: data.description,
            total_amount: data.amount,
            expense_date: data.date,
            category_id: data.category_id,
            payment_method_id: data.payment_method_id,
            paid_by_id: data.paid_by_id === 'me' ? null : data.paid_by_id,
            receipt_photo_url: photoUrl
          }])
          .select()
          .single();

        if (expenseError) throw expenseError;
        expenseId = expenseData.id;
      }

      // 3. Handle Splits if applicable
      if (isEditing) {
        // Delete existing splits first
        await supabase.from('expense_splits').delete().eq('expense_id', id);
      }
      
      const splitInserts = [];
      
      if (isSplitting && data.splits.length > 0) {
        data.splits.forEach(split => {
          splitInserts.push({
            expense_id: expenseId,
            person_id: split.person_id,
            amount_owed: Number(split.amount_owed),
            is_settled: false
          });
        });
      }

      // If someone else paid, I owe them the total amount
      if (data.paid_by_id && data.paid_by_id !== 'me') {
        splitInserts.push({
          expense_id: expenseId,
          person_id: data.paid_by_id,
          amount_owed: -Number(data.amount),
          is_settled: false
        });
      }

      if (splitInserts.length > 0) {
        await supabase.from('expense_splits').insert(splitInserts);
      }

      alert(isEditing ? "Expense updated successfully!" : "Expense added successfully!");
      reset();
      setIsSplitting(false);
      navigate(-1); // Go back to the previous page
    } catch (error) {
      console.error("Error saving expense:", error);
      alert("Failed to save expense.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="text-on-surface min-h-screen relative overflow-hidden">
      {/* Background Decoration for Depth */}
      <div className="fixed -top-24 -right-24 w-96 h-96 bg-tertiary-fixed/10 rounded-full blur-[100px] -z-10"></div>
      <div className="fixed -bottom-24 -left-24 w-96 h-96 bg-primary-fixed/20 rounded-full blur-[100px] -z-10"></div>

      {/* Top Navigation */}
      <header className="fixed top-0 w-full flex justify-between items-center px-6 py-4 bg-slate-50/80 backdrop-blur-xl z-50">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-surface-container-low active:scale-95 transition-transform"
        >
          <X className="text-primary w-6 h-6" />
        </button>
        <h1 className="font-headline font-extrabold tracking-tight text-xl text-primary">
          {isEditing ? 'Edit Transaction' : 'New Transaction'}
        </h1>
        <div className="w-10"></div> {/* Spacer for symmetry */}
      </header>

      <form onSubmit={handleSubmit(onSubmit)}>
        <main className="pt-24 pb-48 px-6 max-w-xl mx-auto space-y-12">
          
          {/* Large Amount Input Section */}
          <section className="flex flex-col items-center justify-center text-center space-y-2">
            <span className="font-label text-sm font-semibold uppercase tracking-widest text-secondary">Amount</span>
            <div className="flex items-baseline justify-center w-full">
              <span className="font-headline font-extrabold text-4xl text-primary mr-2 opacity-40">RM</span>
              <input 
                type="number" 
                step="0.01"
                {...register("amount", { required: true })} 
                className="w-full max-w-[240px] bg-transparent border-none text-center font-headline font-extrabold text-7xl tracking-tighter text-primary focus:ring-0 p-0 placeholder:text-primary/20" 
                placeholder="0.00" 
              />
            </div>
          </section>

          {/* Form Fields */}
          <section className="space-y-4">
            {/* Category Input */}
            <div className="group">
              <label className="block font-label text-xs font-bold uppercase tracking-widest text-secondary mb-3 ml-1">Category</label>
              <div className="relative flex items-center bg-surface-container-low rounded-2xl px-5 py-4 transition-all focus-within:bg-surface-container-high focus-within:ring-1 ring-outline-variant/10">
                <Tag className="text-secondary mr-3 w-6 h-6" />
                <select 
                  {...register("category_id", { required: true })} 
                  className="bg-transparent border-none p-0 w-full font-body text-base text-primary focus:ring-0 appearance-none"
                >
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Date Input */}
            <div className="group">
              <label className="block font-label text-xs font-bold uppercase tracking-widest text-secondary mb-3 ml-1">Transaction Date</label>
              <div className="relative flex items-center bg-surface-container-low rounded-2xl px-5 py-4 transition-all focus-within:bg-surface-container-high focus-within:ring-1 ring-outline-variant/10">
                <Calendar className="text-secondary mr-3 w-6 h-6" />
                <input 
                  type="date" 
                  {...register("date", { required: true })} 
                  className="bg-transparent border-none p-0 w-full font-body text-base text-primary focus:ring-0" 
                />
              </div>
            </div>

            {/* Note Input */}
            <div className="group">
              <label className="block font-label text-xs font-bold uppercase tracking-widest text-secondary mb-3 ml-1">Note / Description</label>
              <div className="relative flex items-center bg-surface-container-low rounded-2xl px-5 py-4 transition-all focus-within:bg-surface-container-high focus-within:ring-1 ring-outline-variant/10">
                <FileText className="text-secondary mr-3 w-6 h-6" />
                <input 
                  type="text"
                  {...register("description", { required: true })} 
                  className="bg-transparent border-none p-0 w-full font-body text-base text-primary placeholder:text-secondary/50 focus:ring-0" 
                  placeholder="Lunch at The Monolith" 
                />
              </div>
            </div>

            {/* Payment Method Input */}
            <div className="group">
              <label className="block font-label text-xs font-bold uppercase tracking-widest text-secondary mb-3 ml-1">Payment Method</label>
              <div className="relative flex items-center bg-surface-container-low rounded-2xl px-5 py-4 transition-all focus-within:bg-surface-container-high focus-within:ring-1 ring-outline-variant/10">
                <CreditCard className="text-secondary mr-3 w-6 h-6" />
                <select 
                  {...register("payment_method_id", { required: true })} 
                  className="bg-transparent border-none p-0 w-full font-body text-base text-primary focus:ring-0 appearance-none"
                >
                  <option value="">Select Payment Method</option>
                  {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {/* Paid By Input */}
            <div className="group">
              <label className="block font-label text-xs font-bold uppercase tracking-widest text-secondary mb-3 ml-1">Paid By Who</label>
              <div className="relative flex items-center bg-surface-container-low rounded-2xl px-5 py-4 transition-all focus-within:bg-surface-container-high focus-within:ring-1 ring-outline-variant/10">
                <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center mr-3">
                  <span className="text-xs font-bold text-secondary">@</span>
                </div>
                <select 
                  {...register("paid_by_id", { required: true })} 
                  className="bg-transparent border-none p-0 w-full font-body text-base text-primary focus:ring-0 appearance-none"
                >
                  <option value="me">Me</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Attachment Bento Element */}
          <label className="bg-surface-container-lowest rounded-xl p-6 flex items-center justify-between shadow-sm cursor-pointer active:scale-[0.98] transition-transform">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-surface-container-low flex items-center justify-center">
                <Receipt className="text-secondary w-6 h-6" />
              </div>
              <div>
                <h4 className="font-headline font-semibold text-sm">Add Receipt</h4>
                <p className="font-body text-xs text-secondary">
                  {watch('receipt_photo')?.[0] ? watch('receipt_photo')[0].name : 'Scan or upload a photo'}
                </p>
              </div>
            </div>
            <div className="bg-surface-container-high w-8 h-8 rounded-full flex items-center justify-center">
              <Plus className="text-primary w-4 h-4" />
            </div>
            <input type="file" accept="image/*" {...register("receipt_photo")} className="hidden" />
          </label>

          {/* Split Bill Section */}
          <section className="space-y-4">
            <label className="flex items-center space-x-3 cursor-pointer bg-surface-container-lowest p-4 rounded-xl shadow-sm">
              <input 
                type="checkbox" 
                checked={isSplitting} 
                onChange={(e) => setIsSplitting(e.target.checked)} 
                className="w-5 h-5 text-primary rounded focus:ring-primary border-outline-variant" 
              />
              <span className="font-headline font-semibold text-primary">Split this bill?</span>
            </label>

            {isSplitting && (
              <div className="p-5 bg-surface-container-low rounded-xl space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-label text-sm font-bold uppercase tracking-widest text-secondary">Who is involved?</span>
                  <button 
                    type="button" 
                    onClick={splitEqually} 
                    className="text-xs bg-primary text-on-primary font-bold px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                  >
                    Split Equally
                  </button>
                </div>
                
                <div className="space-y-3">
                  {people.map((person) => {
                    const fieldIndex = fields.findIndex(f => f.person_id === person.id);
                    const isIncluded = fieldIndex !== -1;

                    return (
                      <div key={person.id} className="flex items-center justify-between bg-surface-container-lowest p-3 rounded-lg shadow-sm">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={isIncluded}
                            onChange={(e) => {
                              if (e.target.checked) append({ person_id: person.id, amount_owed: '' });
                              else remove(fieldIndex);
                            }}
                            className="w-5 h-5 rounded text-primary focus:ring-primary border-outline-variant"
                          />
                          <span className="font-body font-medium text-primary">{person.name}</span>
                        </label>
                        
                        {isIncluded && (
                          <div className="flex items-center space-x-2">
                            <span className="font-headline font-bold text-secondary opacity-50">RM</span>
                            <input 
                              type="number" 
                              step="0.01"
                              {...register(`splits.${fieldIndex}.amount_owed` as const, { required: true })}
                              className="w-24 p-2 text-right font-headline font-bold text-primary bg-surface-container-low border-none rounded-lg focus:ring-1 focus:ring-primary"
                              placeholder="0.00"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

        </main>

        {/* Fixed Action Button */}
        <div className="fixed bottom-20 left-0 right-0 p-6 z-50 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-primary text-on-primary font-headline font-bold py-5 rounded-full shadow-2xl shadow-primary/20 active:scale-[0.98] transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70"
            >
              {isSubmitting ? (
                <span>Saving...</span>
              ) : (
                <>
                  <CheckCircle className="w-6 h-6" />
                  <span>{isEditing ? 'Update Transaction' : 'Add Transaction'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
