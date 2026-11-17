-- Mintu SMM Panel — fresh Supabase schema
-- Run once in Supabase Dashboard → SQL Editor → New query.
-- This creates a new, empty SMM database. It does not import or modify Firebase data.

create extension if not exists pgcrypto;

create table if not exists public.smm_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  password_salt text not null,
  balance numeric(14,2) not null default 0 check (balance >= 0),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists smm_users_email_lower_uidx on public.smm_users (lower(email));

create table if not exists public.smm_services (
  id text primary key,
  name text not null,
  category text not null default 'Other',
  description text not null default '',
  source text not null default 'manual' check (source in ('manual','luvsmm')),
  pricing_model text not null default 'per1000' check (pricing_model in ('per1000','fixed')),
  supplier_service_id text,
  supplier_rate numeric(18,6) not null default 0,
  supplier_currency text not null default 'INR',
  supplier_type text not null default 'Default',
  min_quantity integer not null default 1 check (min_quantity >= 1),
  max_quantity integer not null default 10000 check (max_quantity >= min_quantity),
  refill boolean not null default false,
  cancel boolean not null default false,
  restricted boolean not null default false,
  approval_status text not null default 'needs_review' check (approval_status in ('needs_review','approved','rejected','blocked')),
  compliance_verified boolean not null default false,
  active boolean not null default false,
  selling_price_per_1000 numeric(14,4) not null default 0 check (selling_price_per_1000 >= 0),
  review_note text not null default '',
  reviewed_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists smm_services_public_idx on public.smm_services (active, approval_status, compliance_verified, category, name);
create index if not exists smm_services_supplier_idx on public.smm_services (supplier_service_id);

create table if not exists public.smm_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.smm_users(id) on delete restrict,
  user_email text not null default '',
  user_name text not null default '',
  service_id text not null,
  service_name text not null,
  category text not null default 'Other',
  pricing_model text not null default 'per1000',
  source text not null default 'manual' check (source in ('manual','luvsmm')),
  supplier_service_id text,
  link text not null,
  quantity integer not null check (quantity >= 1),
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'Submitting',
  supplier_order_id text,
  supplier_charge numeric(14,4),
  remains integer,
  start_count bigint,
  refunded_amount numeric(14,2) not null default 0,
  refund_note text,
  refunded_at timestamptz,
  admin_note text,
  dispatch_note text,
  supplier_response_at timestamptz,
  supplier_status_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists smm_orders_user_created_idx on public.smm_orders (user_id, created_at desc);
create index if not exists smm_orders_created_idx on public.smm_orders (created_at desc);
create index if not exists smm_orders_status_idx on public.smm_orders (status, created_at desc);
create index if not exists smm_orders_supplier_idx on public.smm_orders (supplier_order_id);

create table if not exists public.smm_wallet_payments (
  razorpay_order_id text primary key,
  user_id uuid not null references public.smm_users(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created','paid','failed')),
  payment_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists smm_wallet_payments_user_idx on public.smm_wallet_payments (user_id, created_at desc);
create index if not exists smm_wallet_payments_status_idx on public.smm_wallet_payments (status);

create table if not exists public.smm_transactions (
  id text primary key,
  user_id uuid not null references public.smm_users(id) on delete restrict,
  type text not null check (type in ('deposit','order','refund','adjustment')),
  amount numeric(14,2) not null,
  currency text not null default 'INR',
  reference text not null default '',
  razorpay_order_id text,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists smm_transactions_user_created_idx on public.smm_transactions (user_id, created_at desc);
create index if not exists smm_transactions_created_idx on public.smm_transactions (created_at desc);

create table if not exists public.smm_settings (
  id text primary key,
  site_name text not null default 'Mintu Social',
  markup_percent numeric(7,2) not null default 30 check (markup_percent between 0 and 500),
  support_email text not null default '',
  last_service_sync_at timestamptz,
  last_service_sync_count integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.smm_settings (id, site_name, markup_percent)
values ('main', 'Mintu Social', 30)
on conflict (id) do nothing;

-- Atomic Razorpay payment credit + exactly-once ledger insertion.
create or replace function public.smm_credit_wallet_payment(
  p_razorpay_order_id text,
  p_payment_id text,
  p_user_id uuid,
  p_amount_paise bigint,
  p_currency text default 'INR'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_payment public.smm_wallet_payments%rowtype;
  v_balance numeric(14,2);
begin
  select * into v_payment from public.smm_wallet_payments
  where razorpay_order_id = p_razorpay_order_id for update;
  if not found then raise exception 'Payment record not found.'; end if;
  if v_payment.user_id <> p_user_id then raise exception 'Payment belongs to another account.'; end if;
  if v_payment.status = 'paid' then
    select balance into v_balance from public.smm_users where id = p_user_id;
    return jsonb_build_object('ok', true, 'alreadyCredited', true, 'balance', v_balance);
  end if;
  if v_payment.status <> 'created' then raise exception 'This payment is no longer active.'; end if;
  if upper(coalesce(p_currency, '')) <> 'INR' or p_amount_paise <> round(v_payment.amount * 100)::bigint then
    raise exception 'Payment amount or currency mismatch.';
  end if;
  update public.smm_users
    set balance = balance + v_payment.amount, updated_at = now()
    where id = p_user_id and disabled = false
    returning balance into v_balance;
  if not found then raise exception 'User account is unavailable.'; end if;
  update public.smm_wallet_payments
    set status = 'paid', payment_id = p_payment_id, paid_at = now()
    where razorpay_order_id = p_razorpay_order_id;
  insert into public.smm_transactions (id, user_id, type, amount, currency, reference, razorpay_order_id, note)
  values ('deposit_' || p_razorpay_order_id, p_user_id, 'deposit', v_payment.amount, 'INR', p_payment_id, p_razorpay_order_id, 'Wallet recharge')
  on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

-- Atomic wallet reservation + order + debit ledger.
create or replace function public.smm_place_order(
  p_user_id uuid,
  p_service_id text,
  p_link text,
  p_quantity integer,
  p_user_email text,
  p_user_name text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_service public.smm_services%rowtype;
  v_user public.smm_users%rowtype;
  v_cost numeric(14,2);
  v_order public.smm_orders%rowtype;
  v_source text;
  v_status text;
begin
  select * into v_service from public.smm_services
    where id = p_service_id for update;
  if not found or not (v_service.active and v_service.approval_status = 'approved' and v_service.compliance_verified and v_service.selling_price_per_1000 > 0) then
    raise exception 'This service is not available for ordering.';
  end if;
  if p_quantity < v_service.min_quantity or p_quantity > v_service.max_quantity then
    raise exception 'Quantity must be between % and %.', v_service.min_quantity, v_service.max_quantity;
  end if;
  select * into v_user from public.smm_users where id = p_user_id for update;
  if not found or v_user.disabled then raise exception 'User account is unavailable.'; end if;
  if v_service.pricing_model = 'fixed' then
    v_cost := round(v_service.selling_price_per_1000, 2);
  else
    v_cost := greatest(1, round((p_quantity * v_service.selling_price_per_1000 / 1000.0), 2));
  end if;
  if v_user.balance < v_cost then raise exception 'Insufficient wallet balance. Required ₹%.', to_char(v_cost, 'FM999999990.00'); end if;
  v_source := case when v_service.source = 'luvsmm' then 'luvsmm' else 'manual' end;
  if v_source = 'luvsmm' and coalesce(v_service.supplier_service_id, '') = '' then raise exception 'Supplier service ID is missing. Re-sync the catalogue.'; end if;
  update public.smm_users set balance = balance - v_cost, updated_at = now() where id = p_user_id;
  v_status := case when v_source = 'manual' then 'Awaiting review' else 'Submitting' end;
  insert into public.smm_orders (
    user_id, user_email, user_name, service_id, service_name, category, pricing_model,
    source, supplier_service_id, link, quantity, amount, status, remains
  ) values (
    p_user_id, coalesce(p_user_email,''), coalesce(p_user_name,''), v_service.id, v_service.name,
    v_service.category, v_service.pricing_model, v_source, v_service.supplier_service_id,
    p_link, p_quantity, v_cost, v_status, p_quantity
  ) returning * into v_order;
  insert into public.smm_transactions (id, user_id, type, amount, currency, reference, note)
  values ('order_' || v_order.id::text, p_user_id, 'order', -v_cost, 'INR', v_order.id::text, 'Order: ' || v_service.name);
  return to_jsonb(v_order);
end;
$$;

-- Atomic customer-wallet refund, safe to retry only once per order.
create or replace function public.smm_refund_order(p_order_id uuid, p_note text default 'Refunded by admin')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.smm_orders%rowtype;
  v_balance numeric(14,2);
  v_refund numeric(14,2);
  v_note text;
begin
  select * into v_order from public.smm_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if v_order.status in ('Refunded','Partially refunded','Completed') or v_order.refunded_amount > 0 then
    raise exception 'This order is already closed or refunded.';
  end if;
  v_refund := v_order.amount;
  if v_order.status = 'Partial' then
    v_refund := round(v_order.amount * greatest(0, least(v_order.quantity, coalesce(v_order.remains, v_order.quantity))) / greatest(1, v_order.quantity), 2);
  end if;
  if v_refund <= 0 then raise exception 'There is no refundable balance for this order.'; end if;
  update public.smm_users set balance = balance + v_refund, updated_at = now()
    where id = v_order.user_id returning balance into v_balance;
  if not found then raise exception 'Customer account not found.'; end if;
  v_note := left(coalesce(nullif(p_note,''), 'Refunded by admin'), 300);
  update public.smm_orders set
    status = case when v_order.status = 'Partial' then 'Partially refunded' else 'Refunded' end,
    refunded_amount = v_refund, refund_note = v_note, refunded_at = now(), updated_at = now()
    where id = p_order_id;
  insert into public.smm_transactions (id, user_id, type, amount, currency, reference, note)
  values ('refund_' || p_order_id::text, v_order.user_id, 'refund', v_refund, 'INR', p_order_id::text, v_note)
  on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'refundAmount', v_refund, 'balance', v_balance);
end;
$$;

-- Lightweight dashboard aggregates: one SQL-side aggregate, not a download of entire tables.
create or replace function public.smm_admin_overview()
returns jsonb
language sql security definer set search_path = public
as $$
  select jsonb_build_object(
    'users', (select count(*) from public.smm_users),
    'services', (select count(*) from public.smm_services),
    'approvedServices', (select count(*) from public.smm_services where active = true and approval_status = 'approved' and compliance_verified = true),
    'orders', (select count(*) from public.smm_orders),
    'activeOrders', (select count(*) from public.smm_orders where status in ('Awaiting review','Submitting','Pending','Processing','In progress','Supplier confirmation needed')),
    'payments', (select count(*) from public.smm_wallet_payments where status = 'paid'),
    'totalDeposits', coalesce((select sum(amount) from public.smm_wallet_payments where status = 'paid'),0),
    'totalSales', coalesce((select sum(amount) from public.smm_orders),0)
  );
$$;

-- RLS is enabled on every table. The browser has no database key; all data access
-- is through the Vercel API using SUPABASE_SECRET_KEY on the server.
alter table public.smm_users enable row level security;
alter table public.smm_services enable row level security;
alter table public.smm_orders enable row level security;
alter table public.smm_wallet_payments enable row level security;
alter table public.smm_transactions enable row level security;
alter table public.smm_settings enable row level security;

grant usage on schema public to service_role;
revoke all on public.smm_users, public.smm_services, public.smm_orders, public.smm_wallet_payments, public.smm_transactions, public.smm_settings from public, anon, authenticated;
grant all on public.smm_users, public.smm_services, public.smm_orders, public.smm_wallet_payments, public.smm_transactions, public.smm_settings to service_role;

revoke all on function public.smm_credit_wallet_payment(text,text,uuid,bigint,text) from public, anon, authenticated;
revoke all on function public.smm_place_order(uuid,text,text,integer,text,text) from public, anon, authenticated;
revoke all on function public.smm_refund_order(uuid,text) from public, anon, authenticated;
revoke all on function public.smm_admin_overview() from public, anon, authenticated;
grant execute on function public.smm_credit_wallet_payment(text,text,uuid,bigint,text) to service_role;
grant execute on function public.smm_place_order(uuid,text,text,integer,text,text) to service_role;
grant execute on function public.smm_refund_order(uuid,text) to service_role;
grant execute on function public.smm_admin_overview() to service_role;

-- ---------------------------------------------------------------------------
-- Mintu SMM extended features (safe to run on the existing fresh schema)
-- ---------------------------------------------------------------------------
alter table public.smm_users alter column password_hash drop not null;
alter table public.smm_users alter column password_salt drop not null;
alter table public.smm_users add column if not exists google_sub text;
alter table public.smm_users add column if not exists avatar_url text not null default '';
create unique index if not exists smm_users_google_sub_uidx on public.smm_users (google_sub) where google_sub is not null;

alter table public.smm_services add column if not exists price_override boolean not null default false;
-- Keep supplier catalogue metadata separate from the customer-facing fields admin edits.
alter table public.smm_services add column if not exists supplier_name text;
alter table public.smm_services add column if not exists supplier_category text;
alter table public.smm_services add column if not exists supplier_description text;
alter table public.smm_services add column if not exists name_override boolean not null default false;
alter table public.smm_services add column if not exists category_override boolean not null default false;
alter table public.smm_services add column if not exists description_override boolean not null default false;
update public.smm_services set
  supplier_name = coalesce(supplier_name, name),
  supplier_category = coalesce(supplier_category, category),
  supplier_description = coalesce(supplier_description, description),
  category_override = case when source = 'luvsmm' then true else category_override end
where supplier_name is null or supplier_category is null or supplier_description is null;

alter table public.smm_settings add column if not exists usd_to_inr_rate numeric(14,6) not null default 0;
alter table public.smm_settings add column if not exists markup_type text not null default 'percent' check (markup_type in ('percent','fixed'));
alter table public.smm_settings add column if not exists markup_value numeric(14,4) not null default 30;
alter table public.smm_settings add column if not exists min_deposit numeric(14,2) not null default 50;
alter table public.smm_settings add column if not exists max_deposit numeric(14,2) not null default 50000;
alter table public.smm_settings add column if not exists welcome_bonus numeric(14,2) not null default 0 check (welcome_bonus >= 0);
update public.smm_settings set markup_value = markup_percent where id = 'main' and markup_value = 30;

create table if not exists public.smm_categories (
  id text primary key,
  name text not null unique,
  icon text not null default 'layers',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.smm_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.smm_users(id) on delete restrict,
  user_email text not null default '',
  subject text not null,
  status text not null default 'Open' check (status in ('Open','In Progress','Resolved','Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists smm_tickets_user_created_idx on public.smm_tickets(user_id, created_at desc);
create index if not exists smm_tickets_status_updated_idx on public.smm_tickets(status, updated_at desc);

create table if not exists public.smm_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.smm_tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','admin')),
  sender_id uuid,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists smm_ticket_messages_ticket_created_idx on public.smm_ticket_messages(ticket_id, created_at asc);

-- Atomic admin wallet adjustment; positive adds, negative deducts. Never permits a negative wallet.
create or replace function public.smm_admin_adjust_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_note text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_balance numeric(14,2); v_amount numeric(14,2) := round(p_amount, 2); v_user public.smm_users%rowtype;
begin
  if v_amount = 0 or abs(v_amount) > 1000000 then raise exception 'Enter a valid adjustment amount.'; end if;
  select * into v_user from public.smm_users where id = p_user_id for update;
  if not found or v_user.disabled then raise exception 'Customer account is unavailable.'; end if;
  if v_user.balance + v_amount < 0 then raise exception 'Deduction exceeds the available customer wallet balance.'; end if;
  update public.smm_users set balance = balance + v_amount, updated_at = now() where id = p_user_id returning balance into v_balance;
  insert into public.smm_transactions(id,user_id,type,amount,currency,reference,note)
  values ('admin_adjust_' || gen_random_uuid()::text, p_user_id, 'adjustment', v_amount, 'INR', 'admin', left(coalesce(p_note,'Admin wallet adjustment'),300));
  return jsonb_build_object('ok',true,'balance',v_balance);
end;
$$;

revoke all on function public.smm_admin_adjust_wallet(uuid,numeric,text) from public, anon, authenticated;
grant execute on function public.smm_admin_adjust_wallet(uuid,numeric,text) to service_role;

-- Recalculate all supplier retail rates in one database operation while preserving manual overrides.
create or replace function public.smm_recalculate_supplier_prices(
  p_usd_to_inr_rate numeric,
  p_markup_type text,
  p_markup_value numeric
) returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  if p_usd_to_inr_rate < 0 or p_usd_to_inr_rate > 10000 then raise exception 'Invalid USD/INR exchange rate.'; end if;
  if p_markup_type not in ('percent','fixed') or p_markup_value < 0 or p_markup_value > 500 then raise exception 'Invalid margin settings.'; end if;
  update public.smm_services
  set selling_price_per_1000 = case
    when upper(coalesce(supplier_currency,'USD')) = 'USD' then
      round((supplier_rate * p_usd_to_inr_rate * case when p_markup_type = 'percent' then (1 + p_markup_value / 100.0) else 1 end
        + case when p_markup_type = 'fixed' then p_markup_value else 0 end)::numeric, 2)
    when upper(coalesce(supplier_currency,'USD')) = 'INR' then
      round((supplier_rate * case when p_markup_type = 'percent' then (1 + p_markup_value / 100.0) else 1 end
        + case when p_markup_type = 'fixed' then p_markup_value else 0 end)::numeric, 2)
    else 0 end,
    updated_at = now()
  where source = 'luvsmm' and price_override = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.smm_recalculate_supplier_prices(numeric,text,numeric) from public, anon, authenticated;
grant execute on function public.smm_recalculate_supplier_prices(numeric,text,numeric) to service_role;

alter table public.smm_categories enable row level security;
alter table public.smm_tickets enable row level security;
alter table public.smm_ticket_messages enable row level security;
revoke all on public.smm_categories, public.smm_tickets, public.smm_ticket_messages from public, anon, authenticated;
grant all on public.smm_categories, public.smm_tickets, public.smm_ticket_messages to service_role;
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Announcement banner, Deposit Bonus Slabs & Promo / Coupon Codes
-- ---------------------------------------------------------------------------
alter table public.smm_settings add column if not exists announcement_enabled boolean not null default false;
alter table public.smm_settings add column if not exists announcement_text text not null default '';
alter table public.smm_settings add column if not exists announcement_type text not null default 'info' check (announcement_type in ('info','offer','warning'));
alter table public.smm_settings add column if not exists announcement_link text not null default '';

alter table public.smm_wallet_payments add column if not exists promo_code text not null default '';
alter table public.smm_orders add column if not exists promo_code text not null default '';
alter table public.smm_orders add column if not exists discount_amount numeric(14,2) not null default 0;

create table if not exists public.smm_deposit_bonuses (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  min_amount numeric(14,2) not null default 0 check (min_amount >= 0),
  bonus_type text not null default 'percent' check (bonus_type in ('percent','fixed')),
  bonus_value numeric(14,2) not null default 0 check (bonus_value >= 0),
  first_deposit_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.smm_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  applies_to text not null default 'deposit' check (applies_to in ('deposit','order')),
  discount_type text not null default 'percent' check (discount_type in ('percent','fixed')),
  discount_value numeric(14,2) not null default 0 check (discount_value > 0),
  min_amount numeric(14,2) not null default 0 check (min_amount >= 0),
  max_discount numeric(14,2) not null default 0 check (max_discount >= 0),
  max_uses integer not null default 0 check (max_uses >= 0),
  per_user_limit integer not null default 1 check (per_user_limit >= 0),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists smm_promo_codes_code_upper_uidx on public.smm_promo_codes (upper(code));

create table if not exists public.smm_promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.smm_promo_codes(id) on delete cascade,
  user_id uuid not null references public.smm_users(id) on delete cascade,
  context text not null check (context in ('deposit','order')),
  reference_id text not null default '',
  bonus_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists smm_promo_redemptions_user_idx on public.smm_promo_redemptions (promo_id, user_id);

alter table public.smm_deposit_bonuses enable row level security;
alter table public.smm_promo_codes enable row level security;
alter table public.smm_promo_redemptions enable row level security;
revoke all on public.smm_deposit_bonuses, public.smm_promo_codes, public.smm_promo_redemptions from public, anon, authenticated;
grant all on public.smm_deposit_bonuses, public.smm_promo_codes, public.smm_promo_redemptions to service_role;

-- Atomic Razorpay payment credit + Deposit Bonus Slabs + Deposit Promo Code bonus.
create or replace function public.smm_credit_wallet_payment(
  p_razorpay_order_id text,
  p_payment_id text,
  p_user_id uuid,
  p_amount_paise bigint,
  p_currency text default 'INR'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_payment public.smm_wallet_payments%rowtype;
  v_balance numeric(14,2);
  v_prior_paid integer := 0;
  v_slab_bonus numeric(14,2) := 0;
  v_slab_title text := '';
  v_promo public.smm_promo_codes%rowtype;
  v_promo_bonus numeric(14,2) := 0;
  v_user_redemptions integer := 0;
  v_total_credit numeric(14,2);
begin
  select * into v_payment from public.smm_wallet_payments
  where razorpay_order_id = p_razorpay_order_id for update;
  if not found then raise exception 'Payment record not found.'; end if;
  if v_payment.user_id <> p_user_id then raise exception 'Payment belongs to another account.'; end if;
  if v_payment.status = 'paid' then
    select balance into v_balance from public.smm_users where id = p_user_id;
    return jsonb_build_object('ok', true, 'alreadyCredited', true, 'balance', v_balance);
  end if;
  if v_payment.status <> 'created' then raise exception 'This payment is no longer active.'; end if;
  if upper(coalesce(p_currency, '')) <> 'INR' or p_amount_paise <> round(v_payment.amount * 100)::bigint then
    raise exception 'Payment amount or currency mismatch.';
  end if;

  -- Check if this is user's first paid deposit
  select count(*) into v_prior_paid from public.smm_wallet_payments
  where user_id = p_user_id and status = 'paid' and razorpay_order_id <> p_razorpay_order_id;

  -- Highest qualifying deposit bonus slab
  select
    round((case when bonus_type = 'percent' then v_payment.amount * bonus_value / 100.0 else bonus_value end)::numeric, 2),
    coalesce(nullif(title, ''), 'Deposit bonus')
  into v_slab_bonus, v_slab_title
  from public.smm_deposit_bonuses
  where active = true
    and v_payment.amount >= min_amount
    and (first_deposit_only = false or v_prior_paid = 0)
  order by round((case when bonus_type = 'percent' then v_payment.amount * bonus_value / 100.0 else bonus_value end)::numeric, 2) desc
  limit 1;
  v_slab_bonus := greatest(0, coalesce(v_slab_bonus, 0));

  -- Optional deposit promo code
  if coalesce(trim(v_payment.promo_code), '') <> '' then
    select * into v_promo from public.smm_promo_codes
    where upper(code) = upper(trim(v_payment.promo_code))
      and applies_to = 'deposit'
      and active = true
      and (expires_at is null or expires_at > now())
      and (max_uses = 0 or used_count < max_uses)
      and v_payment.amount >= min_amount
    for update;
    if found then
      if v_promo.per_user_limit > 0 then
        select count(*) into v_user_redemptions from public.smm_promo_redemptions
        where promo_id = v_promo.id and user_id = p_user_id;
      end if;
      if v_promo.per_user_limit = 0 or v_user_redemptions < v_promo.per_user_limit then
        if v_promo.discount_type = 'percent' then
          v_promo_bonus := round((v_payment.amount * v_promo.discount_value / 100.0)::numeric, 2);
        else
          v_promo_bonus := round(v_promo.discount_value::numeric, 2);
        end if;
        if v_promo.max_discount > 0 then
          v_promo_bonus := least(v_promo_bonus, v_promo.max_discount);
        end if;
        v_promo_bonus := greatest(0, v_promo_bonus);
        if v_promo_bonus > 0 then
          update public.smm_promo_codes set used_count = used_count + 1, updated_at = now() where id = v_promo.id;
          insert into public.smm_promo_redemptions (promo_id, user_id, context, reference_id, bonus_amount)
          values (v_promo.id, p_user_id, 'deposit', p_razorpay_order_id, v_promo_bonus);
        end if;
      end if;
    end if;
  end if;

  v_total_credit := v_payment.amount + v_slab_bonus + v_promo_bonus;

  update public.smm_users
    set balance = balance + v_total_credit, updated_at = now()
    where id = p_user_id and disabled = false
    returning balance into v_balance;
  if not found then raise exception 'User account is unavailable.'; end if;

  update public.smm_wallet_payments
    set status = 'paid', payment_id = p_payment_id, paid_at = now()
    where razorpay_order_id = p_razorpay_order_id;

  insert into public.smm_transactions (id, user_id, type, amount, currency, reference, razorpay_order_id, note)
  values ('deposit_' || p_razorpay_order_id, p_user_id, 'deposit', v_payment.amount, 'INR', p_payment_id, p_razorpay_order_id, 'Wallet recharge')
  on conflict (id) do nothing;

  if v_slab_bonus > 0 then
    insert into public.smm_transactions (id, user_id, type, amount, currency, reference, razorpay_order_id, note)
    values ('deposit_bonus_' || p_razorpay_order_id, p_user_id, 'adjustment', v_slab_bonus, 'INR', 'deposit_bonus', p_razorpay_order_id, left(v_slab_title, 200))
    on conflict (id) do nothing;
  end if;

  if v_promo_bonus > 0 then
    insert into public.smm_transactions (id, user_id, type, amount, currency, reference, razorpay_order_id, note)
    values ('promo_bonus_' || p_razorpay_order_id, p_user_id, 'adjustment', v_promo_bonus, 'INR', upper(trim(v_payment.promo_code)), p_razorpay_order_id, 'Promo code bonus: ' || upper(trim(v_payment.promo_code)))
    on conflict (id) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'balance', v_balance, 'slabBonus', v_slab_bonus, 'promoBonus', v_promo_bonus);
end;
$$;

-- Atomic wallet reservation + order + optional order promo discount + debit ledger.
create or replace function public.smm_place_order(
  p_user_id uuid,
  p_service_id text,
  p_link text,
  p_quantity integer,
  p_user_email text,
  p_user_name text,
  p_promo_code text default ''
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_service public.smm_services%rowtype;
  v_user public.smm_users%rowtype;
  v_raw_cost numeric(14,2);
  v_discount numeric(14,2) := 0;
  v_cost numeric(14,2);
  v_order public.smm_orders%rowtype;
  v_source text;
  v_status text;
  v_promo public.smm_promo_codes%rowtype;
  v_user_redemptions integer := 0;
  v_applied_code text := '';
begin
  select * into v_service from public.smm_services
    where id = p_service_id for update;
  if not found or not (v_service.active and v_service.approval_status = 'approved' and v_service.compliance_verified and v_service.selling_price_per_1000 > 0) then
    raise exception 'This service is not available for ordering.';
  end if;
  if p_quantity < v_service.min_quantity or p_quantity > v_service.max_quantity then
    raise exception 'Quantity must be between % and %.', v_service.min_quantity, v_service.max_quantity;
  end if;
  select * into v_user from public.smm_users where id = p_user_id for update;
  if not found or v_user.disabled then raise exception 'User account is unavailable.'; end if;
  if v_service.pricing_model = 'fixed' then
    v_raw_cost := round(v_service.selling_price_per_1000, 2);
  else
    v_raw_cost := greatest(1, round((p_quantity * v_service.selling_price_per_1000 / 1000.0), 2));
  end if;

  if coalesce(trim(p_promo_code), '') <> '' then
    select * into v_promo from public.smm_promo_codes
    where upper(code) = upper(trim(p_promo_code))
      and applies_to = 'order'
      and active = true
      and (expires_at is null or expires_at > now())
      and (max_uses = 0 or used_count < max_uses)
    for update;
    if not found then raise exception 'Promo code is invalid or expired.'; end if;
    if v_raw_cost < v_promo.min_amount then
      raise exception 'Minimum order amount for this promo is ₹%.', to_char(v_promo.min_amount, 'FM999999990.00');
    end if;
    if v_promo.per_user_limit > 0 then
      select count(*) into v_user_redemptions from public.smm_promo_redemptions
      where promo_id = v_promo.id and user_id = p_user_id;
      if v_user_redemptions >= v_promo.per_user_limit then
        raise exception 'You have already used this promo code.';
      end if;
    end if;
    if v_promo.discount_type = 'percent' then
      v_discount := round((v_raw_cost * v_promo.discount_value / 100.0)::numeric, 2);
    else
      v_discount := round(v_promo.discount_value::numeric, 2);
    end if;
    if v_promo.max_discount > 0 then
      v_discount := least(v_discount, v_promo.max_discount);
    end if;
    v_discount := greatest(0, least(v_discount, v_raw_cost - 0.01));
    v_applied_code := upper(trim(v_promo.code));
  end if;

  v_cost := greatest(0.01, v_raw_cost - v_discount);
  if v_user.balance < v_cost then raise exception 'Insufficient wallet balance. Required ₹%.', to_char(v_cost, 'FM999999990.00'); end if;
  v_source := case when v_service.source = 'luvsmm' then 'luvsmm' else 'manual' end;
  if v_source = 'luvsmm' and coalesce(v_service.supplier_service_id, '') = '' then raise exception 'Supplier service ID is missing. Re-sync the catalogue.'; end if;
  update public.smm_users set balance = balance - v_cost, updated_at = now() where id = p_user_id;
  v_status := case when v_source = 'manual' then 'Awaiting review' else 'Submitting' end;
  insert into public.smm_orders (
    user_id, user_email, user_name, service_id, service_name, category, pricing_model,
    source, supplier_service_id, link, quantity, amount, status, remains, promo_code, discount_amount
  ) values (
    p_user_id, coalesce(p_user_email,''), coalesce(p_user_name,''), v_service.id, v_service.name,
    v_service.category, v_service.pricing_model, v_source, v_service.supplier_service_id,
    p_link, p_quantity, v_cost, v_status, p_quantity, v_applied_code, v_discount
  ) returning * into v_order;

  if v_applied_code <> '' and v_discount > 0 then
    update public.smm_promo_codes set used_count = used_count + 1, updated_at = now() where id = v_promo.id;
    insert into public.smm_promo_redemptions (promo_id, user_id, context, reference_id, bonus_amount)
    values (v_promo.id, p_user_id, 'order', v_order.id::text, v_discount);
  end if;

  insert into public.smm_transactions (id, user_id, type, amount, currency, reference, note)
  values ('order_' || v_order.id::text, p_user_id, 'order', -v_cost, 'INR', v_order.id::text,
    'Order: ' || v_service.name || case when v_applied_code <> '' then ' (Promo ' || v_applied_code || ')' else '' end);
  return to_jsonb(v_order);
end;
$$;

revoke all on function public.smm_place_order(uuid,text,text,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.smm_place_order(uuid,text,text,integer,text,text,text) to service_role;

notify pgrst, 'reload schema';

-- Track welcome bonus claims per device / fingerprint / IP to prevent multi-account farming.
create table if not exists public.smm_welcome_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.smm_users(id) on delete cascade,
  device_id text not null default '',
  device_fp text not null default '',
  ip_hash text not null default '',
  amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists smm_welcome_claims_device_idx on public.smm_welcome_claims (device_id) where device_id <> '';
create index if not exists smm_welcome_claims_fp_idx on public.smm_welcome_claims (device_fp) where device_fp <> '';
create index if not exists smm_welcome_claims_ip_idx on public.smm_welcome_claims (ip_hash) where ip_hash <> '';
alter table public.smm_welcome_claims enable row level security;
revoke all on public.smm_welcome_claims from public, anon, authenticated;
grant all on public.smm_welcome_claims to service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Reseller API v2 (per-user api_key) & Website Visitor Counter
-- ---------------------------------------------------------------------------
alter table public.smm_users add column if not exists api_key text;
create unique index if not exists smm_users_api_key_uidx on public.smm_users (api_key) where api_key is not null;

alter table public.smm_settings add column if not exists total_visitors bigint not null default 0;
alter table public.smm_settings add column if not exists today_visitors bigint not null default 0;
alter table public.smm_settings add column if not exists visitor_day date not null default current_date;

create or replace function public.smm_increment_visitor()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_total bigint;
  v_today bigint;
begin
  update public.smm_settings
  set
    total_visitors = total_visitors + 1,
    today_visitors = case when visitor_day = current_date then today_visitors + 1 else 1 end,
    visitor_day = current_date,
    updated_at = now()
  where id = 'main'
  returning total_visitors, today_visitors into v_total, v_today;
  return jsonb_build_object('totalVisitors', coalesce(v_total, 0), 'todayVisitors', coalesce(v_today, 0));
end;
$$;
revoke all on function public.smm_increment_visitor() from public, anon, authenticated;
grant execute on function public.smm_increment_visitor() to service_role;

notify pgrst, 'reload schema';
