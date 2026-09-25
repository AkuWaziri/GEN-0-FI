-- GEN-0FI unified activity points ledger
-- Run this migration in the Supabase SQL editor.

create table if not exists public.point_actions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  tx_hash text not null unique,
  action_type text not null check (action_type in ('swap', 'bridge', 'send', 'nft_mint', 'coin_launch')),
  points integer not null check (points > 0),
  chain_id bigint not null default 5042,
  created_at timestamptz not null default now()
);

alter table public.point_actions
  drop constraint if exists point_actions_action_type_check;

alter table public.point_actions
  add constraint point_actions_action_type_check
  check (action_type in ('swap', 'bridge', 'send', 'nft_mint', 'coin_launch'));

create index if not exists point_actions_wallet_idx
  on public.point_actions (wallet_address, created_at desc);

create index if not exists point_actions_action_idx
  on public.point_actions (action_type, created_at desc);

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
    and (
      (action_type = 'swap' and points = 50)
      or (action_type = 'bridge' and points = 100)
      or (action_type = 'send' and points = 50)
      or (action_type = 'nft_mint' and points = 500)
      or (action_type = 'coin_launch' and points = 500)
    )
    and chain_id = 5042
  );
