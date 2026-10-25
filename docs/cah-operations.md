# Cards Against Humanity operations

## AI worker configuration

The browser never receives the NVIDIA credential. Set `NVIDIA_API_KEY` as a Supabase Edge Function secret for `cah-ai-worker`. Optional server secrets `NVIDIA_PLAYER_MODEL` and `NVIDIA_JUDGE_MODEL` select OpenAI-compatible NVIDIA model IDs; defaults are `openai/gpt-oss-120b`. Redeploy the function after changing its code, not after changing a Supabase secret.

The worker is awakened by database `pg_net` calls. Its URL is held in `private.cah_worker_settings`; a null URL disables wakes. The recovery cron runs once a minute. Never put the API key in SQL, browser variables, logs, or this file.

## Limits and failure behavior

The global daily budget defaults to 200 reserved model attempts. Each decision reserves up to two attempts before the API call; reservations are not refunded. The worker processes at most two jobs per wake, makes bounded 15-second API attempts, and holds a lease for 90 seconds. No key or a bot API error uses a valid in-deck bot fallback. Judge errors remain visible and require the host to switch that round to crowd voting. The judge output is schema-checked and scores are recomputed by SQL.

Check `private.cah_worker_settings` for the configured URL and limit, `private.cah_worker_budget` for daily reservations, and `private.cah_jobs` for pending/failed work. Do not expose job payloads or hand contents in support logs. A host may use the in-game judge fallback when the judge is unavailable.

## Local acceptance

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and the local Supabase validators `node scripts/validate-cah-expansion-local.mjs` and `node scripts/validate-cah-worker-local.mjs`. The local worker can be tested without NVIDIA credentials; that verifies fallback and recovery only, not live inference.

## Release and recovery

Apply the three `cah_*` migrations in timestamp order, deploy `cah-ai-worker` with its self-authentication enabled (`verify_jwt=false` is intentional because the database supplies a single-use, expiring wake token), then set the worker URL to the project's `https://<project-ref>.supabase.co/functions/v1/cah-ai-worker` endpoint. Verify the worker with a valid database-minted wake token and confirm its `configured` response. Before release, verify the migrations, worker and UI against a controlled multiplayer game.

For a rollback, set the worker URL to null to stop new wakes, preserve the job rows for diagnosis, and roll back the Vercel deployment to the last known-good deployment. These additive tables and functions should remain until no deployed client or in-flight job uses them; do not drop shared game data as a quick rollback.
