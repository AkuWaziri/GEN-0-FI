-- Run this in Supabase SQL Editor after the existing gm_checkins table.
-- Supabase remains an indexing/cache layer. The Arc transaction is the source of truth.

alter table public.gm_checkins
  add column if not exists tx_hash text,
  add column if not exists chain_id bigint not null default 5042;

create unique index if not exists gm_checkins_tx_hash_unique
  on public.gm_checkins (tx_hash)
  where tx_hash is not null;

create index if not exists gm_checkins_chain_id_idx
  on public.gm_checkins (chain_id);

-- Keep the existing wallet/date uniqueness constraint.
-- A client may only insert a record after its Arc GM transaction is confirmed.
-- Final production hardening should verify tx_hash + event data server-side/indexer-side.
