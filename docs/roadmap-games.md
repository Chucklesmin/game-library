# Game Library expansion

The additional games run in private online rooms. Players share an invite link or a six-character room code. Browser sessions keep their guest identity and can reload or rejoin a room using the same session. Discussion, coaching, and spoken presentations use the group’s in-person conversation or voice call. The game site does not carry voice.

## Run locally

Start the local Supabase stack with anonymous sign-ins enabled and apply the migrations. Start Next.js with these variables in the local process or in an ignored `.env.local` file.

| Setting | Local value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The API URL reported by `npx supabase status` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The local publishable key or legacy anonymous key |
| `ROADMAP_SUPABASE_SECRET_KEY` | The local secret key or legacy service-role key. Server only. |
| `NEXT_PUBLIC_ROADMAP_GAMES_ENABLED` | `true` to show the expansion in the Library |

Run `npm run dev -- --port 3100`, then open the Library. Use a separate browser profile, private window, or device for each player so they have distinct guest identities. For same-device testing, modern private windows often share one private session. Use independent profiles or browser contexts instead.

Run `npm test` for game-rule checks and `node scripts/validate-roadmap-local.mjs` for a local Library, room, membership, privacy, and concurrent-move smoke test. The smoke test makes anonymous guests and rooms in the local development database. It requires the local public environment values in the shell and refuses non-loopback app or database URLs.

## Room behavior

- Supabase Auth establishes the guest identity. The server derives the player ID from the verified access token and returns only the caller’s game view.
- State stays in a private database table. A member-only Realtime row signals a revision change, with a timed refresh when Realtime is unavailable. Database compare-and-swap commits protect simultaneous moves and the turn token rejects actions from earlier rounds or matches.
- A room’s activity timestamp refreshes when a new player joins or a move is accepted. Its data becomes eligible for cleanup after 24 idle hours and is removed by an hourly job.
- `src/lib/roadmap/games` holds the individual game rules and first-party starter content. The Library contains a separate public metadata list and the server owns the game registry.

Hosted enablement requires the additive room migration, server-only key configuration, and hosted multi-session acceptance. The separate Library flag can keep the new cards hidden while the direct routes are validated.
