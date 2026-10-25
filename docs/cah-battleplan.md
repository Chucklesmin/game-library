# Battleplan: After Hours cards, bots, and NVIDIA judging

Date: 2026-10-24 (America/New_York). Owner: Codex implementation role. Status: executing; live provider configuration is verified at testing time per user direction.

## Executive decision

Extend the existing game rather than introduce a second app. Preserve Original/write-your-own and add After Hours, private seven-card hands, explicit bot seats, and optional anonymous AI judging. Use a server-only NVIDIA adapter and durable database jobs; browser tabs do not drive bots. Reuse Supabase and Vercel. NVIDIA credentials, account entitlement, model availability, limits, and observed behavior remain unknown until the live gate.

## Mission and definition of done

Deliver exactly 250 original adult dark-satire prompts and 500 unique response cards, working local card hands and private online games, 1-human/2-bot solo games, mixed human/bot games, anonymous crowd voting or nonparticipant AI judging, recoverable provider failures, and a verified release. Evidence requires content validation, rules and worker tests, fresh local migrations and authorization tests, multiplayer browser games, responsive/keyboard review, live NVIDIA success, and matching main/production deployment. A simulated API response cannot satisfy live inference acceptance.

## Scope, constraints, and assumptions

- Retain 3–10 participants, 3/5/7 rounds, host control, private handoff, hidden submissions, non-self votes, and tie points. Humans retain guest authentication; bots have server-owned participant IDs.
- Interpret the duplicated request as 250 prompts plus 500 response cards. Use ten editorial groups, each 25/50. Include controversial public figures, pregnancy, STIs, and death. References to real crimes require sources distinguishing conviction from allegation. Dark satire may discuss historical atrocities; content does not promote hatred of protected groups or celebrate sexual abuse.
- Server owns hands, draws, valid actions, phase progression, weighted judging and scores. A judge sees anonymous entries and no author/type/score information. Model explanations are short assessments, not hidden reasoning.
- Previous explicit main/Vercel/Supabase release authorization persists. No purchases, expanded service plans, unrelated credentials, deletion of user data, or broad account permission changes. Leave unrelated games and scratch build output intact.
- Live key configuration is deferred to test time by user instruction. No client secret, unlimited API retries, or claim of objective humor measurement. No real-person unverified crime/medical claims.

## Current-state evidence

BP baseline: dev HEAD ada94fd; origin/main previously confirmed same SHA and Vercel production READY. Existing 36-prompt source and free-response UI were inspected. Existing migration binds actions to auth.uid(); it cannot safely represent bot identities without change. Existing QA suite has 17 tests; passing history is not proof of this expansion. Local Supabase was stopped at user direction and may be restarted for disposable acceptance. CLI deployment credentials absent; connected Supabase can perform project operations. NVIDIA hosted Chat Completions endpoint and Supabase secret docs checked. Account secrets/limits not yet verified.

## Approach and alternatives

Choose explicit participants and private database jobs over fake bot user accounts or client timers: authorization is clearer and bot execution survives closed tabs. Choose a separate anonymous judge mode over silently mixing AI scores with human votes: scoring is understandable. Choose validated card IDs over LLM-generated hand content: bots obey the deck. Keep write-your-own as an explicit alternate. A provider outage uses disclosed legal bot fallback; judge failures require host selection of crowd voting for that round.

## Delivery plan and live checklist

| ID | Deliverable; role | Prerequisite | Acceptance evidence | Status |
|---|---|---|---|---|
| BP-01 | Baseline/contracts/plan; primary | source and instructions read | existing files preserved, interface contracts recorded, goal active | verified |
| BP-02 | 250/500 deck and editorial record; content role | scope | exact counts, unique IDs/text, one-blank prompts, category counts, semantic review and fact sources | verified |
| BP-03 | Participant/hand/phase/judge SQL; backend role | contracts | fresh local migrations, private-hand and unauthorized-action checks, production seed/RLS and live game | verified |
| BP-04 | NVIDIA adapter, worker, durable wake/recovery; primary | job contract | mock/error tests, malformed IDs/scores, timeout/refusal/429/restart/stale and duplicate-work checks; NVIDIA key remains missing | active |
| BP-05 | Local/online interface; UI role | view contract + deck | solo/mixed/legacy games, mobile/desktop, keyboard, no secret/hand leaks | verified |
| BP-06 | Integrated acceptance; primary/review | BP-02..05 | lint/typecheck/tests/build, DB integration and browser games pass; live NVIDIA inference awaits secret | pending provider configuration |
| BP-07 | Main and production release; primary | BP-06 + live gates | main `dfd06f2` pushed; migrations and worker deployed; Vercel `dpl_GViAYmhxntyGgwsFq3G3yNPHtKeo` READY; production three-round game passed in disclosed fallback mode | release deployed; AI inference pending |
| BP-08 | Handoff/runbook/Brain; primary | verified milestones | operations runbook added; record live-provider gate and current evidence | active |

Critical dependencies: BP-02 seeds BP-03 and BP-05; BP-03 supplies BP-04 and BP-05; all feed BP-06, then BP-07. Content and interface work proceed while credential testing is deferred.

