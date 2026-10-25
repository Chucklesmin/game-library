# Cards Against Humanity operations

## AI worker configuration

The browser never receives the NVIDIA credential. Set `NVIDIA_API_KEY` as a Supabase Edge Function secret for `cah-ai-worker`. Optional server secrets `NVIDIA_PLAYER_MODEL` and `NVIDIA_JUDGE_MODEL` select OpenAI-compatible NVIDIA model IDs; defaults are `openai/gpt-oss-20b`. Redeploy the function after changing its code, not after changing a Supabase secret.

The worker is awakened by database `pg_net` calls. Its URL is held in `private.cah_worker_settings`; a null URL disables wakes. The recovery cron runs once a minute. Never put the API key in SQL, browser variables, logs, or this file.

## Limits and failure behavior

The global daily budget defaults to 200 reserved model attempts. Each decision reserves up to two attempts before the API call; reservations are not refunded. The worker processes at most two jobs per wake. Player calls time out after 25 seconds and judge calls after 45 seconds, within the 70-second invocation deadline; jobs hold a 90-second lease. No key or a bot API error uses a valid in-deck bot fallback. Judge errors remain visible and require the host to switch that round to crowd voting. The judge output is schema-checked and scores are recomputed by SQL.

Check `private.cah_worker_settings` for the configured URL and limit, `private.cah_worker_budget` for daily reservations, and `private.cah_jobs` for pending/failed work. Do not expose job payloads or hand contents in support logs. A host may use the in-game judge fallback when the judge is unavailable.

## Local acceptance

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and the local Supabase validators `node scripts/validate-cah-expansion-local.mjs` and `node scripts/validate-cah-worker-local.mjs`. The local worker can be tested without NVIDIA credentials; that verifies fallback and recovery only, not live inference.

## Deck maintenance

`public.game_content` is the runtime source for published prompts and responses. `src/lib/cah-after-hours.json` and the checked-in SQL seed/migrations are reproducibility and test inputs; changing a local fixture alone does not update production. For a deck change:

1. Edit the source fixture and add a timestamped Supabase migration that inserts or updates the matching published `game_content` rows. Keep stable IDs, pack/type values, and text in sync; do not replace the existing deck wholesale.
2. Review the migration diff and validate exact totals, stable-ID uniqueness, normalized-text uniqueness within each pack/type, prompt blank counts, and valid response text locally.
3. Apply the migration to the intended Supabase project, then query `public.game_content` to confirm expected per-pack/type counts and that published CAH rows remain readable under the existing RLS policy. Never put credentials or private player data in the migration.
4. Run the local checks above, including `npm run lint -- --max-warnings=0`, and exercise pass-and-play plus one multiplayer round. Record the migration and resulting production counts in the release notes.

## NVIDIA model maintenance

The code defaults to `openai/gpt-oss-20b`; `NVIDIA_PLAYER_MODEL` and `NVIDIA_JUDGE_MODEL` can override it independently. Before changing a model, verify it is currently available to the configured NVIDIA account and supports the OpenAI-compatible chat-completions request used by `cah-ai-worker`. Update the default/override as appropriate, review the bounded timeouts and output schema, and redeploy the Edge Function when code changes. Keep `NVIDIA_API_KEY` in Edge Function secrets only.

After a model or timeout change, wake a controlled fresh room with two bot players and AI judging. Verify both player jobs and the judge job finish with `fallback=false`, the chosen submission and explanation render, SQL awards the expected score, and latency fits the worker deadline. Also confirm provider errors still produce the disclosed bot fallback or host-selectable crowd recovery. Inspect job status and budget counters without exposing payloads; clean up only the identified synthetic QA room after recording results. A configured secret or successful worker health response alone does not prove model inference works.

## Release and recovery

Apply the three `cah_*` migrations in timestamp order, deploy `cah-ai-worker` with its self-authentication enabled (`verify_jwt=false` is intentional because the database supplies a single-use, expiring wake token), then set the worker URL to the project's `https://<project-ref>.supabase.co/functions/v1/cah-ai-worker` endpoint. Verify the worker with a valid database-minted wake token and confirm its `configured` response. Before release, verify the migrations, worker and UI against a controlled multiplayer game.

For a rollback, set the worker URL to null to stop new wakes, preserve the job rows for diagnosis, and roll back the Vercel deployment to the last known-good deployment. These additive tables and functions should remain until no deployed client or in-flight job uses them; do not drop shared game data as a quick rollback.
