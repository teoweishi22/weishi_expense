export type Category = {
  id: string;
  name: string;
  color_code: string;
  created_at: string;
};

export type PaymentMethod = {
  id: string;
  name: string;
  created_at: string;
};

export type Person = {
  id: string;
  name: string;
  share_token: string;
  created_at: string;
};

export type Expense = {
  id: string;
  description: string;
  total_amount: number;
  expense_date: string;
  category_id: string;
  payment_method_id: string;
  paid_by_id?: string | null;
  receipt_photo_url: string | null;
  created_at: string;
  category?: Category;
  payment_method?: PaymentMethod;
  paid_by?: Person;
  expense_splits?: ExpenseSplit[];
};

export type ExpenseSplit = {
  id: string;
  expense_id: string;
  person_id: string;
  amount_owed: number;
  is_settled: boolean;
  created_at: string;
  person?: Person;
  expense?: Expense;
};
