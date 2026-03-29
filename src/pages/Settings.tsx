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
      if (peopleRes.data) setPeople(peopleRes.data);
    } catch (error) {
      console.error('Error fetching settings data:', error);
    } finally {
      setLoading(false);
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
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      setCategories(categories.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting category:', error);
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
      const { error } = await supabase.from('payment_methods').delete().eq('id', id);
      if (error) throw error;
      setPaymentMethods(paymentMethods.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error deleting payment method:', error);
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
      const { error } = await supabase.from('people').delete().eq('id', id);
      if (error) throw error;
      setPeople(people.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error deleting person:', error);
    }
  };

  if (loading) return <div className="p-4 text-center">Loading settings...</div>;

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-900">Settings</h2>

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
