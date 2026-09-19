-- GEN-0FI GM Streak
-- Run this once in the Supabase SQL editor.

create table if not exists public.gm_checkins (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  checkin_date date not null,
  created_at timestamptz not null default now(),
  constraint gm_checkins_wallet_date_unique unique (wallet_address, checkin_date)
);

create index if not exists gm_checkins_wallet_date_idx
  on public.gm_checkins (wallet_address, checkin_date desc);

alter table public.gm_checkins enable row level security;

drop policy if exists "GM checkins are publicly readable" on public.gm_checkins;
create policy "GM checkins are publicly readable"
  on public.gm_checkins for select
  using (true);

drop policy if exists "GM checkins can be created" on public.gm_checkins;
create policy "GM checkins can be created"
  on public.gm_checkins for insert
  with check (
    length(wallet_address) = 42
    and wallet_address = lower(wallet_address)
    and wallet_address like '0x%'
  );

-- No update/delete policy is intentionally provided.
-- GM records are append-only from the client.
