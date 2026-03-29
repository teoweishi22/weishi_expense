import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ExpenseSplit, Person } from '@/types';
import { CheckCircle2, MessageCircle, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

export default function Settlements() {
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [splitsRes, peopleRes] = await Promise.all([
        supabase
          .from('expense_splits')
          .select('*, person:people(*), expense:expenses(*)')
          .eq('is_settled', false)
          .order('created_at', { ascending: false }),
        supabase.from('people').select('*').order('name'),
      ]);

      if (splitsRes.data) setSplits(splitsRes.data);
      if (peopleRes.data) setPeople(peopleRes.data);
    } catch (error) {
      console.error('Error fetching settlements:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsSettled = async (splitId: string) => {
    try {
      const { error } = await supabase
        .from('expense_splits')
        .update({ is_settled: true })
        .eq('id', splitId);

      if (error) throw error;
      
      // Optimistic update
      setSplits(splits.filter(s => s.id !== splitId));
    } catch (error) {
      console.error('Error marking as settled:', error);
      alert('Failed to update status.');
    }
  };

  const getShareUrl = (token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/shared/settlement/${token}`;
  };

  const sendWhatsAppReminder = (person: Person, amount: number) => {
    const shareUrl = getShareUrl(person.share_token);
    const message = `Hey ${person.name}! Just a quick update on our shared expenses. Your current outstanding share is RM ${amount.toFixed(2)}. You can view the breakdown and receipt photos here: ${shareUrl}`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  // Group by person
  const balancesByPerson = people.map(person => {
    const personSplits = splits.filter(s => s.person_id === person.id);
    const totalOwed = personSplits.reduce((sum, split) => sum + Number(split.amount_owed), 0);
    return { person, splits: personSplits, totalOwed };
  }).filter(b => b.totalOwed > 0);

  if (loading) return <div className="p-4 text-center">Loading settlements...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Settlements</h2>

      {balancesByPerson.length === 0 ? (
        <div className="bg-white p-8 rounded-xl shadow-sm border text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">All settled up!</p>
          <p className="text-sm text-gray-400 mt-1">No pending claims found.</p>
        </div>
      ) : (
        balancesByPerson.map(({ person, splits, totalOwed }) => (
          <div key={person.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{person.name}</h3>
                <p className="text-sm text-gray-500">Owes you <span className="font-semibold text-red-600">RM {totalOwed.toFixed(2)}</span></p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => sendWhatsAppReminder(person, totalOwed)}
                  className="flex items-center space-x-1 bg-green-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Remind</span>
                </button>
              </div>
            </div>
            
            <div className="divide-y">
              {splits.map(split => (
                <div key={split.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="font-medium text-gray-900">{split.expense?.description}</p>
                    <p className="text-xs text-gray-500">
                      {split.expense?.expense_date ? format(new Date(split.expense.expense_date), 'MMM d, yyyy') : 'Unknown date'}
                      {' • '}
                      Total: RM {Number(split.expense?.total_amount || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <p className="font-bold text-gray-900">RM {Number(split.amount_owed).toFixed(2)}</p>
                    <button
                      onClick={() => markAsSettled(split.id)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      Mark Paid
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-3 bg-gray-50 border-t flex justify-end">
               <a 
                 href={getShareUrl(person.share_token)} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="text-xs text-gray-500 hover:text-blue-600 flex items-center space-x-1"
               >
                 <span>View Magic Link</span>
                 <ExternalLink className="w-3 h-3" />
               </a>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
