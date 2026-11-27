# Game Library design battleplan

## Mission

Give each of the 17 playable games a distinct local web design. The Library card and in-game first screen should share a recognizable visual cue, and each live board should emphasize the decision players make in that game. The release candidate starts from `ae7d59d`. It is ready to implement once this plan is shared.

## Scope and evidence

The current library has three dedicated screens and 14 games using the same private-room renderer. The project note records the published design references for six expansion games. Publisher pages confirm the interaction patterns behind the Wavelength dial, Cards Against Humanity’s question-and-answer cards, Quiplash’s competing punchlines, skribbl.io’s drawing surface, The Chameleon’s hidden roles, and Keep Talking and Nobody Explodes’ asymmetric teamwork. Alibi uses the social-deduction genre convention. Games without a direct source use a physical or broadcast format related to their own mechanics. The existing Library names, game rules, routes, original content, and visibility checks form the implementation baseline.

Use original CSS geometry and existing game content for the visuals. The artwork, logos, card faces, and exact screen compositions from reference games stay outside the design brief. Build on the existing component stack and local Supabase. Hosted publication has its own authorization boundary.

## Shared design direction

Give every game a distinct card motif, display type, surface, and layout for its primary interaction. Use one shared room renderer with semantic zones for the round, public information, private information, tools, actions, and scores. Use dedicated compositions for Wavelength, Pulse Vote, and Cards Against Humanity. Keep HTML order aligned with play on mobile and with keyboard traversal. Display private information with explicit labels and keep motion tied to state, with a reduced-motion setting. CSS renders the silent visual accents. The content stays legible in default and forced-colors modes.

## Per-game designs and checks

| Game | Reference and visual direction | Entry, live round, and reveal | Mobile and acceptance |
| --- | --- | --- | --- |
| Wavelength | The tabletop dial informs a walnut-and-teal hi-fi instrument with amber calibration marks. | Setup uses modular tuner controls. The spectrum rail sits over a recessed dial. The reveal combines the dial with three instrument readouts. | Stack spectrum labels around a slim rail and keep the slider operable by keyboard. Check the target stays private through lock-in and readouts match the actual guess. |
| Pulse Vote | Audience polls inform a midnight-blue studio with lime vote indicators and stacked broadcast graphics. | A room badge leads into a full-width question and tall answer buttons. Results turn into distinct labeled vote bars with turnout, ties and abstentions visible. | Allow the bar labels to wrap above their tracks. Verify tied leaders and zero votes remain readable without color. |
| Cards Against Humanity | Physical question and answer cards inform a charcoal felt table with warm paper and a vermilion confirmation edge. | Setup resembles a deck laid out on a table. A dark prompt card anchors the round above ivory responses. The selected card, preview, and confirmation visibly form one group. | Deal responses in one column on phones. Play both local and online hands and verify the next player never inherits the selected card. |
| Caption Clash | Quiplash’s punchline face-off informs a plum comedy stage with peach marquee framing and ivory response slips. | The question occupies center stage. Anonymous answers fill a comparison grid, with voting immediately adjacent. The reveal shifts emphasis to the winning punchline and its author. | Stack response slips and keep long punchlines readable. Verify the vote still keeps authors private. |
| Crowd Call | Survey game shows inform a navy control booth with coral and aqua split panels. | Use a prediction console beside the live room tally. Distinguish the two decisions by position and labels. The show-floor reveal emphasizes the leaders and the private score receipt. | Prediction precedes ballot on phones. Verify neither the split layout nor the room chart previews sealed choices. |
| Sketch Relay | The drawing-first structure of skribbl.io informs a cobalt drafting studio with a cream sketchpad and a clipped toolbar. | Give the canvas the largest surface, with artists’ tools directly associated and the guess form nearby. Final drawing and answer share the reveal. | Keep the full canvas, undo, and guessing within a single stack. Verify touch, mouse, keyboard, synchronized undo and reload. |
| Imposter | The Chameleon’s hidden roles inform jungle-green field cards and a word-grid motif. | The role card is visually enclosed. The shared category and clue order form a field ledger. The role reveal opens the space to the result. | Keep privacy labels visible above each role. Check clue order and passing without revealing a role publicly. |
| Alibi | Mafia-style conversation and accusation inform a wine-red witness stand with ivory statements and a numbered hearing ledger. | Present the current incident, testimony order, and personal packet in separate regions. The accusation control uses the stand’s focal position. The reveal reads as a case verdict. | One-column testimony order, then statement entry. Verify passed turns and private packets on different screens. |
| Secret Thread | A clue-linking puzzle informs a pine-and-brass pinboard with ruled clue cards and thread accents. | A player’s clues read as pinned notes. Shared guesses sit beneath the connection puzzle. Repeated attempts and the reveal have distinct paper surfaces. | Keep links ornamental and cluster clues before the guess control. Verify prior guesses are shared and current fragments remain private. |
| Pitch Panic | Convention demos and timed pitch contests inform a warm peach exhibition booth with stencil headings and team placards. | Team draft looks like a back-stage briefing, the public pitch has a clear stage, and badge votes read as ballots. The score uses an awards strip. | Each badge input gets its own full-width label. Verify private drafts and badge receipts stay with the right team or player. |
| Fact or Fiction | Quiz programs and fact-checking desks inform navy newsprint, an editorial headline, and amber confidence markers. | Make the current statement a headline, verdict and risk a paired action, and the source explanation the center of the reveal. | Stack verdict then confidence. Verify explanation, score change and source link remain legible at narrow widths. |
| Cipher Pair | Keep Talking’s manual-and-operator separation informs a violet cipher lab with monospaced keys and ruled notebook panels. | Draw a clear boundary between the encoded phrase and a player’s private key. Move the decoder form alongside the code on large displays. | Allow cipher tokens and word lengths to wrap. Verify each player sees only their half of the key. |
| Switchboard | Keep Talking’s conversation-first play informs a deep blue instrument panel with mint circuit traces and a directional control cluster. | Put status and reached checkpoints on the console. Give the operator’s buttons a directional footprint. Distinguish the navigator’s route as a private instrument. | Keep controls large and directions labeled. Verify the visible connected trail clears on reset and future checkpoints stay private. |
| Double Bluff | A bluffing duel informs oxblood velvet, compact face-down parcel shapes, and a card-table action line. | Put the public claim at the center with the player’s hand beside it. The showdown turns into a readable claim history and proved count. | Wrap the hand ahead of action buttons. Verify opponent cards never appear and the history follows the reveal. |
| Casefile | Deduction games inform a cream archive with indigo index tabs, shared notes, and labeled evidence slips. | Make the dossier and private evidence distinct. Group hypotheses under the investigation form, then use a written closeout for the solution. | Keep private evidence labels adjacent to content. Check that hypotheses can be reviewed without giving away individual correct components. |
| Counterpoint | A moderated debate informs royal purple and gold lecterns with speaker-marked speech columns. | The claim sits above a script layout for arguments and rebuttals. The private prediction is a separate ballot, and results show badges and scoring. | Stack the speech record in chronological order without clipping text. Verify a pass and a submitted turn stay distinct. |
| Sync or Swim | Cooperative matching informs marine navy and seafoam rails with paired response cards. | Give the prompt a central pool-lane composition. The two selections read as parallel lanes at reveal. The streak remains easy to find alongside the round timeline. | Stack both lanes with player names. Verify previous results survive reload and the newest choice stays private until reveal. |

