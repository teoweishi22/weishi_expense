import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addColumn() {
  // We can't easily alter table with anon key, but we can try an RPC if one exists, or just check if it exists.
  const { data, error } = await supabase.from('expenses').select('paid_by_id').limit(1);
  if (error) {
    console.error('Column might not exist:', error.message);
  } else {
    console.log('Column exists!');
  }
}

addColumn();
