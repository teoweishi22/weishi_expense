-- Additive bookkeeping: retain original shares and link each payment to its allocations.
alter table public.expense_splits add column paid_amount numeric(12,2) not null default 0
  check (paid_amount >= 0 and (paid_amount = 0 or paid_amount <= amount_owed));
alter table public.expenses add column repayment_person_id uuid references public.people(id) on delete restrict;
create table public.repayment_allocations (
  payment_id uuid not null references public.expenses(id) on delete restrict,
  split_id uuid not null references public.expense_splits(id) on delete restrict,
  user_id uuid not null references auth.users(id),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (payment_id, split_id)
);
create index repayment_allocations_split_idx on public.repayment_allocations(split_id);
create index repayment_allocations_user_idx on public.repayment_allocations(user_id);
alter table public.repayment_allocations enable row level security;
revoke all on public.repayment_allocations from public, anon, authenticated;
grant select, insert on public.repayment_allocations to authenticated;
grant all on public.repayment_allocations to service_role;
create policy repayment_owner_read on public.repayment_allocations for select to authenticated
  using ((select auth.uid()) = user_id);
create policy repayment_owner_insert on public.repayment_allocations for insert to authenticated
  with check ((select auth.uid()) = user_id
    and exists(select 1 from public.expenses e where e.id=payment_id and e.user_id=(select auth.uid()) and e.repayment_person_id is not null)
    and exists(select 1 from public.expense_splits s join public.expenses e on e.id=s.expense_id where s.id=split_id and e.user_id=(select auth.uid())));

-- Prevent the old expense editor from rewriting already allocated history.
create function public.protect_repayment_history() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if TG_TABLE_NAME='expenses' then
    if old.repayment_person_id is not null or exists(select 1 from public.expense_splits s where s.expense_id=old.id and s.paid_amount>0) then
      raise exception 'This record has repayments. Its original details must be preserved.';
    end if;
  elsif TG_OP<>'DELETE' and new.paid_amount <> coalesce((select sum(amount) from public.repayment_allocations where split_id=new.id),0) then
    raise exception 'Paid amounts must match the recorded repayment allocations.';
  elsif TG_OP<>'INSERT' and old.paid_amount>0 then
    if TG_OP='DELETE' then raise exception 'This share has repayments and cannot be deleted.'; end if;
    if new.expense_id is distinct from old.expense_id or new.person_id is distinct from old.person_id
      or new.amount_owed is distinct from old.amount_owed or new.paid_amount<old.paid_amount
      or new.is_settled is distinct from (new.paid_amount>=new.amount_owed) then
      raise exception 'This share has repayments. Its original amount and payment history must be preserved.';
    end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.protect_repayment_history() from public,anon,authenticated;
create trigger protect_expense_repayments before update or delete on public.expenses
  for each row execute function public.protect_repayment_history();
create trigger protect_split_repayments before insert or update or delete on public.expense_splits
  for each row execute function public.protect_repayment_history();

