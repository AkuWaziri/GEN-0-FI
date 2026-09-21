-- GEN-0FI Swap / Bridge Points
-- Run this once in the Supabase SQL editor.

create table if not exists public.point_actions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  tx_hash text not null unique,
  action_type text not null check (action_type in ('swap', 'bridge')),
  points integer not null check (points > 0),
  chain_id bigint not null default 5042,
  created_at timestamptz not null default now()
);

create index if not exists point_actions_wallet_idx
  on public.point_actions (wallet_address, created_at desc);

alter table public.point_actions enable row level security;

drop policy if exists "Point actions are publicly readable" on public.point_actions;
create policy "Point actions are publicly readable"
  on public.point_actions for select
  using (true);

drop policy if exists "Point actions can be created" on public.point_actions;
create policy "Point actions can be created"
  on public.point_actions for insert
  with check (
    length(wallet_address) = 42
    and wallet_address = lower(wallet_address)
    and wallet_address like '0x%'
    and length(tx_hash) >= 10
    and action_type in ('swap', 'bridge')
    and points in (5, 10)
    and chain_id = 5042
  );
