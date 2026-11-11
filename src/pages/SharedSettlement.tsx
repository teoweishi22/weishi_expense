import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ExpenseSplit, Person } from '@/types';
import { format } from 'date-fns';
import { Receipt, CheckCircle2 } from 'lucide-react';
import { outstanding, netBalance } from '@/lib/balances';

export default function SharedSettlement() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const ownerId = searchParams.get('owner');
  const [meId, setMeId] = useState('');
  const [person, setPerson] = useState<Person | null>(null);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      fetchSharedData(token);
    }
  }, [token, ownerId]);

  const fetchSharedData = async (shareToken: string) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Find the person by token
      const { data: personData, error: personError } = await supabase
        .from('people')
        .select('*')
        .eq('share_token', shareToken)
        .single();

      if (personError || !personData) {
        throw new Error('Invalid or expired link.');
      }

      setPerson(personData);

      const { data: meRows, error: meError } = await supabase.from('people').select('id').ilike('name', 'me');
      if (meError || meRows?.length !== 1) throw new Error('Could not identify the account owner.');
      const me = meRows[0].id;
      setMeId(me);
      // Fetch both directions. Links include the ledger owner so different accounts never mix.
      let theirs = supabase.from('expense_splits')
        .select('*, expense:expenses!expense_splits_expense_id_fkey!inner(*, category:categories(*))').eq('person_id', personData.id);
      let ours = supabase.from('expense_splits')
        .select('*, expense:expenses!expense_splits_expense_id_fkey!inner(*, category:categories(*))').eq('person_id', me).eq('expense.payer_id', personData.id);
      if (ownerId) {
        theirs = theirs.eq('expense.user_id', ownerId);
        ours = ours.eq('expense.user_id', ownerId);
      }
      const [theirResult, ourResult] = await Promise.all([theirs, ours]);
      if (theirResult.error) throw theirResult.error;
      if (ourResult.error) throw ourResult.error;
      const related = [...(theirResult.data || []), ...(ourResult.data || [])] as unknown as ExpenseSplit[];
      const relevant = related.filter(s => (s.expense?.payer_id === me && s.person_id === personData.id)
        || (s.expense?.payer_id === personData.id && s.person_id === me));
      const owners = new Set(relevant.map(s => s.expense?.user_id).filter(Boolean));
      if (!ownerId && owners.size > 1) throw new Error('Ask the sender for an updated settlement link.');
      setSplits(relevant.filter(s => !s.is_settled && outstanding(s)>0)
        .sort((a,b) => b.created_at.localeCompare(a.created_at)));

    } catch (err: any) {
      console.error('Error fetching shared data:', err);
      setError(err.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-gray-500">Loading your summary...</div>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border text-center max-w-md w-full">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-xl font-bold">!</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Oops!</h2>
          <p className="text-gray-600">{error || 'Something went wrong.'}</p>
        </div>
      </div>
    );
  }

  const totalOwed = netBalance(splits, meId, person.id);

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center pt-8 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Hello, {person.name}! 👋</h1>
          <p className="text-gray-600 mt-2">Here is a summary of your shared expenses.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border text-center">
          <p className="text-sm text-gray-500 font-medium uppercase tracking-wider mb-2">{totalOwed < 0 ? 'You Are Owed' : 'Total Outstanding'}</p>
          <p className="text-4xl font-bold text-red-600">RM {Math.abs(totalOwed).toFixed(2)}</p>
        </div>

        {totalOwed === 0 ? (
          <div className="bg-white p-8 rounded-xl shadow-sm border text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">You're all caught up!</p>
            <p className="text-sm text-gray-400 mt-1">No pending expenses found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 px-2">Pending Items</h2>
            {splits.map(split => (
              <div key={split.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 mt-1"
                      style={{ backgroundColor: split.expense?.category?.color_code || '#cbd5e1' }}
                    >
                      {split.expense?.category?.name.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{split.expense?.description}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {split.expense?.expense_date ? format(new Date(split.expense.expense_date), 'MMM d, yyyy') : 'Unknown date'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Total Bill: RM {Number(split.expense?.total_amount || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500 mb-1">Your Share</p>
                    <p className="font-bold text-gray-900 text-lg">{split.expense?.payer_id === meId ? '+' : '−'}RM {outstanding(split).toFixed(2)}</p>
                  </div>
                </div>
                
                {split.expense?.receipt_photo_url && (
                  <div className="bg-gray-50 p-3 border-t flex justify-end">
                    <button 
                      onClick={() => setSelectedImage(split.expense?.receipt_photo_url || null)}
                      className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Receipt className="w-4 h-4" />
                      <span>View Receipt</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 font-bold text-xl"
            >
              Close
            </button>
            <img 
              src={selectedImage} 
              alt="Receipt" 
              className="w-full h-full object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
