import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Category, PaymentMethod, Person } from '@/types';
import { Plus, Trash2 } from 'lucide-react';

export default function Settings() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newCategory, setNewCategory] = useState({ name: '', color_code: '#3b82f6' });
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [newPerson, setNewPerson] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState<string>('');
  const [isSavingLimit, setIsSavingLimit] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [catsRes, pmRes, peopleRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('payment_methods').select('*').order('name'),
        supabase.from('people').select('*').order('name'),
      ]);

      if (catsRes.data) setCategories(catsRes.data);
      if (pmRes.data) setPaymentMethods(pmRes.data);
      if (peopleRes.data) {
        setPeople(peopleRes.data);
        // Case-insensitive search for 'Me'
        const me = peopleRes.data.find(p => p.name.toLowerCase() === 'me');
        if (me) {
          // Check if the property exists in the DB, even if it is 0
          setMonthlyLimit(
            me.monthly_limit !== undefined && me.monthly_limit !== null 
              ? me.monthly_limit.toString() 
              : '1000'
          );
        }
      }
    } catch (error) {
      console.error('Error fetching settings data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveMonthlyLimit = async () => {
    const me = people.find(p => p.name.toLowerCase() === 'me');
    if (!me) {
      alert("Could not find a person named 'Me'. Please add one first.");
      return;
    }

    const limitValue = parseFloat(monthlyLimit);
    if (isNaN(limitValue) || limitValue < 0) {
      alert("Please enter a valid positive number for the limit.");
      return;
    }

    setIsSavingLimit(true);
    try {
      const { data, error } = await supabase
        .from('people')
        .update({ monthly_limit: limitValue })
        .eq('id', me.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No rows were updated. Please check your Supabase RLS policies for the UPDATE operation.");
      }
      
      // Update local state
      setPeople(people.map(p => p.id === me.id ? { ...p, monthly_limit: limitValue } : p));
      alert("Monthly limit saved successfully!");
    } catch (error: any) {
      console.error('Error saving monthly limit:', error);
      alert(`Failed to save limit: ${error.message}`);
    } finally {
      setIsSavingLimit(false);
    }
  };

  const addCategory = async () => {
    if (!newCategory.name) return;
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert([{ name: newCategory.name, color_code: newCategory.color_code }])
        .select();
      if (error) throw error;
      if (data) setCategories([...categories, data[0]]);
      setNewCategory({ name: '', color_code: '#3b82f6' });
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const { data, error } = await supabase.from('categories').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No rows were deleted. Please check your Supabase RLS policies for the DELETE operation.");
      }
      setCategories(categories.filter(c => c.id !== id));
    } catch (error: any) {
      console.error('Error deleting category:', error);
      alert(`Failed to delete category: ${error.message}`);
    }
  };

  const addPaymentMethod = async () => {
    if (!newPaymentMethod) return;
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .insert([{ name: newPaymentMethod }])
        .select();
      if (error) throw error;
      if (data) setPaymentMethods([...paymentMethods, data[0]]);
      setNewPaymentMethod('');
    } catch (error) {
      console.error('Error adding payment method:', error);
    }
  };

  const deletePaymentMethod = async (id: string) => {
    try {
      const { data, error } = await supabase.from('payment_methods').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No rows were deleted. Please check your Supabase RLS policies for the DELETE operation.");
      }
      setPaymentMethods(paymentMethods.filter(p => p.id !== id));
    } catch (error: any) {
      console.error('Error deleting payment method:', error);
      alert(`Failed to delete payment method: ${error.message}`);
    }
  };

  const addPerson = async () => {
    if (!newPerson) return;
    try {
      const { data, error } = await supabase
        .from('people')
        .insert([{ name: newPerson }])
        .select();
      if (error) throw error;
      if (data) setPeople([...people, data[0]]);
      setNewPerson('');
    } catch (error) {
      console.error('Error adding person:', error);
    }
  };

  const deletePerson = async (id: string) => {
    try {
      const { data, error } = await supabase.from('people').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No rows were deleted. Please check your Supabase RLS policies for the DELETE operation.");
      }
      setPeople(people.filter(p => p.id !== id));
    } catch (error: any) {
      console.error('Error deleting person:', error);
      alert(`Failed to delete person: ${error.message}`);
    }
  };

  if (loading) return <div className="p-4 text-center">Loading settings...</div>;

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-900">Settings</h2>

      {/* Preferences Section */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Preferences</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monthly Spending Limit (RM)
            </label>
            <div className="flex space-x-2">
              <input
                type="number"
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
                placeholder="e.g. 1000"
                className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                min="0"
                step="0.01"
              />
              <button 
                onClick={saveMonthlyLimit}
                disabled={isSavingLimit}
                className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors font-medium"
              >
                {isSavingLimit ? 'Saving...' : 'Save Limit'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              This limit applies to the "Me" person and drives the progress bar on your dashboard.
            </p>
          </div>
        </div>
      </section>

      {/* People Section */}
      <section className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">People (Sisters / Family)</h3>
        <div className="flex space-x-2 mb-4">
          <input
            type="text"
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            placeholder="Add new person..."
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button onClick={addPerson} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <ul className="divide-y">
          {people.map(person => (
            <li key={person.id} className="py-3 flex justify-between items-center">
              <span className="font-medium text-gray-700">{person.name}</span>
              <button onClick={() => deletePerson(person.id)} className="text-red-500 hover:text-red-700 p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Categories Section */}
      <section className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Categories</h3>
        <div className="flex space-x-2 mb-4">
          <input
            type="text"
            value={newCategory.name}
            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
            placeholder="Category name..."
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="color"
            value={newCategory.color_code}
            onChange={(e) => setNewCategory({ ...newCategory, color_code: e.target.value })}
            className="w-10 h-10 p-1 border border-gray-300 rounded-lg cursor-pointer"
          />
          <button onClick={addCategory} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <ul className="divide-y">
          {categories.map(category => (
            <li key={category.id} className="py-3 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: category.color_code }}></div>
                <span className="font-medium text-gray-700">{category.name}</span>
              </div>
              <button onClick={() => deleteCategory(category.id)} className="text-red-500 hover:text-red-700 p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Payment Methods Section */}
      <section className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
        <div className="flex space-x-2 mb-4">
          <input
            type="text"
            value={newPaymentMethod}
            onChange={(e) => setNewPaymentMethod(e.target.value)}
            placeholder="Add payment method..."
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button onClick={addPaymentMethod} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <ul className="divide-y">
          {paymentMethods.map(method => (
            <li key={method.id} className="py-3 flex justify-between items-center">
              <span className="font-medium text-gray-700">{method.name}</span>
              <button onClick={() => deletePaymentMethod(method.id)} className="text-red-500 hover:text-red-700 p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
