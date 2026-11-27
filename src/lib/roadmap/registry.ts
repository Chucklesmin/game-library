import type { GameDefinition } from "./contract";
import { game as captionClash } from "./games/caption-clash";
import { game as crowdCall } from "./games/crowd-call";
import { game as sketchRelay } from "./games/sketch-relay";
import { game as imposter } from "./games/imposter";
import { game as alibi } from "./games/alibi";
import { game as secretThread } from "./games/secret-thread";
import { game as pitchPanic } from "./games/pitch-panic";
import { game as factOrFiction } from "./games/fact-or-fiction";
import { game as cipherPair } from "./games/cipher-pair";
import { game as switchboard } from "./games/switchboard";
import { game as doubleBluff } from "./games/double-bluff";
import { game as casefile } from "./games/casefile";
import { game as counterpoint } from "./games/counterpoint";
import { game as syncOrSwim } from "./games/sync-or-swim";

function register<State>(game: GameDefinition<State>): GameDefinition<unknown> {
  return {
    ...game,
    act: (state, context, action) => game.act(state as State, context, action),
    view: (state, context) => game.view(state as State, context),
  };
}

export const roadmapGames = [
  register(captionClash),
  register(crowdCall),
  register(sketchRelay),
  register(imposter),
  register(alibi),
  register(secretThread),
  register(pitchPanic),
  register(factOrFiction),
  register(cipherPair),
  register(switchboard),
  register(doubleBluff),
  register(casefile),
  register(counterpoint),
  register(syncOrSwim),
];
export const findRoadmapGame = (slug: string) => roadmapGames.find((game) => game.slug === slug);