## Delivery checklist

| Step | Owner and prerequisite | Passing evidence | Status |
| --- | --- | --- | --- |
| D1 | Lead, current repo and references inspected. Publish the plan and freeze the semantic zone contract. | All 17 titles have an entry, play, reveal, and narrow-layout check. | Verified |
| D2 | Lead after D1. Build shared themed surfaces, catalog marks, and dedicated layouts for the three existing screens. | Standard controls and Library paths still work in local builds. | Verified |
| D3 | Design lanes after D1. Implement 14 game-specific compositions from the stated zones. | Every game has its own accent, motif and phase-oriented styling, with any deviation documented. | Verified |
| D4 | Lead after D2 and D3. Run all tests, build, check all routes, and render catalog and games across desktop and mobile. | All 17 have rendering evidence. Keyboard, privacy, responsiveness, and representative multiplayer play pass. | Verified |
| D5 | Lead after D4. Review representative renders, fix regressions, recheck the changed cases, commit and capture. | Exact revision and verified preview are recorded. | Verified |

## Gates and recovery

Before integration, each game needs a clear primary action, readable text and controls, explicit private labels, and an original visual cue. CSS layout must not invert keyboard order. Verify focus, text contrast, touch targets, reduced motion, narrow layout, and absence of overflow. Test all normal routes against the local backend. Rerun existing interaction privacy and reconnect checks; exercise representative draws, ballots, and card previews in the browser. Probe any failing phase individually and fix the smallest styling or renderer issue. An unexpected room or scoring regression blocks the local handoff until it is resolved or isolated. A commit on an isolated local branch provides the recovery point.

## Execution evidence

- Local Chromium captured all 17 active game screens and verified distinct catalog marks, entry reflow, active-game reflow, and visible keyboard focus at 390px and 1440px.
- Fourteen private-room paths created or joined a lobby and entered play. The walkthrough also exercised anonymous Caption Clash voting, Sketch Relay keyboard drawing, the Switchboard operator view, and the Sync or Swim reveal.
- Wavelength was played through the dial and reveal. Pulse Vote was played through ballot and percentage reveal. Cards Against Humanity was played through the local handoff and anonymous vote, with a separate forced-colors and reduced-motion reflow check.
- The 102-test suite, strict lint, TypeScript, production build, and staged diff check passed. Room rules and account behavior use the existing data contract.
- The separate local screenshot gallery contains 17 full-size images and three overview sheets.

## Sources

- [Wavelength](https://www.wavelength.zone/)
- [Cards Against Humanity](https://www.cardsagainsthumanity.com/)
- [Quiplash](https://www.jackboxgames.com/games/quiplash)
- [skribbl.io](https://skribbl.io/)
- [The Chameleon](https://bigpotato.com/products/the-chameleon)
- [Keep Talking and Nobody Explodes](https://keeptalkinggame.com/how-to-play-remotely/)
