import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Category, PaymentMethod, Person } from '@/types';
import { Camera, Upload, X } from 'lucide-react';

type FormData = {
  description: string;
  total_amount: number;
  expense_date: string;
  category_id: string;
  payment_method_id: string;
  split_type: 'none' | 'equal' | 'custom';
  splits: { person_id: string; amount: number }[];
};

export default function AddExpense() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      expense_date: new Date().toISOString().split('T')[0],
      split_type: 'none',
      splits: [],
    }
  });

  const splitType = watch('split_type');
  const totalAmount = watch('total_amount');
  const splits = watch('splits');

  useEffect(() => {
    fetchFormData();
  }, []);

  useEffect(() => {
    if (splitType === 'equal' && totalAmount > 0 && people.length > 0) {
      // Assuming "Me" is included in people, or we split among selected people.
      // Let's just split equally among all people for simplicity in this demo,
      // or we can let user select who is involved.
      // For now, let's split equally among all sisters (excluding 'Me' if we want, but let's just use all people).
      const amountPerPerson = Number((totalAmount / people.length).toFixed(2));
      setValue('splits', people.map(p => ({ person_id: p.id, amount: amountPerPerson })));
    }
  }, [splitType, totalAmount, people, setValue]);

  const fetchFormData = async () => {
    setLoading(true);
    try {
      const [catsRes, pmRes, peopleRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('payment_methods').select('*').order('name'),
        supabase.from('people').select('*').order('name'),
      ]);

      if (catsRes.data) setCategories(catsRes.data);
      if (pmRes.data) setPaymentMethods(pmRes.data);
      if (peopleRes.data) setPeople(peopleRes.data);
    } catch (error) {
      console.error('Error fetching form data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      let receipt_photo_url = null;

      if (photoFile) {
        const fileExt = photoFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError, data: uploadData } = await supabase.storage
          .from('receipts')
          .upload(filePath, photoFile);

        if (uploadError) throw uploadError;
        
        const { data: publicUrlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(filePath);
          
        receipt_photo_url = publicUrlData.publicUrl;
      }

      const { data: expenseData, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          description: data.description,
          total_amount: data.total_amount,
          expense_date: data.expense_date,
          category_id: data.category_id,
          payment_method_id: data.payment_method_id,
          receipt_photo_url,
        })
        .select()
        .single();

      if (expenseError) throw expenseError;

      if (data.split_type !== 'none' && data.splits.length > 0) {
        const splitsToInsert = data.splits
          .filter(s => s.amount > 0)
          .map(s => ({
            expense_id: expenseData.id,
            person_id: s.person_id,
            amount_owed: s.amount,
            is_settled: false,
          }));

        if (splitsToInsert.length > 0) {
          const { error: splitsError } = await supabase
            .from('expense_splits')
            .insert(splitsToInsert);

          if (splitsError) throw splitsError;
        }
      }

      navigate('/');
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('Failed to add expense. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-4 text-center">Loading form...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Add Expense</h2>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input
            {...register('description', { required: 'Description is required' })}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            placeholder="e.g., Dinner at Madam Kwan's"
          />
          {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (RM)</label>
            <input
              type="number"
              step="0.01"
              {...register('total_amount', { required: 'Amount is required', min: 0.01 })}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="0.00"
            />
            {errors.total_amount && <p className="text-red-500 text-xs mt-1">{errors.total_amount.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              {...register('expense_date', { required: 'Date is required' })}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              {...register('category_id', { required: 'Category is required' })}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
            >
              <option value="">Select...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.category_id && <p className="text-red-500 text-xs mt-1">{errors.category_id.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select
              {...register('payment_method_id', { required: 'Payment Method is required' })}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
            >
              <option value="">Select...</option>
              {paymentMethods.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.payment_method_id && <p className="text-red-500 text-xs mt-1">{errors.payment_method_id.message}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Receipt Photo</label>
          {photoPreview ? (
            <div className="relative w-full h-48 rounded-lg overflow-hidden border border-gray-200">
              <img src={photoPreview} alt="Receipt Preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full hover:bg-black/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Camera className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </label>
          )}
        </div>

        <div className="border-t pt-6">
          <label className="block text-sm font-medium text-gray-900 mb-3">Split Bill?</label>
          <div className="flex space-x-4 mb-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="radio" value="none" {...register('split_type')} className="text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-700">No Split</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="radio" value="equal" {...register('split_type')} className="text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-700">Split Equally</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="radio" value="custom" {...register('split_type')} className="text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-700">Custom Split</span>
            </label>
          </div>

          {splitType !== 'none' && (
            <div className="space-y-3 bg-gray-50 p-4 rounded-lg border">
              {people.map((person, index) => (
                <div key={person.id} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{person.name}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">RM</span>
                    <input
                      type="number"
                      step="0.01"
                      {...register(`splits.${index}.amount` as const, { valueAsNumber: true })}
                      disabled={splitType === 'equal'}
                      className="w-24 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-right disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <input type="hidden" {...register(`splits.${index}.person_id` as const)} value={person.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all disabled:opacity-70 flex items-center justify-center"
        >
          {submitting ? (
            <span className="flex items-center space-x-2">
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Saving...</span>
            </span>
          ) : (
            'Save Expense'
          )}
        </button>
      </form>
    </div>
  );
}