create function public.record_repayment(
  p_person_id uuid, p_amount numeric, p_date date, p_direction text, p_note text,
  p_payment_id uuid, p_existing boolean default false, p_split_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_user uuid := auth.uid(); v_me uuid; v_me_count integer; v_person text; v_payer uuid; v_debtor uuid;
  v_payment public.expenses%rowtype; v_row record; v_balance numeric; v_limit numeric;
  v_remaining numeric := p_amount; v_apply numeric; v_count integer;
begin
  if v_user is null then raise exception 'Please sign in before recording a repayment.'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount>99999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Enter a positive repayment amount with at most two decimal places.';
  end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'Choose a payment date that is not in the future.'; end if;
  if p_payment_id is null or p_direction is null or p_direction not in ('received','paid') or p_existing is null then raise exception 'Invalid repayment details.'; end if;
  if length(coalesce(p_note,''))>500 then raise exception 'Keep the repayment note within 500 characters.'; end if;
  select count(*), (array_agg(id))[1] into v_me_count,v_me from public.people where lower(trim(name))='me';
  if v_me_count<>1 then raise exception 'Exactly one ME person is required before recording repayments.'; end if;
  select name into v_person from public.people where id=p_person_id and id<>v_me;
  if not found then raise exception 'Choose a valid person other than ME.'; end if;
  v_payer := case when p_direction='received' then p_person_id else v_me end;
  v_debtor := case when p_direction='received' then p_person_id else v_me end;
  -- Serialize retries and payments for this account; lock source rows against concurrent edits.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
  perform 1 from public.expenses where user_id=v_user order by id for update;
  perform 1 from public.expense_splits s join public.expenses e on e.id=s.expense_id where e.user_id=v_user order by s.id for update of s;
  select * into v_payment from public.expenses where id=p_payment_id;
  if found then
    if v_payment.user_id is distinct from v_user then raise exception 'You can only record repayments for your own records.'; end if;
    if v_payment.repayment_person_id is not null then
      if v_payment.repayment_person_id=p_person_id and v_payment.total_amount=p_amount and v_payment.payer_id=v_payer and v_payment.expense_date=p_date
        and exists(select 1 from public.repayment_allocations where payment_id=p_payment_id and user_id=v_user) then
        return jsonb_build_object('payment_id',p_payment_id,'already_recorded',true);
      end if;
      raise exception 'This payment ID has already been used for different details.';
    end if;
    if not p_existing or v_payment.total_amount<>p_amount or v_payment.payer_id is distinct from v_payer or v_payment.expense_date<>p_date
      or v_payment.description like '[Settlement]%' or exists(select 1 from public.expense_splits where expense_id=p_payment_id) then
      raise exception 'Only a matching ordinary record without splits can be converted to a repayment.';
    end if;
  elsif p_existing then raise exception 'The original payment record was not found.';
  end if;

  select coalesce(sum(case when e.payer_id=v_me and s.person_id=p_person_id then s.amount_owed-s.paid_amount
    when e.payer_id=p_person_id and s.person_id=v_me then -(s.amount_owed-s.paid_amount) else 0 end),0)
  into v_balance from public.expense_splits s join public.expenses e on e.id=s.expense_id where e.user_id=v_user and not s.is_settled;
  v_limit := case when p_direction='received' then v_balance else -v_balance end;
  if p_split_id is not null then
    select s.amount_owed-s.paid_amount into v_limit from public.expense_splits s join public.expenses e on e.id=s.expense_id
      where s.id=p_split_id and e.user_id=v_user and not s.is_settled and s.person_id=v_debtor
        and e.payer_id=case when p_direction='received' then v_me else p_person_id end;
    if not found then raise exception 'This unpaid share is no longer available. Refresh and try again.'; end if;
  end if;
  if p_amount>v_limit then raise exception 'Repayment exceeds the current outstanding amount of RM %.',to_char(greatest(v_limit,0),'FM999999990.00'); end if;

  if p_existing then
    update public.expenses set description='[Settlement] '||trim(description),repayment_person_id=p_person_id where id=p_payment_id and user_id=v_user;
  else
    insert into public.expenses(id,user_id,description,total_amount,expense_date,payer_id,repayment_person_id)
      values(p_payment_id,v_user,'[Settlement] '||case when p_direction='received' then v_person||' paid back' else 'ME paid back to '||v_person end
        ||case when trim(coalesce(p_note,''))<>'' then ' — '||trim(p_note) else '' end,p_amount,p_date,v_payer,p_person_id);
  end if;
  for v_row in
    select s.id,s.amount_owed,s.paid_amount from public.expense_splits s join public.expenses e on e.id=s.expense_id
    where e.user_id=v_user and not s.is_settled and s.person_id=v_debtor
      and e.payer_id=case when p_direction='received' then v_me else p_person_id end
      and (p_split_id is null or s.id=p_split_id)
    order by e.expense_date,e.created_at,s.id
  loop
    exit when v_remaining<=0;
    v_apply := least(v_remaining,v_row.amount_owed-v_row.paid_amount);
    if v_apply>0 then
      insert into public.repayment_allocations(payment_id,split_id,user_id,amount) values(p_payment_id,v_row.id,v_user,v_apply);
      update public.expense_splits set paid_amount=paid_amount+v_apply,is_settled=(paid_amount+v_apply>=amount_owed) where id=v_row.id;
      v_remaining := v_remaining-v_apply;
    end if;
  end loop;
  if v_remaining<>0 then raise exception 'The balance changed. Refresh and try again.'; end if;
  return jsonb_build_object('payment_id',p_payment_id,'already_recorded',false);
end $$;
revoke all on function public.record_repayment(uuid,numeric,date,text,text,uuid,boolean,uuid) from public,anon;
grant execute on function public.record_repayment(uuid,numeric,date,text,text,uuid,boolean,uuid) to authenticated;
