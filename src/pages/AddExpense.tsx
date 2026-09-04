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
  User as UserIcon,
  Camera,
  Upload,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Image as ImageIcon
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

  // AI Receipt Scanning States
  const [entryMode, setEntryMode] = useState<'choice' | 'scan' | 'manual'>(isEditing ? 'manual' : 'choice');
  const [scannedFile, setScannedFile] = useState<File | null>(null);
  const [scannedPreviewUrl, setScannedPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [aiConfidence, setAiConfidence] = useState<{ merchant: number; amount: number; date: number; category: number } | null>(null);
  const [duplicateRecord, setDuplicateRecord] = useState<any | null>(null);
  const [showLightbox, setShowLightbox] = useState(false);

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
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

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

      if (isEditing && userId) {
        const { data: expense, error } = await supabase
          .from('expenses')
          .select('*, expense_splits(*)')
          .eq('id', id)
          .eq('user_id', userId)
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

  // Helper to reliably detect MIME type even for iPhone HEIC files where file.type may be blank
  const getEffectiveMimeType = (file: File): string => {
    if (file.type && file.type !== '') return file.type;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'heic' || ext === 'heif') return 'image/heic';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'pdf') return 'application/pdf';
    return 'image/jpeg';
  };

  // Compress and convert file to Base64
  const compressAndGetBase64 = (file: File): Promise<{ base64: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const effMime = getEffectiveMimeType(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        // If it's a HEIC file that browser cannot draw on canvas, fallback directly to raw base64
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'heic' || ext === 'heif' || effMime === 'image/heic' || effMime === 'image/heif') {
          const rawUrl = e.target?.result as string;
          const base64 = rawUrl.includes(',') ? rawUrl.split(',')[1] : rawUrl;
          resolve({ base64, mimeType: 'image/heic' });
          return;
        }

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const max_size = 1800; // 1800px for high-resolution OCR
          
          if (width > height) {
            if (width > max_size) {
              height *= max_size / width;
              width = max_size;
            }
          } else {
            if (height > max_size) {
              width *= max_size / height;
              height = max_size;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
          const base64 = dataUrl.split(',')[1];
          resolve({ base64, mimeType: 'image/jpeg' });
        };
        img.onerror = () => {
          const rawUrl = e.target?.result as string;
          const base64 = rawUrl.includes(',') ? rawUrl.split(',')[1] : rawUrl;
          resolve({ base64, mimeType: effMime });
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const fileToBase64 = (file: File): Promise<{ base64: string, mimeType: string }> => {
    const effMime = getEffectiveMimeType(file);
    if (effMime === 'application/pdf') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          const base64 = res.includes(',') ? res.split(',')[1] : res;
          resolve({ base64, mimeType: effMime });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } else {
      return compressAndGetBase64(file);
    }
  };

  // Smart Category Learning: Learn from user's historical transactions with similar merchant descriptions
  const learnCategoryFromHistory = async (merchant: string): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id || !merchant) return null;
      
      const { data } = await supabase
        .from('expenses')
        .select('category_id')
        .eq('user_id', session.user.id)
        .ilike('description', `%${merchant}%`)
        .order('expense_date', { ascending: false })
        .limit(1);
        
      if (data && data.length > 0 && data[0].category_id) {
        console.log("Smart Learning: Automatically mapped merchant to historical category", merchant, "->", data[0].category_id);
        return data[0].category_id;
      }
    } catch (err) {
      console.error("Smart Learning Error:", err);
    }
    return null;
  };

  // Duplicate Check: Check if similar transaction (same amount, date, description) already exists
  const checkDuplicates = async (merchant: string, amount: number, date: string) => {
    if (!merchant || !amount || !date) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('total_amount', amount)
        .eq('expense_date', date)
        .ilike('description', `%${merchant}%`);
        
      if (data && data.length > 0) {
        setDuplicateRecord(data[0]);
      } else {
        setDuplicateRecord(null);
      }
    } catch (err) {
      console.error("Duplicate Check Error:", err);
    }
  };

  // Receipt Scanner Action Trigger
  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setScannedFile(file);
    setScanError(null);
    setAiConfidence(null);
    setDuplicateRecord(null);
    
    const effMime = getEffectiveMimeType(file);
    // Generate raw preview URL if it's an image
    if (effMime.startsWith('image/')) {
      try {
        setScannedPreviewUrl(URL.createObjectURL(file));
      } catch {
        setScannedPreviewUrl(null);
      }
    } else {
      setScannedPreviewUrl(null);
    }

    setIsScanning(true);

    try {
      const { base64, mimeType } = await fileToBase64(file);
      const categoryNames = categories.map(c => c.name);

      const res = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType,
          existingCategories: categoryNames
        })
      });

      if (!res.ok) {
        let errMsg = "Server failed to process receipt.";
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {
          const text = await res.text();
          errMsg = text.length < 200 ? text : `Server returned status ${res.status}`;
        }
        throw new Error(errMsg);
      }

      const parsed = await res.json();

      if (parsed.is_unreadable || (!parsed.amount && (!parsed.merchant || parsed.merchant === ''))) {
        setScanError("We couldn't detect text on this receipt. Please ensure good lighting, avoid glare, and keep the receipt flat.");
        setIsScanning(false);
        return;
      }

      // Prepopulate form fields
      setValue("description", parsed.merchant || "Store Purchase");
      if (parsed.amount) {
        setValue("amount", parsed.amount);
      }
      if (parsed.date && parsed.date.trim() !== '') {
        setValue("date", parsed.date);
      } else {
        // Fallback to today's date if date is cropped out or not printed
        setValue("date", new Date().toISOString().split('T')[0]);
      }

      // Apply Smart Category learning or AI recommendation
      let targetCategoryId = '';
      const historicalCatId = await learnCategoryFromHistory(parsed.merchant);
      if (historicalCatId) {
        targetCategoryId = historicalCatId;
      } else {
        const matched = categories.find(c => c.name.toLowerCase() === parsed.category.toLowerCase());
        if (matched) {
          targetCategoryId = matched.id;
        } else {
          // Default to Others if found
          const others = categories.find(c => c.name.toLowerCase() === 'others' || c.name.toLowerCase() === 'uncategorized');
          if (others) targetCategoryId = others.id;
        }
      }

      if (targetCategoryId) {
        setValue("category_id", targetCategoryId);
      }

      // Check duplicates
      const checkDate = parsed.date || new Date().toISOString().split('T')[0];
      await checkDuplicates(parsed.merchant, parsed.amount, checkDate);

      setAiConfidence(parsed.confidence);
      setIsScanning(false);
      setEntryMode('manual');
    } catch (err: any) {
      console.error("Scanning Error:", err);
      setScanError(err.message || "An unexpected error occurred while scanning. Please try again.");
      setIsScanning(false);
    }
  };

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
      let fileToUpload = null;
      if (scannedFile) {
        fileToUpload = scannedFile;
      } else if (data.receipt_photo && data.receipt_photo.length > 0) {
        fileToUpload = data.receipt_photo[0];
      }

      if (fileToUpload) {
        const file = fileToUpload;
        const fileExt = file.name.split('.').pop() || 'jpg';
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

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      const expensePayload: any = {
        description: data.description,
        total_amount: data.amount,
        expense_date: data.date,
        category_id: data.category_id || null,
        payment_method_id: data.payment_method_id || null,
        payer_id: data.payer_id || null,
        ...(photoUrl ? { receipt_photo_url: photoUrl } : {})
      };

      if (!isEditing && userId) {
        expensePayload.user_id = userId;
      }

      console.log("Submitting expense payload:", expensePayload);
      console.log("Is Editing:", isEditing, "ID:", id);

      let expenseId = id;

      if (isEditing) {
        // First, check if the record actually exists to differentiate between "not found" and "permission denied"
        const { data: existingRecord, error: checkError } = await supabase
          .from('expenses')
          .select('id')
          .eq('id', id)
          .single();
          
        if (checkError || !existingRecord) {
          throw new Error(`The expense with ID ${id} was not found. It may have been deleted.`);
        }

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
          // If the record exists but update returns 0 rows, it's almost certainly RLS
          throw new Error(
            "Update failed due to database security rules (RLS). \n\n" +
            "To fix this, go to your Supabase Dashboard -> Database -> Policies and ensure you have an 'UPDATE' policy for the 'expenses' table that allows your user to modify this record."
          );
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

  if (entryMode === 'choice' && !isEditing) {
    return (
      <div className="text-on-surface min-h-screen relative overflow-hidden bg-surface flex flex-col justify-between">
        <div className="fixed -top-24 -right-24 w-96 h-96 bg-tertiary-fixed/10 rounded-full blur-[100px] -z-10" />
        
        <header className="w-full flex justify-between items-center px-6 py-4 bg-white/80 backdrop-blur-xl border-b border-black/5">
          <button type="button" onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-6 h-6" />
          </button>
          <h1 className="font-headline font-extrabold tracking-tight text-xl">Add Transaction</h1>
          <div className="w-10" />
        </header>

        <main className="flex-1 flex flex-col justify-center items-center px-6 max-w-xl mx-auto w-full space-y-12 py-12">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-sm border border-black/5">
              <Receipt className="w-8 h-8 text-black" />
            </div>
            <h2 className="font-headline font-extrabold text-2xl text-black">How would you like to add?</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto">Choose AI Receipt scanning for an ultra-fast automated entry, or input manually.</p>
          </div>

          <div className="w-full space-y-4">
            <button 
              type="button"
              onClick={() => setEntryMode('scan')}
              className="w-full bg-black text-white hover:bg-slate-900 active:scale-[0.99] p-6 rounded-2xl shadow-xl flex items-center justify-between transition-all group border border-black/10"
            >
              <div className="flex items-center space-x-4 text-left">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                  <Camera className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-headline font-extrabold text-lg flex items-center gap-2">
                    Scan Receipt <span className="text-[10px] bg-emerald-500 text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Recommended</span>
                  </h4>
                  <p className="text-xs text-slate-300">Take a photo or upload an image/PDF. AI extracts all fields.</p>
                </div>
              </div>
              <Plus className="w-6 h-6 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </button>

            <button 
              type="button"
              onClick={() => setEntryMode('manual')}
              className="w-full bg-white text-black hover:bg-slate-50 active:scale-[0.99] p-6 rounded-2xl shadow-sm border border-black/5 flex items-center justify-between transition-all group"
            >
              <div className="flex items-center space-x-4 text-left">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-black shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-headline font-extrabold text-lg text-black">Add Manually</h4>
                  <p className="text-xs text-gray-500">Key in description, category, and amount yourself.</p>
                </div>
              </div>
              <Plus className="w-6 h-6 text-gray-400 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </main>
        
        <div className="py-6 text-center text-xs text-gray-400">
          Secure, private, and encrypted transaction storage.
        </div>
      </div>
    );
  }

  if (entryMode === 'scan' && !isEditing) {
    return (
      <div className="text-on-surface min-h-screen relative overflow-hidden bg-surface flex flex-col justify-between">
        <div className="fixed -top-24 -right-24 w-96 h-96 bg-tertiary-fixed/10 rounded-full blur-[100px] -z-10" />
        
        <header className="w-full flex justify-between items-center px-6 py-4 bg-white/80 backdrop-blur-xl border-b border-black/5">
          <button type="button" onClick={() => setEntryMode('choice')} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-6 h-6" />
          </button>
          <h1 className="font-headline font-extrabold tracking-tight text-xl">Scan Receipt</h1>
          <div className="w-10" />
        </header>

        <main className="flex-1 flex flex-col justify-center items-center px-6 max-w-xl mx-auto w-full space-y-8 py-12">
          {isScanning ? (
            <div className="w-full text-center space-y-6">
              <div className="relative w-64 h-80 bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden mx-auto flex flex-col justify-between p-6">
                <motion.div 
                  className="absolute left-0 right-0 h-1 bg-emerald-500 shadow-[0_0_15px_#10b981]"
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                />
                
                {scannedPreviewUrl ? (
                  <img src={scannedPreviewUrl} alt="Scanning preview" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-50 opacity-10">
                    <Receipt className="w-20 h-20 text-black" />
                  </div>
                )}
                
                <div className="flex justify-between items-start z-10">
                  <div className="w-8 h-1 bg-slate-400 rounded" />
                  <div className="w-12 h-1 bg-slate-400 rounded" />
                </div>
                
                <div className="space-y-3 z-10">
                  <div className="h-4 bg-slate-200 rounded w-3/4 animate-pulse" />
                  <div className="h-4 bg-slate-200 rounded w-1/2 animate-pulse" />
                  <div className="h-8 bg-emerald-100 rounded w-5/6 animate-pulse" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-headline font-extrabold text-xl text-black flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                  Reading your receipt...
                </h3>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">Gemini AI is analyzing layout, merchant details, dates, items, tax, and extracting payment totals...</p>
              </div>
            </div>
          ) : scanError ? (
            <div className="w-full text-center space-y-6">
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto shadow-sm border border-red-200 text-red-500">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="font-headline font-extrabold text-xl text-black">Could Not Read Receipt</h3>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">{scanError}</p>
              </div>
              
              <div className="w-full space-y-3 pt-4">
                <label className="w-full bg-black text-white hover:bg-slate-900 active:scale-[0.99] p-4 rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer font-bold transition-all">
                  <Camera className="w-5 h-5" /> Retake Photo / Upload Again
                  <input type="file" accept="image/*,application/pdf" onChange={handleReceiptFileChange} className="hidden" />
                </label>
                
                <button 
                  type="button" 
                  onClick={() => setEntryMode('manual')}
                  className="w-full bg-white text-black hover:bg-slate-50 border border-black/5 p-4 rounded-xl font-bold transition-all"
                >
                  Enter Manually
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full text-center space-y-8">
              <div className="text-center space-y-2">
                <h2 className="font-headline font-extrabold text-2xl text-black">Scan Receipt</h2>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">Take a clear picture of your receipt or upload an image / PDF to automate input.</p>
              </div>
              
              <div className="w-full">
                <label className="border-2 border-dashed border-slate-300 hover:border-black rounded-3xl p-12 bg-white flex flex-col items-center justify-center cursor-pointer transition-all active:scale-[0.99] shadow-sm group">
                  <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-4 group-hover:bg-black group-hover:text-white transition-all shadow-inner">
                    <Camera className="w-8 h-8" />
                  </div>
                  <span className="font-headline font-bold text-base text-black mb-1">Take photo or select file</span>
                  <span className="text-xs text-gray-400">Supports JPEG, PNG, HEIC and PDF formats</span>
                  <input type="file" accept="image/*,application/pdf" onChange={handleReceiptFileChange} className="hidden" />
                </label>
              </div>
              
              <button 
                type="button" 
                onClick={() => setEntryMode('manual')}
                className="text-sm font-bold text-gray-500 hover:text-black underline transition-colors"
              >
                Or skip and enter manually
              </button>
            </div>
          )}
        </main>
        
        <div className="py-6 text-center text-xs text-gray-400">
          Supports native mobile camera capture instantly.
        </div>
      </div>
    );
  }

  return (
    <div className="text-on-surface min-h-screen relative overflow-hidden bg-surface">
      {/* Background Decoration */}
      <div className="fixed -top-24 -right-24 w-96 h-96 bg-tertiary-fixed/10 rounded-full blur-[100px] -z-10" />
      
      <header className="fixed top-0 w-full flex justify-between items-center px-6 py-4 bg-white/80 backdrop-blur-xl z-50 border-b border-black/5">
        <button 
          type="button"
          onClick={() => {
            if (!isEditing && entryMode !== 'choice') {
              setEntryMode('choice');
            } else {
              navigate(-1);
            }
          }} 
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"
        >
          <X className="w-6 h-6" />
        </button>
        <h1 className="font-headline font-extrabold tracking-tight text-xl">
          {isEditing ? "Edit Transaction" : "Add Transaction"}
        </h1>
        <div className="w-10" />
      </header>

      <form onSubmit={handleSubmit(onSubmit)}>
        <main className="pt-24 pb-48 px-6 max-w-xl mx-auto space-y-8">
          
          {/* AI Detection Success Header */}
          {aiConfidence && (
            <div className="bg-emerald-50 border border-emerald-500/10 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-emerald-950">Receipt Scan Successful</h4>
                  <p className="text-[10px] text-emerald-700">We extracted fields automatically. Please confirm before saving.</p>
                </div>
              </div>
            </div>
          )}

          {/* Duplicate Record Warning */}
          {duplicateRecord && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-600" /> Possible Duplicate Expense
              </div>
              <p className="text-xs text-amber-700">
                A similar record already exists: <strong className="text-black">{duplicateRecord.description}</strong> on {duplicateRecord.expense_date} of RM{Number(duplicateRecord.total_amount).toFixed(2)}.
              </p>
              <div className="flex gap-2 pt-1">
                <button 
                  type="button" 
                  onClick={() => navigate(`/edit/${duplicateRecord.id}`)}
                  className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold transition-all"
                >
                  View Existing
                </button>
                <button 
                  type="button" 
                  onClick={() => setDuplicateRecord(null)}
                  className="px-3 py-1.5 bg-white border border-amber-200 text-amber-800 rounded-lg text-xs font-medium transition-all"
                >
                  Save Anyway (Dismiss)
                </button>
              </div>
            </div>
          )}

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
            {aiConfidence && aiConfidence.amount < 0.6 && (
              <span className="text-xs text-amber-600 font-bold flex items-center justify-center gap-1 mt-1">
                ⚠️ Please check the extracted amount
              </span>
            )}
          </section>

          {/* Core Fields Section */}
          <section className="space-y-4">
            {/* Who Paid Dropdown */}
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
              {aiConfidence && aiConfidence.category < 0.6 && (
                <span className="text-xs text-amber-600 font-bold flex items-center gap-1 mt-1 ml-1">
                  ⚠️ AI was uncertain about the category
                </span>
              )}
            </div>

            <div className="group">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 ml-1">Company / Merchant</label>
              <div className="relative flex items-center bg-white rounded-2xl px-5 py-4 shadow-sm border border-black/5">
                <FileText className="text-gray-400 mr-3 w-5 h-5" />
                <input {...register("description", { required: true })} className="bg-transparent border-none p-0 w-full font-body text-base text-black focus:ring-0" placeholder="What was this for?" />
              </div>
              {aiConfidence && aiConfidence.merchant < 0.6 && (
                <span className="text-xs text-amber-600 font-bold flex items-center gap-1 mt-1 ml-1">
                  ⚠️ AI was uncertain about the merchant name
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 ml-1">Date</label>
                <div className="relative flex items-center bg-white rounded-2xl px-5 py-4 shadow-sm border border-black/5">
                  <Calendar className="text-gray-400 mr-3 w-5 h-5" />
                  <input type="date" {...register("date", { required: true })} className="bg-transparent border-none p-0 w-full font-body text-sm text-black focus:ring-0" />
                </div>
                {aiConfidence && aiConfidence.date < 0.6 && (
                  <span className="text-xs text-amber-600 font-bold flex items-center gap-1 mt-1 ml-1">
                    ⚠️ Please verify the transaction date
                  </span>
                )}
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

          {/* Attachment / Receipt Viewer */}
          <div className="space-y-2">
            <label className="bg-white rounded-2xl p-5 flex items-center justify-between shadow-sm border border-black/5 cursor-pointer active:scale-[0.98] transition-all">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden">
                  {scannedPreviewUrl ? (
                    <img src={scannedPreviewUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                  ) : (
                    <Receipt className="text-gray-400 w-5 h-5" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-sm">{scannedPreviewUrl ? 'Receipt Attached' : 'Add Receipt'}</h4>
                  <p className="text-[10px] text-gray-400">
                    {scannedFile 
                      ? scannedFile.name 
                      : watch('receipt_photo')?.[0] 
                        ? watch('receipt_photo')[0].name 
                        : existingPhotoUrl 
                          ? 'Photo attached (click to change)' 
                          : 'Capture photo or upload'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(scannedPreviewUrl || existingPhotoUrl) && (
                  <button 
                    type="button" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowLightbox(true);
                    }}
                    className="text-xs bg-black text-white px-3 py-1.5 rounded-lg font-bold"
                  >
                    View
                  </button>
                )}
                <Plus className="w-5 h-5 text-gray-300" />
              </div>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setScannedFile(file);
                  if (file.type.startsWith('image/')) {
                    setScannedPreviewUrl(URL.createObjectURL(file));
                  } else {
                    setScannedPreviewUrl(null); // PDF or non-image
                  }
                }
              }} className="hidden" />
            </label>
          </div>

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
                            <button
                              type="button"
                              onClick={() => {
                                if (totalAmount) setValue(`splits.${fieldIndex}.amount_owed`, totalAmount);
                              }}
                              className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-1 rounded hover:bg-slate-300"
                            >
                              FULL
                            </button>
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

      {/* Lightbox / Receipt Modal */}
      {showLightbox && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[100] flex flex-col justify-between p-6">
          <div className="flex justify-between items-center text-white">
            <span className="font-headline font-bold text-lg">Receipt Preview</span>
            <button 
              type="button"
              onClick={() => setShowLightbox(false)} 
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 flex items-center justify-center p-4">
            {scannedPreviewUrl || existingPhotoUrl ? (
              <img 
                src={scannedPreviewUrl || existingPhotoUrl || ''} 
                alt="Receipt Full Preview" 
                className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-2xl" 
              />
            ) : (
              <p className="text-white text-sm">No preview available for PDF receipts.</p>
            )}
          </div>
          
          <div className="text-center text-gray-400 text-xs">
            {scannedFile?.name || 'Attached receipt'}
          </div>
        </div>
      )}
    </div>
  );
}