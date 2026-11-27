# Pulse Vote

Pulse Vote is a private online game for **3–8 players**. The host creates a room, shares the six-character invite code, and selects 1–10 rounds (five by default). Everyone uses their own browser session.

## How to play

- Each round draws an original question from the 16-prompt Starter Pack. A question appears at most once per match.
- Pick the answer you think fits best and lock it in. Everyone, including the host, gets one private vote. A successful ballot cannot be changed. Results stay sealed until the host closes voting.
- Every player who voted for an answer tied for the highest positive count earns one point. The reveal shows the distribution without naming voters. With zero ballots, all counts are zero and nobody scores.
- The host can close a round while players are away. Votes already accepted still count. A missed vote earns zero. There is no automatic timer or host transfer.
- Reload or rejoin with the same browser profile to keep your identity, vote, and score. The lobby stops accepting new guests once a match begins. If the host disconnects, the room waits for that host to return. Clearing browser data or switching profiles loses access to the original guest identity.
- After the last reveal, the host opens final standings. Equal scores share rank. The host can start a fresh match with the same roster and a clean scoreboard, or create a different room for a new group.

Crowd Call is the planned game with a separate prediction phase.

## Data and release

The published Starter Pack uses `game_packs` and `game_content`. Migration `20261127021027_pulse_vote_multiplayer.sql` adds the private state table, a room roster guard, and authenticated RPCs. Supabase recorded the production application as `20261127023219`. Room writes serialize under a room row lock. Moves carry the expected round ID, so a retry from an older round or match cannot affect the current one. Realtime publishes shared room phase changes. Each member reads a filtered view and gets only their own choice. The client also refreshes while visible to recover missed notifications and roster changes.

Use a non-production Supabase target first. Apply the migration and run the RPC acceptance script using that target’s URL and publishable key as `SIGNAL_SUPABASE_URL` and `SIGNAL_SUPABASE_KEY`:

```sh
node scripts/validate-pulse-vote.mjs
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
```

Set `NEXT_PUBLIC_PULSE_VOTE_ENABLED=true` at build time for an acceptance build that opens from the Library. For a controlled match with the card still disabled, use the direct `/pulse-vote` route. The flag controls the Library link. Room access still requires guest identity and membership.

```sh
npx --package @playwright/cli playwright-cli -s=pulse-qa open http://127.0.0.1:3325
npx --package @playwright/cli playwright-cli -s=pulse-qa run-code --filename scripts/validate-pulse-vote-browser.js
npx --package @playwright/cli playwright-cli -s=pulse-qa close
```

Use the intended deployment URL in place of the local address. The script requires the Library link by default. Add `?controlled` to the URL passed to `open` for a pre-launch run that may use the direct route. The browser script creates three fresh guests and an invite-only test room. The RPC script creates nine test guests and two rooms to verify privacy, repeat and stale writes, close concurrency, realtime payloads, and the last lobby seat.

Apply only the new additive migration to the verified production project after release authorization. Production contains earlier migrations recorded under different timestamps, so review remote history before using a migration push. Stage on Vercel and test against the intended backend. Keep the production link disabled until a controlled match against production passes. After enabling the link in the release build, check the Library launch, complete a live match, and smoke-test Wavelength and Cards Against Humanity. If launch acceptance fails, restore the previous Vercel deployment or rebuild with the flag off. Preserve the additive schema and in-flight rooms.
