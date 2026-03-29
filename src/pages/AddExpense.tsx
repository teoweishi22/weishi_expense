import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { UploadCloud } from 'lucide-react';
import { Category, PaymentMethod, Person } from '@/types';

type FormData = {
  description: string;
  amount: number;
  date: string;
  category_id: string;
  payment_method_id: string;
  receipt_photo: FileList;
  splits: { person_id: string; amount_owed: string | number }[];
};

export default function AddExpenseForm() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, control, handleSubmit, watch, setValue, reset } = useForm<FormData>({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
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
    }
    fetchData();
  }, []);

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

      // 2. Insert core Expense
      const { data: expenseData, error: expenseError } = await supabase
        .from('expenses')
        .insert([{
          description: data.description,
          total_amount: data.amount,
          expense_date: data.date,
          category_id: data.category_id,
          payment_method_id: data.payment_method_id,
          receipt_photo_url: photoUrl
        }])
        .select()
        .single();

      if (expenseError) throw expenseError;

      // 3. Insert Splits if applicable
      if (isSplitting && data.splits.length > 0) {
        const splitInserts = data.splits.map(split => ({
          expense_id: expenseData.id,
          person_id: split.person_id,
          amount_owed: Number(split.amount_owed),
          is_settled: false
        }));
        await supabase.from('expense_splits').insert(splitInserts);
      }

      alert("Expense added successfully!");
      reset();
      setIsSplitting(false);
      navigate('/');
    } catch (error) {
      console.error("Error adding expense:", error);
      alert("Failed to add expense.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg p-6 mx-auto space-y-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold text-gray-800">Add New Expense</h2>

      {/* Basic Details */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <input {...register("description", { required: true })} className="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="e.g., Grocery at Jaya Grocer" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Amount (RM)</label>
            <input type="number" step="0.01" {...register("amount", { required: true })} className="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Date</label>
            <input type="date" {...register("date", { required: true })} className="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <select {...register("category_id", { required: true })} className="w-full mt-1 p-2 border rounded-lg bg-white">
              <option value="">Select...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Payment Method</label>
            <select {...register("payment_method_id", { required: true })} className="w-full mt-1 p-2 border rounded-lg bg-white">
              <option value="">Select...</option>
              {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Receipt Photo</label>
          <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
            <UploadCloud className="w-6 h-6 text-gray-400 mr-2" />
            <span className="text-sm text-gray-500">Click to upload proof</span>
            <input type="file" accept="image/*" {...register("receipt_photo")} className="hidden" />
          </label>
        </div>
      </div>

      {/* Split Bill Section */}
      <div className="pt-4 border-t border-gray-100">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input type="checkbox" checked={isSplitting} onChange={(e) => setIsSplitting(e.target.checked)} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
          <span className="font-medium text-gray-700">Split this bill?</span>
        </label>

        {isSplitting && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-600">Who is involved?</span>
              <button type="button" onClick={splitEqually} className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-200">
                Split Equally
              </button>
            </div>
            
            {people.map((person) => {
              const fieldIndex = fields.findIndex(f => f.person_id === person.id);
              const isIncluded = fieldIndex !== -1;

              return (
                <div key={person.id} className="flex items-center justify-between">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isIncluded}
                      onChange={(e) => {
                        if (e.target.checked) append({ person_id: person.id, amount_owed: '' });
                        else remove(fieldIndex);
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{person.name}</span>
                  </label>
                  
                  {isIncluded && (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">RM</span>
                      <input 
                        type="number" 
                        step="0.01"
                        {...register(`splits.${fieldIndex}.amount_owed` as const, { required: true })}
                        className="w-24 p-1 text-sm border rounded"
                        placeholder="0.00"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button type="submit" disabled={isSubmitting} className="w-full py-3 px-4 bg-gray-900 hover:bg-black text-white rounded-lg font-medium transition-colors disabled:bg-gray-400">
        {isSubmitting ? "Saving..." : "Save Expense"}
      </button>
    </form>
  );
}