## Gates, risks, and contingencies

| Gate / risk | Trigger and control | On failure; owner |
|---|---|---|
| Content | counts, grammar, originality, factual public-figure references verified | edit/remove questionable cards without lowering count; content role |
| Private state | direct reads/forged player IDs/worker RPC or self-vote attempts | block release, repair access tests; backend/primary |
| Existing RLS finding | private CAH state and used prompts need direct-access isolation | production CAH private tables have RLS and zero direct anon/authenticated grants; owner-controlled RPCs mediate access; INFO advisories are expected without policies |
| Durable execution | duplicate delivery, expired lease, phase changed during HTTP, server restart | dedup by action/phase, atomic result apply, bounded claims and retries; primary/backend |
| NVIDIA | secret missing, unsupported model, malformed output, refusal, quota/timeout | report actual error, use disclosed legal fallback for bots, pause judge with explicit host recovery; user supplies secret if required |
| Budget | repeated or concurrent rooms | per-call token/request limits, global/room claim limits and usage accounting; no paid upgrade; primary |
| Judgment bias | position or same-model preference changes winner | shuffle anonymous candidates, permutation tests, compare human rankings; no claim that bias is eliminated; primary |
| Rollout | migrations or live checks fail | keep feature unavailable, use additive migration fixes; roll back Vercel alias to known release if necessary; primary |

NVIDIA scoring weights: humor .35, surprise .25, fit .20, originality .10, timing .10, each 0–5. Server validates every eligible ID and recomputes totals. Crowd and judge scoring cannot both award the same round. Judge decision is a tunable game rule.

## Verification and acceptance

- Content checks: exactly 250/500, stable unique IDs, normalized unique text, category targets, one blank, length bounds; manual review for repeated joke premises and random combinations. Celebrity/historical fact references record sources separately.
- Rules/privacy: hand isolation, refill, depletion behavior, original pack isolation, legal membership, host-only controls, one submission/vote, no self-vote, late joining and reconnect, tie/majority and final scores.
- Worker: server-only auth, no names in judge input, hostile text treated as data, invented IDs/scores rejected, bounded network work, single-use wakes, stale-result rejection, idempotent scoring, restart recovery, explicit unavailable/fallback states.
- UI: local private handoff, three independent online players plus solo/mixed bot games, 375px and desktop review, keyboard focus/status, no console errors. Record screenshots and expected/actual outcomes.
- Provider/release: actual live NVIDIA call, observed latency and token use, account configuration failure if present; main and deployment match; production smoke plus a controlled complete game. Do not treat a deployed but unconfigured worker as completed AI acceptance.

## Open decisions and first action

No blocking design decision: default seven-card hands, AI seats online, Original pack retained, configurable player/judge model IDs. First action is parallel deck/engine/UI work and pure worker validation. Live NVIDIA key tested only at acceptance per user direction. No schedule or spending commitment is invented.

## Handoff, recovery, and review

Keep this checklist current after verified milestones. Capture concise state/evidence in the canonical Game Library Brain note, with one completion/checkpoint log. Preserve pending/blocked gates; only close the goal when every in-scope criterion has evidence. `docs/cah-operations.md` documents server secrets, worker scheduling, limits, fallback, release rollback and restart. Two planning reviews completed: dependency/authority review exposed the missing bot identity and credential gates; completeness review assigned a verification path and recovery for content, privacy, provider, UI and rollout objectives.

## Acceptance update — 2026-10-25

- Deck: exact 250 prompts and 500 unique responses across ten categories. Supabase production query confirms those counts; Original remains 36 prompts.
- Production migration and worker deployed. A database-minted single-use wake reached the Edge Function. It reported `configured:false`, confirming NVIDIA_API_KEY is absent. Bots use legal deterministic card choices; judge failures require host crowd-vote fallback.
- Local checks: 26 unit tests, typecheck, lint, build, and worker runtime acceptance pass. The local expansion script raced the running automatic worker while trying to manually claim bot vote jobs; prior isolated DB acceptance passed, and mixed browser coverage below verifies automatic jobs.
- Browser acceptance: local two-human/one-bot game completed three rounds with private hands, guest reload/rejoin, responsive 375px/1280px layouts and zero console errors/warnings. Production solo one-human/two-bot game completed three After Hours card rounds with automatic crowd scoring and the documented no-key fallback; zero production console errors/warnings.
- Release: commit `dfd06f222f3a4215583c55882c786bc77ed2a572` pushed to `main`; Vercel production deployment `dpl_GViAYmhxntyGgwsFq3G3yNPHtKeo` is READY and serves https://signal-party.vercel.app.
- Remaining acceptance gate: configure `NVIDIA_API_KEY` in Supabase Edge Function secrets, then run actual NVIDIA player and judge calls and record latency/usage. Do not mark the AI provider gate complete before that live test.

Sources: https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-120b-infer ; https://supabase.com/docs/guides/functions/secrets . Reverify implementation-sensitive APIs and model features before release.
