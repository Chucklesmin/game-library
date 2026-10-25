# CAH expanded engine

`20261025035016_cah_expansion_engine.sql` extends the existing server-authoritative RPCs. Existing human participant IDs remain auth user IDs. Bots use separate private UUIDs and never create an Auth user or room-player membership. Active rosters are frozen in `private.cah_game_players`; only human members can invoke user actions.

## Public interface

- `cah_configure(room, pack_slug, response_mode, scoring_mode)` accepts published packs, `write|cards`, `crowd|judge`.
- `cah_add_bot(room, profile)` / `cah_remove_bot(room, participant_id)` are host-only lobby/complete operations; profiles: dry, chaos, topical, wordplay.
- `cah_submit_card(room, card_id)` accepts only a card from the caller's private seven-card hand, consumes it atomically, and replenishes on next round. Simultaneous hands never share a card. Exhaustion recycles consumed cards but excludes current hands.
- Existing start, answer, vote, next and get-view RPCs remain. Original defaults to write/crowd. Three to ten seats include bots. Round counts remain 3/5/7.
- `cah_judge_fallback(room)` is host-only and requires a failed judge. It switches that round to crowd voting without changing the configured match mode.

View extensions: `settings`, `participants`, caller-only `hand`, `judge:{status,explanation,winnerIds}`, `aiStatus:{pending,fallbackUsed,failed}`. Judge statuses: idle, pending, complete, failed, fallback. Winner IDs identify submissions. Responses/author identities and explanations remain hidden until eligible voting/reveal; judge-mode submissions stay hidden until reveal. `cah_get_view` does not emit another room update.

## Durable worker boundary

Only service_role can call `cah_worker_claim(p_limit,p_worker_id)` or `cah_worker_complete(p_job_id,p_lease_token,p_result,p_error)`. Claim returns `{jobs:[{id,leaseToken,payload:{kind,prompt,choices,profile,responseMode}}]}`. Choices contain only ID/text; bot submit choices are its own hand; votes exclude self; judge gets all anonymous submissions. No auth IDs/names/scores/human-or-bot labels are sent.

Claims use 90-second leases and room-before-job lock ordering. External calls happen after the claim transaction completes. Generation/round/phase validity is checked again at completion. Repeated completed-job delivery returns done without scoring twice. After three abandoned leases, another claim applies deterministic legal bot fallback or fails judge; no inference is retried endlessly. Failed judge requires explicit host fallback. Explicit worker p_error immediately marks failed, so bots should send a legal disclosed fallback result on provider failure.

Judge results rate every eligible ID exactly once with numeric 0..5 humor/surprise/fit/originality/timing and 1..600-character explanation. Server recomputes .35/.25/.20/.10/.10 weighted totals, awards every entry within .01 of the global maximum, and transitions to reveal in the same locked transaction.

Private tables enable RLS and deny all direct access to public/anon/authenticated. SECURITY DEFINER action boundaries enforce auth/membership/host/phase checks; internal helper execution is revoked. Worker functions additionally verify service-role JWT role and have service_role-only execution grants. No browser can impersonate bots or provide judge scoring.

## Local acceptance evidence

2026-10-24: engine applied to disposable local Game Library stack. `npx supabase db lint --local --schema public,private --fail-on warning` passed without findings. Existing `validate-cards-against-humanity-local.mjs` passed independent three-human Auth/REST/realtime, ties, majority, rejoin, late join and three rounds. Expanded `validate-cah-expansion-local.mjs` passed private seven-card hands, ownership denial, full three-round solo/two-bot game, authenticated worker denial, anonymous judge input, duplicate/out-of-range rating rejection, one-time scoring, explicit failed-judge crowd recovery, and bounded worker-crash recovery. Expanded run initially used disposable synthetic 80+80 fixtures. A fresh local reset subsequently applied engine, scheduler and the complete reviewed deck cleanly; both full legacy and expanded acceptance passed again. The first realtime test immediately after reset missed the startup event; it passed after the replication process warmed up. Final editorial deck was reseeded through the idempotent seed migration and all 750 database payloads were compared exactly against final source JSON. Database counts, unique IDs and normalized unique text each equal 250 prompts / 500 responses; Original remains 36 prompts. Final public/private lint is clean. Expanded checks include decimal .01 tie tolerance and recovery after three worker crashes. Automatic NVIDIA/Edge Function behavior and browser UI remain integration work owned by the primary agent.
