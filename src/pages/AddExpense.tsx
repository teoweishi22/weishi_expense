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
  Tag,
  User as UserIcon
} from 'lucide-react';
import { motion } from 'framer-motion';

type FormData = {
  description: string;
  amount: number;
  date: string;
  category_id: string;
  payment_method_id: string;
  payer_id: string;
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
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      splits: []
    }
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "splits"
  });

  // Fetch dropdown data on mount
  useEffect(() => {
    async function fetchData() {
      const [catsRes, payRes, peopleRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('payment_methods').select('*').order('name'),
        supabase.from('people').select('*').order('name')
      ]);
      
      const peopleList = peopleRes.data || [];
      const categoriesList = catsRes.data || [];
      const paymentMethodsList = payRes.data || [];
      
      setCategories(categoriesList);
      setPaymentMethods(paymentMethodsList);
      setPeople(peopleList);

      if (isEditing) {
        const { data: expense, error } = await supabase
          .from('expenses')
          .select('*, expense_splits(*)')
          .eq('id', id)
          .single();
          
        if (expense) {
          setExistingPhotoUrl(expense.receipt_photo_url);
          
          const hasSplits = expense.expense_splits && expense.expense_splits.length > 0;
          if (hasSplits) {
            setIsSplitting(true);
          }

          // Reset form with fetched data
          reset({
            description: expense.description,
            amount: expense.total_amount,
            date: expense.expense_date,
            category_id: expense.category_id || '',
            payment_method_id: expense.payment_method_id || '',
            payer_id: expense.payer_id || '',
            splits: hasSplits ? expense.expense_splits.map((s: any) => ({
              person_id: s.person_id,
              amount_owed: s.amount_owed
            })) : []
          });
          
          // Use a small timeout to ensure the select options are rendered before setting values
          setTimeout(() => {
            if (expense.payer_id) setValue('payer_id', expense.payer_id);
            if (expense.category_id) setValue('category_id', expense.category_id);
            if (expense.payment_method_id) setValue('payment_method_id', expense.payment_method_id);
          }, 100);
        }
      } else {
        // Default Payer to "Me" if found
        const me = peopleList.find(p => p.name.toLowerCase() === 'me');
        if (me) {
          setValue('payer_id', me.id);
        }
      }
    }
    fetchData();
  }, [id, isEditing, setValue, reset]);

  const totalAmount = watch("amount");

  const splitEqually = () => {
    if (!totalAmount) return;
    
    if (fields.length === 0) {
      if (people.length === 0) return;
      const splitAmount = (Number(totalAmount) / people.length).toFixed(2);
      replace(people.map(p => ({
        person_id: p.id,
        amount_owed: splitAmount
      })));
    } else {
      const splitAmount = (Number(totalAmount) / fields.length).toFixed(2);
      fields.forEach((_, index) => {
        setValue(`splits.${index}.amount_owed`, splitAmount);
      });
    }
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      // 1. Upload photo if exists
      let photoUrl = existingPhotoUrl;
      if (data.receipt_photo && data.receipt_photo.length > 0) {
        const file = data.receipt_photo[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, file);
        
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(fileName);
          photoUrl = publicUrlData.publicUrl;
        } else {
          console.error("Upload error:", uploadError);
        }
      }

      const expensePayload = {
        description: data.description,
        total_amount: data.amount,
        expense_date: data.date,
        category_id: data.category_id || null,
        payment_method_id: data.payment_method_id || null,
        payer_id: data.payer_id || null,
        ...(photoUrl ? { receipt_photo_url: photoUrl } : {})
      };

      console.log("Submitting expense payload:", expensePayload);
      console.log("Is Editing:", isEditing, "ID:", id);

      let expenseId = id;

      if (isEditing) {
        const { data: updatedData, error: expenseError } = await supabase
          .from('expenses')
          .update(expensePayload)
          .eq('id', id)
          .select();
          
        if (expenseError) {
          console.error("Supabase update error:", expenseError);
          throw expenseError;
        }
        
        if (!updatedData || updatedData.length === 0) {
          throw new Error("Update failed. You might not have permission to edit this transaction, or it doesn't exist.");
        }
        
        // Verify that the database actually accepted the changes
        const updatedRow = updatedData[0];
        if (expensePayload.payer_id && updatedRow.payer_id !== expensePayload.payer_id) {
          console.warn("Database silently rejected payer_id update. Expected:", expensePayload.payer_id, "Got:", updatedRow.payer_id);
          throw new Error("The database rejected the change to 'Who Paid?'. You may not have permission to change the payer of this expense.");
        }
        
        console.log("Supabase update successful", updatedData);
      } else {
        // 2. Insert core Expense with payer_id
        const { data: expenseData, error: expenseError } = await supabase
          .from('expenses')
          .insert([expensePayload])
          .select();

        if (expenseError) throw expenseError;
        if (!expenseData || expenseData.length === 0) throw new Error("Insert failed. You might not have permission to add this transaction.");
        expenseId = expenseData[0].id;
      }

      // 3. Handle Splits
      if (isEditing) {
        // Fetch existing splits to preserve is_settled status
        const { data: existingSplits } = await supabase
          .from('expense_splits')
          .select('person_id, is_settled')
          .eq('expense_id', expenseId);
          
        await supabase.from('expense_splits').delete().eq('expense_id', expenseId);
        
        if (isSplitting && data.splits.length > 0) {
          const splitInserts = data.splits.map(split => {
            const existing = existingSplits?.find(s => s.person_id === split.person_id);
            return {
              expense_id: expenseId,
              person_id: split.person_id,
              amount_owed: Number(split.amount_owed),
              is_settled: existing ? existing.is_settled : false
            };
          });
          await supabase.from('expense_splits').insert(splitInserts);
        }
      } else {
        if (isSplitting && data.splits.length > 0) {
          const splitInserts = data.splits.map(split => ({
            expense_id: expenseId,
            person_id: split.person_id,
            amount_owed: Number(split.amount_owed),
            is_settled: false
          }));
          await supabase.from('expense_splits').insert(splitInserts);
        }
      }

      reset();
      setIsSplitting(false);
      navigate('/expenses', { replace: true });
    } catch (error: any) {
      console.error("Error saving expense:", error);
      alert(`Failed to save expense: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="text-on-surface min-h-screen relative overflow-hidden bg-surface">
      {/* Background Decoration */}
      <div className="fixed -top-24 -right-24 w-96 h-96 bg-tertiary-fixed/10 rounded-full blur-[100px] -z-10" />
      
      <header className="fixed top-0 w-full flex justify-between items-center px-6 py-4 bg-white/80 backdrop-blur-xl z-50 border-b border-black/5">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
          <X className="w-6 h-6" />
        </button>
        <h1 className="font-headline font-extrabold tracking-tight text-xl">{isEditing ? "Edit Transaction" : "New Transaction"}</h1>
        <div className="w-10" />
      </header>

      <form onSubmit={handleSubmit(onSubmit)}>
        <main className="pt-24 pb-48 px-6 max-w-xl mx-auto space-y-10">
          
          {/* Amount Section */}
          <section className="text-center py-6">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Amount</span>
            <div className="flex items-baseline justify-center">
              <span className="font-headline font-extrabold text-4xl text-gray-300 mr-2">RM</span>
              <input 
                type="number" 
                step="0.01"
                {...register("amount", { required: true, valueAsNumber: true })} 
                className="w-full max-w-[280px] bg-transparent border-none text-center font-headline font-extrabold text-7xl tracking-tighter text-black focus:ring-0 p-0 placeholder:text-gray-100" 
                placeholder="0.00" 
              />
            </div>
          </section>

          {/* Core Fields Section */}
          <section className="space-y-4">
            {/* Who Paid Dropdown - THE FIX */}
            <div className="group">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 ml-1">Who Paid?</label>
              <div className="relative flex items-center bg-white rounded-2xl px-5 py-4 shadow-sm border border-black/5">
                <UserIcon className="text-gray-400 mr-3 w-5 h-5" />
                <select 
                  {...register("payer_id", { required: true })} 
                  className="bg-transparent border-none p-0 w-full font-body text-base text-black focus:ring-0 appearance-none"
                >
                  <option value="">Select Payer</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div className="group">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 ml-1">Category</label>
              <div className="relative flex items-center bg-white rounded-2xl px-5 py-4 shadow-sm border border-black/5">
                <Tag className="text-gray-400 mr-3 w-5 h-5" />
                <select {...register("category_id", { required: true })} className="bg-transparent border-none p-0 w-full font-body text-base text-black focus:ring-0 appearance-none">
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="group">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 ml-1">Description</label>
              <div className="relative flex items-center bg-white rounded-2xl px-5 py-4 shadow-sm border border-black/5">
                <FileText className="text-gray-400 mr-3 w-5 h-5" />
                <input {...register("description", { required: true })} className="bg-transparent border-none p-0 w-full font-body text-base text-black focus:ring-0" placeholder="What was this for?" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 ml-1">Date</label>
                <div className="relative flex items-center bg-white rounded-2xl px-5 py-4 shadow-sm border border-black/5">
                  <Calendar className="text-gray-400 mr-3 w-5 h-5" />
                  <input type="date" {...register("date", { required: true })} className="bg-transparent border-none p-0 w-full font-body text-sm text-black focus:ring-0" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 ml-1">Payment</label>
                <div className="relative flex items-center bg-white rounded-2xl px-5 py-4 shadow-sm border border-black/5">
                  <CreditCard className="text-gray-400 mr-3 w-5 h-5" />
                  <select {...register("payment_method_id", { required: true })} className="bg-transparent border-none p-0 w-full font-body text-sm text-black focus:ring-0 appearance-none">
                    <option value="">Method</option>
                    {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Attachment */}
          <label className="bg-white rounded-2xl p-5 flex items-center justify-between shadow-sm border border-black/5 cursor-pointer active:scale-[0.98] transition-all">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                <Receipt className="text-gray-400 w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Add Receipt</h4>
                <p className="text-[10px] text-gray-400">
                  {watch('receipt_photo')?.[0] 
                    ? watch('receipt_photo')[0].name 
                    : existingPhotoUrl 
                      ? 'Photo attached (click to change)' 
                      : 'Capture photo or upload'}
                </p>
              </div>
            </div>
            <Plus className="w-5 h-5 text-gray-300" />
            <input type="file" accept="image/*" {...register("receipt_photo")} className="hidden" />
          </label>

          {/* Split Section */}
          <section className="space-y-4">
            <label className="flex items-center space-x-3 cursor-pointer bg-black text-white p-5 rounded-2xl shadow-xl">
              <input 
                type="checkbox" 
                checked={isSplitting} 
                onChange={(e) => setIsSplitting(e.target.checked)} 
                className="w-5 h-5 rounded border-white/20 bg-white/10 text-white focus:ring-0" 
              />
              <span className="font-bold">Split this bill?</span>
            </label>

            {isSplitting && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-5 bg-slate-50 rounded-3xl space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Involved People</span>
                  <button type="button" onClick={splitEqually} className="text-[10px] bg-black text-white font-bold px-3 py-1.5 rounded-full active:scale-95 transition-transform">
                    SPLIT EQUALLY
                  </button>
                </div>
                
                <div className="space-y-2">
                  {people.map((person) => {
                    const fieldIndex = fields.findIndex(f => f.person_id === person.id);
                    const isIncluded = fieldIndex !== -1;

                    return (
                      <div key={person.id} className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm">
                        <label className="flex items-center space-x-3 cursor-pointer flex-1">
                          <input 
                            type="checkbox" 
                            checked={isIncluded}
                            onChange={(e) => {
                              if (e.target.checked) append({ person_id: person.id, amount_owed: '' });
                              else remove(fieldIndex);
                            }}
                            className="w-5 h-5 rounded border-slate-200 text-black focus:ring-0"
                          />
                          <span className="text-sm font-bold">{person.name}</span>
                        </label>
                        
                        {isIncluded && (
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-gray-300">RM</span>
                            <input 
                              type="number" 
                              step="0.01"
                              {...register(`splits.${fieldIndex}.amount_owed` as const, { required: true })}
                              className="w-20 p-2 text-right font-bold text-sm bg-slate-50 border-none rounded-lg focus:ring-0"
                              placeholder="0.00"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </section>
        </main>

        <div className="fixed bottom-24 left-0 right-0 p-6 z-40 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-black text-white font-headline font-bold py-5 rounded-full shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:bg-gray-400"
            >
              {isSubmitting ? "Processing..." : <><CheckCircle className="w-5 h-5" /> {isEditing ? "Save Changes" : "Add Transaction"}</>}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}