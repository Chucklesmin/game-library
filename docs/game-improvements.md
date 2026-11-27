# Game Library improvements

| Game | What changed |
| --- | --- |
| Wavelength | Reveals show the target on the 0–100 dial, the locked guess, and the distance between them. Timed-out rounds show that no guess was locked. |
| Pulse Vote | The reveal counts votes and abstentions and shows each choice’s share of ballots cast. Leading choices are labeled and highlighted, including ties. |
| Cards Against Humanity | In a private-hand game, selecting a card previews it in the prompt. Locking it takes a separate confirmation in pass-and-play and online rooms. |
| Caption Clash | The voting menu shows each anonymous answer letter alongside its punchline. Your receipt shows the punchline you picked. |
| Crowd Call | The round receipt splits your points between your prediction and your vote, including when you sat out either step. |
| Sketch Relay | The active artist can undo the last committed stroke before the timer expires. Other players see the corrected canvas, including after reload. |
| Imposter | The public clue order marks who is up, waiting, has shared a clue, or passed. |
| Alibi | The public speaking order marks whose alibi is due and who has spoken or passed. |
| Secret Thread | Teammates can review their previous incorrect guesses for the current puzzle. |
| Pitch Panic | Players can review their own locked badge picks and passes during voting and at the result. |
| Fact or Fiction | The reveal shows your own signed score change and explains your confidence result or abstention. |
| Cipher Pair | Both players can see the word lengths derived from the coded phrase. |
| Switchboard | Both players can see connected checkpoints. A circuit reset clears the connected trail back to the start. |
| Double Bluff | Each reveal recaps the opening claim, counters, and challenge in order. |
| Casefile | Both investigators can review prior hypotheses while solving. Each attempted suspect, motive, and method is shown together. |
| Counterpoint | The public speech checklist marks each player’s argument and rebuttal as due, submitted, or passed or timed out. |
| Sync or Swim | The reveal and final results show the round-by-round match, mismatch, and timeout outcomes. Older matches show the outcomes available to them. |

The update uses the existing room protocol. It adds no database migration. Private game information stays in the existing player or team view until the rules allow it to appear publicly.
