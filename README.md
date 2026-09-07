# Signal

Signal is an original, non-commercial spectrum party game with 10 original packs and 300 spectra.

## Rules

One Signal Keeper privately sees a target on a continuum and gives one clue. Their team tunes a shared needle. The other team predicts whether the target is left or right. Reveal scores 4 / 3 / 2 by proximity; a correct intercept earns opponents 1 (except on a perfect center hit). First to 12 wins.

## Development

```bash
npm install
npm run dev
```

## Supabase + Vercel

1. Create a free Supabase project and enable **Anonymous Sign-Ins**.
2. Add `.env.local` from `.env.example`; never put a secret/service-role key in a public variable.
3. Apply the included migration, run the RLS advisor, set the same public variables in Vercel, then deploy.

Signal is independent, non-commercial, and not affiliated with or endorsed by Wavelength or CMYK. Its name, visual design, copy, packs, and code are original.
