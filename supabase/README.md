# GEN-0FI GM Streak setup

1. Create/open the Supabase project used by GEN-0FI.
2. Run `supabase/gm_checkins.sql` in the Supabase SQL editor.
3. Add these Vercel environment variables for Production, Preview, and Development:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
4. Redeploy GEN-0FI.

The client only stores one GM check-in per wallet per calendar day.

Points rule:
- each consecutive GM day = 1 point
- points equal the active consecutive-day streak
- missing a day breaks the streak
- after a break, points become 0 until the next GM check-in
- the next check-in starts at 1 point
- longest streak and total GM days are historical and do not reset

Security note: this first version treats the connected wallet address as the identity. For production-resistant anti-cheat, the next iteration should add wallet-signature verification before accepting a check-in.
