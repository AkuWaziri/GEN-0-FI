-- GEN-0FI points policy fix
-- Run this migration in the Supabase SQL editor.
--
-- The points ledger stores the source chain in chain_id.
-- The previous policy required chain_id = 5042, which blocked
-- LI.FI swaps/bridges when their source chain was another EVM chain.

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
      or (action_type = 'nft_mint' and points = 1000)
      or (action_type = 'coin_launch' and points = 500)
    )
    and chain_id > 0
  );
