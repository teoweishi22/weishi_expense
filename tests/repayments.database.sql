-- Run in a transaction with the migration, auth.uid() set to an existing test owner,
-- and SET LOCAL ROLE authenticated. ALWAYS ROLLBACK. No fixtures persist.
do $$
declare
  owner_id uuid := auth.uid(); me_id uuid; person_id uuid := gen_random_uuid();
  bill1 uuid := gen_random_uuid(); bill2 uuid := gen_random_uuid(); pay_id uuid := gen_random_uuid();
  split1 uuid := gen_random_uuid(); split2 uuid := gen_random_uuid(); total numeric; rejected boolean;
  result jsonb; paid_id uuid := gen_random_uuid(); other_person uuid := gen_random_uuid();
begin
  assert owner_id is not null, 'authenticated test context required';
  select id into strict me_id from public.people where lower(trim(name))='me';
  insert into public.people(id,name) values(person_id,'REPAYMENT TEST — rollback only'),(other_person,'OTHER TEST — rollback only');
  insert into public.expenses(id,user_id,description,total_amount,expense_date,payer_id) values
    (bill1,owner_id,'test oldest',475,'2026-01-01',me_id),
    (bill2,owner_id,'test newer',144.51,'2026-02-01',me_id),
    (pay_id,owner_id,'test original payment',500,'2026-03-01',person_id);
  insert into public.expense_splits(id,expense_id,person_id,amount_owed) values
    (split1,bill1,person_id,475),(split2,bill2,person_id,144.51);
  rejected:=false; begin update public.expense_splits set paid_amount=10 where id=split2; exception when others then rejected:=true; end;
  assert rejected, 'first paid amount cannot bypass the ledger';
  result := public.record_repayment(person_id,500,'2026-03-01','received','',pay_id,true,null);
  assert (result->>'already_recorded')::boolean=false, 'first recording';
  select sum(amount_owed-paid_amount) into total from public.expense_splits where id in(split1,split2);
  assert total=119.51, '619.51 minus 500 must be 119.51';
  assert (select amount_owed=475 and paid_amount=475 and is_settled from public.expense_splits where id=split1), 'oldest share settled';
  assert (select amount_owed=144.51 and paid_amount=25 and not is_settled from public.expense_splits where id=split2), 'partial share retains original amount';
  assert (select count(*)=1 from public.expenses where id=pay_id), 'convert in place';
  assert (select sum(amount)=500 from public.repayment_allocations where payment_id=pay_id), 'audit allocations match payment';
  result := public.record_repayment(person_id,500,'2026-03-01','received','',pay_id,true,null);
  assert (result->>'already_recorded')::boolean, 'retry is idempotent';
  assert (select paid_amount=25 from public.expense_splits where id=split2), 'retry does not deduct twice';
  rejected:=false; begin perform public.record_repayment(person_id,600,'2026-03-01','received','',gen_random_uuid()); exception when others then rejected:=true; end;
  assert rejected, 'overpayment rejected';
  rejected:=false; begin perform public.record_repayment(person_id,0,'2026-03-01','received','',gen_random_uuid()); exception when others then rejected:=true; end;
  assert rejected, 'zero rejected';
  rejected:=false; begin perform public.record_repayment(person_id,1.001,'2026-03-01','received','',gen_random_uuid()); exception when others then rejected:=true; end;
  assert rejected, 'sub-cent precision rejected';
  rejected:=false; begin perform public.record_repayment(person_id,'NaN','2026-03-01','received','',gen_random_uuid()); exception when others then rejected:=true; end;
  assert rejected, 'NaN rejected';
  rejected:=false; begin perform public.record_repayment(person_id,1,current_date+1,'received','',gen_random_uuid()); exception when others then rejected:=true; end;
  assert rejected, 'future date rejected';
  rejected:=false; begin perform public.record_repayment(other_person,500,'2026-03-01','received','',pay_id,true); exception when others then rejected:=true; end;
  assert rejected, 'changed retry details rejected';
  rejected:=false; begin update public.expenses set total_amount=1 where id=bill2; exception when others then rejected:=true; end;
  assert rejected, 'allocated bill edit rejected';
  rejected:=false; begin delete from public.expenses where id=pay_id; exception when others then rejected:=true; end;
  assert rejected, 'repayment deletion rejected';
  rejected:=false; begin delete from public.expense_splits where id=split2; exception when others then rejected:=true; end;
  assert rejected, 'allocated share deletion rejected';
  rejected:=false; begin update public.expense_splits set paid_amount=144.51,is_settled=true where id=split2; exception when others then rejected:=true; end;
  assert rejected, 'additional paid amount cannot bypass the ledger';
  rejected:=false; begin update public.expense_splits set paid_amount=0 where id=split2; exception when others then rejected:=true; end;
  assert rejected, 'paid amount cannot be erased';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  rejected:=false; begin perform public.record_repayment(person_id,1,'2026-03-01','received','',gen_random_uuid()); exception when others then rejected:=true; end;
  assert rejected, 'unauthenticated rejected';
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  rejected:=false; begin perform public.record_repayment(person_id,500,'2026-03-01','received','',pay_id,true); exception when others then rejected:=true; end;
  assert rejected, 'other user cannot convert or retry owner payment';
  assert (select count(*)=0 from public.repayment_allocations where payment_id=pay_id), 'ledger private to owner';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.record_repayment(person_id,119.51,'2026-03-02','received','final',gen_random_uuid(),false,split2);
  assert (select is_settled and paid_amount=amount_owed from public.expense_splits where id=split2), 'full final payment';
  insert into public.expenses(id,user_id,description,total_amount,expense_date,payer_id) values(paid_id,owner_id,'other paid bill',40,'2026-01-01',other_person);
  insert into public.expense_splits(expense_id,person_id,amount_owed) values(paid_id,me_id,40);
  perform public.record_repayment(other_person,10,'2026-03-02','paid','outgoing',gen_random_uuid());
  assert (select paid_amount=10 and amount_owed=40 and not is_settled from public.expense_splits where expense_id=paid_id), 'outgoing partial repayment';
end $$;
