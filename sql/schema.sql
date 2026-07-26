-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
create extension if not exists pgcrypto;

create table if not exists public.orders (
  id                     uuid primary key default gen_random_uuid(),
  stripe_session_id      text unique,
  stripe_payment_intent  text,
  offer                  text not null default 'default',
  email                  text,
  customer_name          text,
  amount_total           integer,
  currency               text not null default 'usd',
  payment_method         text,
  status                 text not null default 'pending'
                           check (status in ('pending','awaiting_payment','paid','failed','refunded','disputed')),
  locale                 text,
  country                text,
  utm                    jsonb not null default '{}'::jsonb,
  click_id               text,
  created_at             timestamptz not null default now(),
  paid_at                timestamptz
);

create index if not exists orders_email_idx          on public.orders (email);
create index if not exists orders_status_idx         on public.orders (status);
create index if not exists orders_created_at_idx     on public.orders (created_at desc);
create index if not exists orders_payment_intent_idx on public.orders (stripe_payment_intent);
create unique index if not exists orders_payment_intent_uidx
  on public.orders (stripe_payment_intent) where stripe_payment_intent is not null;

create table if not exists public.access_tokens (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text unique not null,
  order_id      uuid references public.orders(id) on delete cascade,
  email         text not null,
  revoked       boolean not null default false,
  expires_at    timestamptz,
  last_used_at  timestamptz,
  use_count     integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists access_tokens_email_idx on public.access_tokens (email);

create table if not exists public.webhook_events (
  event_id     text primary key,
  type         text,
  received_at  timestamptz not null default now()
);

alter table public.orders          enable row level security;
alter table public.access_tokens   enable row level security;
alter table public.webhook_events  enable row level security;

create or replace view public.vw_vendas_dia as
select date_trunc('day', paid_at) as dia, offer, currency,
       count(*) as vendas, sum(amount_total)/100.0 as faturamento
from public.orders where status = 'paid'
group by 1,2,3 order by 1 desc;
