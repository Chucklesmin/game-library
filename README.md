# Game Library

Game Library is a free, non-commercial game library. Its first game is **Wavelength**, a spectrum party game with 10 packs and 300 spectra. A second adapter, **Pulse Vote**, demonstrates a different prompt → private vote → results loop on the same room/catalog foundation.

## Library architecture

The database has a generic `games → game_packs → game_content` catalog. A room records its selected game, immutable ruleset version, and game-specific state, allowing future games to use entirely different turn logic without altering room identity, membership, or realtime delivery. Wavelength's live actions use database RPCs, so targets remain in the protected round record until scoring reveals them.

## Rules

One Wavelength Keeper privately sees a target on a continuum and gives one clue. Their team tunes a shared needle. The other team predicts whether the target is left or right. Reveal scores 4 / 3 / 2 by proximity; a correct intercept earns opponents 1 (except on a perfect center hit). First to 12 wins.

## Development

```bash
npm install
npm run dev
```

## Supabase + Vercel

1. Create a free Supabase project and enable **Anonymous Sign-Ins**.
2. Add `.env.local` from `.env.example`; never put a secret/service-role key in a public variable.
3. Apply every migration in `supabase/migrations` in filename order.
4. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
5. Run the Supabase security advisor. Expected notices are authenticated access to intentionally restricted `SECURITY DEFINER` RPCs and anonymous access required for the no-account guest game; public/anon RPC execution is revoked.
6. Set the same public variables in Vercel and deploy only when authorized.

Game Library is independent and non-commercial. Wavelength is presented as the selected game name at the user's request.
