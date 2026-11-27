import { randomInt, randomUUID } from "node:crypto";
import type { DisplayCard, GameContext, GameControl, GameDefinition, GameView } from "../contract.ts";

const words = [
  ["Weather", "Drizzle"], ["Weather", "Hail"], ["Weather", "Fog"], ["Weather", "Sleet"], ["Weather", "Frost"],
  ["Kitchen tools", "Colander"], ["Kitchen tools", "Whisk"], ["Kitchen tools", "Rolling pin"], ["Kitchen tools", "Ladle"], ["Kitchen tools", "Grater"],
  ["Street details", "Bus shelter"], ["Street details", "Storm drain"], ["Street details", "Crosswalk"], ["Street details", "Speed bump"], ["Street details", "Traffic cone"],
  ["Garden life", "Earthworm"], ["Garden life", "Sunflower"], ["Garden life", "Ladybug"], ["Garden life", "Bumblebee"], ["Garden life", "Clover"],
  ["Game night", "Scorecard"], ["Game night", "Hourglass"], ["Game night", "Dice cup"], ["Game night", "Playing card"], ["Game night", "Spinner"],
  ["At the library", "Bookmark"], ["At the library", "Return slot"], ["At the library", "Reading lamp"], ["At the library", "Book cart"], ["At the library", "Library card"],
  ["Camping", "Lantern"], ["Camping", "Hammock"], ["Camping", "Sleeping bag"], ["Camping", "Tent stake"], ["Camping", "Canteen"],
  ["Sounds at home", "Doorbell"], ["Sounds at home", "Kettle"], ["Sounds at home", "Wind chime"], ["Sounds at home", "Vacuum"], ["Sounds at home", "Alarm clock"],
  ["On a bike", "Kickstand"], ["On a bike", "Handlebar"], ["On a bike", "Spoke"], ["On a bike", "Pedal"], ["On a bike", "Chain"],
  ["Things in a suitcase", "Laundry bag"], ["Things in a suitcase", "Travel adapter"], ["Things in a suitcase", "Sunglasses"], ["Things in a suitcase", "Toothbrush"], ["Things in a suitcase", "Raincoat"],
  ["At the beach", "Sandcastle"], ["At the beach", "Tide pool"], ["At the beach", "Beach towel"], ["At the beach", "Seashell"], ["At the beach", "Boardwalk"],
  ["On a desk", "Paper clip"], ["On a desk", "Pencil sharpener"], ["On a desk", "Nameplate"], ["On a desk", "Stapler"], ["On a desk", "Desk calendar"],
] as const;

const CLUE_MS = 35_000;
const VOTE_MS = 45_000;
const GUESS_MS = 30_000;

type Phase = "deal" | "clues" | "discussion" | "voting" | "last-guess" | "reveal" | "complete";
type Verdict = "miss" | "tie" | "no-votes" | "stolen" | "caught" | "guess-expired";
type Result = {
  verdict: Verdict;
  tallies: Record<string, number>;
  guess?: string;
};
type State = {
  id: string;
  playerIds: string[];
  wordIds: number[];
  roles: string[];
  scores: Record<string, number>;
  round: number;
  phase: Phase;
  turn: number;
  clues: Record<string, string | null>;
  votes: Record<string, string>;
  deadline?: number;
  result?: Result;
};

function shuffled<T>(items: readonly T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function drawRoles(playerIds: string[]) {
  const previousImposters = new Set<string>();
  const roles: string[] = [];
  while (roles.length < playerIds.length) {
    // Favor players who have had fewer turns without making the last role
    // deducible from previous reveals.
    const pool = playerIds.filter((id) => id !== roles.at(-1))
      .flatMap((id) => Array.from({ length: previousImposters.has(id) ? 1 : 4 }, () => id));
    const next = pool[randomInt(pool.length)];
    roles.push(next);
    previousImposters.add(next);
  }
  return roles;
}

function playerName(context: GameContext, id: string) {
  return context.players.find((player) => player.id === id)?.name ?? "Player";
}

function verifyParticipant(state: State, context: GameContext) {
  if (!state.playerIds.includes(context.actorId) || !context.players.some(({ id }) => id === context.actorId)) {
    throw new Error("Only players in this Imposter match can open it.");
  }
}

function initialState(context: GameContext): State {
  if (context.actorId !== context.hostId) throw new Error("Only the host can start Imposter.");
  if (context.players.length < 4 || context.players.length > 10) throw new Error("Imposter needs four to ten players.");
  const playerIds = context.players.map(({ id }) => id);
  if (new Set(playerIds).size !== playerIds.length || !playerIds.includes(context.hostId)) {
    throw new Error("The Imposter room roster is invalid.");
  }
  return {
    id: randomUUID(),
    playerIds,
    wordIds: shuffled(words.map((_, index) => index)).slice(0, playerIds.length),
    roles: drawRoles(playerIds),
    scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
    round: 0,
    phase: "deal",
    turn: 0,
    clues: {},
    votes: {},
  };
}

function actionId(state: State, verb: string) {
  return [verb, state.id, state.round, state.turn].join(".");
}

function leadPlayer(state: State) {
  return state.playerIds[(state.round + state.turn) % state.playerIds.length];
}

function control(state: State, verb: string, label: string, fields?: GameControl["fields"]): GameControl {
  return { id: actionId(state, verb), label, fields };
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function normalizedAnswer(value: string) {
  return normalize(value).replace(/^(a|an|the) /, "").replaceAll(" ", "");
}

function cleanedText(value: string | undefined, maximum: number, message: string) {
  const cleaned = (value ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > maximum || !normalize(cleaned)) throw new Error(message);
  return cleaned;
}

function isExpired(state: State, now: number) {
  return state.deadline !== undefined && now >= state.deadline;
}

function countVotes(state: State) {
  const tallies: Record<string, number> = Object.fromEntries(state.playerIds.map((id) => [id, 0]));
  for (const targetId of Object.values(state.votes)) tallies[targetId] += 1;
  return tallies;
}

function reveal(state: State, result: Result): State {
  const winners = result.verdict === "caught" || result.verdict === "guess-expired"
    ? state.playerIds.filter((id) => id !== state.roles[state.round])
    : [state.roles[state.round]];
  const scores = Object.fromEntries(state.playerIds.map((id) => [
    id, state.scores[id] + Number(winners.includes(id)),
  ]));
  return { ...state, result, scores, phase: "reveal", deadline: undefined };
}

function resolveVotes(state: State, now: number): State {
  const tallies = countVotes(state);
  const high = Math.max(...Object.values(tallies));
  if (high === 0) return reveal(state, { verdict: "no-votes", tallies });
  const leaders = state.playerIds.filter((id) => tallies[id] === high);
  if (leaders.length !== 1) return reveal(state, { verdict: "tie", tallies });
  if (leaders[0] !== state.roles[state.round]) return reveal(state, { verdict: "miss", tallies });
  return { ...state, phase: "last-guess", deadline: now + GUESS_MS };
}

function roundControls(state: State, context: GameContext): GameControl[] {
  const host = context.actorId === context.hostId;
  const expired = isExpired(state, context.now);
  switch (state.phase) {
    case "deal":
      return host ? [control(state, "start-clues", "Begin clue turns")] : [];
    case "clues":
      if (expired) return [control(state, "skip-clue", "Skip expired clue")];
      if (context.actorId !== leadPlayer(state)) return [];
      return [
        control(state, "clue", "Share clue", [{ name: "clue", label: "Your clue", type: "text", maxLength: 100 }]),
        control(state, "skip-clue", "Pass"),
      ];
    case "discussion":
      return host ? [control(state, "start-voting", "Open accusations")] : [];
    case "voting":
      if (expired || Object.keys(state.votes).length === state.playerIds.length) {
        return [control(state, "close-voting", "Count accusations")];
      }
      if (Object.hasOwn(state.votes, context.actorId)) return [];
      return [control(state, "vote", "Lock accusation", [{
        name: "suspect", label: "Who is the imposter?", type: "select",
        options: state.playerIds.filter((id) => id !== context.actorId)
          .map((id) => ({ value: id, label: playerName(context, id) })),
      }])];
    case "last-guess":
      if (expired) return [control(state, "expire-guess", "Reveal expired guess")];
      return context.actorId === state.roles[state.round] ? [control(state, "guess", "Make final guess", [{
        name: "guess", label: "Secret word", type: "text", maxLength: 70,
      }])] : [];
    case "reveal":
      return host ? [control(state, "advance", state.round + 1 === state.wordIds.length
        ? "See final standings" : "Deal next word")] : [];
    case "complete":
      return [];
  }
}

const verdictLabels: Record<Verdict, string> = {
  miss: "The room accused an insider. The imposter wins the round.",
  tie: "The accusations tied. The imposter wins the round.",
  "no-votes": "Nobody cast an accusation. The imposter wins the round.",
  stolen: "The imposter guessed the word and stole the round.",
  caught: "The room caught the imposter and the final guess missed. Each insider scores one point.",
  "guess-expired": "The imposter ran out of time. Each insider scores one point.",
};

function viewFor(state: State, context: GameContext): GameView {
  verifyParticipant(state, context);
  const [category, word] = words[state.wordIds[state.round]];
  const imposter = state.roles[state.round];
  const isImposter = context.actorId === imposter;
  const round = `Round ${state.round + 1} of ${state.wordIds.length}`;
  const activePlayer = playerName(context, leadPlayer(state));
  const standings = state.playerIds.map((id) => ({ label: playerName(context, id), score: state.scores[id] }))
    .sort((first, second) => second.score - first.score);

  const common = { phase: state.phase, round, controls: roundControls(state, context), standings };
  if (state.phase === "complete") {
    const winners = standings.filter(({ score }) => score === standings[0].score).map(({ label }) => label);
    return { ...common, heading: "Final standings", detail: `${winners.join(", ")} ${winners.length === 1 ? "wins." : "share first place."}`, finished: true };
  }
  if (state.phase === "reveal") {
    const result = state.result!;
    const cards: DisplayCard[] = [
      { title: "Secret word", body: word },
      { title: "Imposter", body: playerName(context, imposter) },
      { title: "Accusation tally", items: state.playerIds.map((id) => `${playerName(context, id)} · ${result.tallies[id]}`) },
    ];
    if (result.guess) cards.push({ title: "Final guess", body: result.guess });
    return { ...common, heading: "Round reveal", detail: verdictLabels[result.verdict], cards };
  }

  const privateCards: DisplayCard[] = isImposter
    ? [{ title: "You are the imposter", body: "Listen for the word and offer a clue that fits." }]
    : [{ title: "You are an insider", body: word }];
  const cards: DisplayCard[] = [{ title: "Category", body: category }];
  const clues = state.playerIds.map((_, index) => state.playerIds[(state.round + index) % state.playerIds.length])
    .filter((id) => Object.hasOwn(state.clues, id))
    .map((id) => `${playerName(context, id)} · ${state.clues[id] ?? "Passed"}`);
  if (clues.length) cards.push({ title: "Clues shared", items: clues });
  const current = { ...common, cards, privateCards, deadline: state.deadline };
  switch (state.phase) {
    case "deal":
      return { ...current, heading: "Read your role", detail: "Keep your card private. The host begins when everyone is ready." };
    case "clues":
      return {
        ...current, heading: context.actorId === leadPlayer(state) ? "Your clue turn" : `${activePlayer} is giving a clue`,
        detail: "Give one short clue without using the secret word. Everyone gets one turn.",
      };
    case "discussion":
      return { ...current, heading: "Discuss the clues", detail: "Talk through anything suspicious. The host opens accusations when the room is ready." };
    case "voting":
      if (Object.hasOwn(state.votes, context.actorId)) {
        privateCards.push({ title: "Accusation locked", body: playerName(context, state.votes[context.actorId]) });
      }
      return {
        ...current, heading: "Accuse someone",
        detail: `${Object.keys(state.votes).length} of ${state.playerIds.length} accusations locked. Ties favor the imposter.`,
      };
    case "last-guess":
      return {
        ...current, heading: "One last guess",
        detail: isImposter ? "Guess the exact secret word to steal the round."
          : "The room caught the imposter. They have one private guess to steal the round.",
      };
  }
}

export const game: GameDefinition<State> = {
  slug: "imposter",
  title: "Imposter",
  description: "Give one clue, compare stories, and catch the player missing the secret word.",
  minimumPlayers: 4,
  maximumPlayers: 10,
  instructions: [
    "Read your private role. Insiders get the secret word. The imposter only gets the category.",
    "Give one short clue when your turn comes. Discuss the clues, then privately accuse one other player.",
    "The imposter scores if they evade the vote, tie the vote, or guess the secret word after being caught. Otherwise each insider scores.",
    "The imposter changes every round. The highest score wins.",
  ],
  create: initialState,
  view: viewFor,
  act(state, context, action) {
    verifyParticipant(state, context);
    const move = roundControls(state, context).find(({ id }) => id === action.id);
    if (!move) throw new Error("That move is unavailable. Check the current phase and turn.");
    switch (move.id.split(".")[0]) {
      case "start-clues":
        return { ...state, phase: "clues", deadline: context.now + CLUE_MS };
      case "clue":
      case "skip-clue": {
        const id = leadPlayer(state);
        const passing = action.id === actionId(state, "skip-clue");
        const clue = passing ? null : cleanedText(action.values.clue, 100, "Share a clue of 1–100 characters.");
        const word = words[state.wordIds[state.round]][1];
        if (clue && id !== state.roles[state.round]
          && ` ${normalize(clue)} `.includes(` ${normalize(word)} `)) {
          throw new Error("Choose a clue that does not contain the secret word.");
        }
        const clues = { ...state.clues, [id]: clue };
        if (state.turn + 1 === state.playerIds.length) return { ...state, clues, phase: "discussion", deadline: undefined };
        return { ...state, clues, turn: state.turn + 1, deadline: context.now + CLUE_MS };
      }
      case "start-voting":
        return { ...state, phase: "voting", deadline: context.now + VOTE_MS };
      case "vote": {
        const candidate = action.values.suspect;
        if (candidate === context.actorId || !state.playerIds.includes(candidate)) {
          throw new Error("Choose another player in this match.");
        }
        return { ...state, votes: { ...state.votes, [context.actorId]: candidate } };
      }
      case "close-voting":
        return resolveVotes(state, context.now);
      case "guess": {
        const guess = cleanedText(action.values.guess, 70, "Enter a guess of 1–70 characters.");
        const correct = normalizedAnswer(guess) === normalizedAnswer(words[state.wordIds[state.round]][1]);
        return reveal(state, { verdict: correct ? "stolen" : "caught", tallies: countVotes(state), guess });
      }
      case "expire-guess":
        return reveal(state, { verdict: "guess-expired", tallies: countVotes(state) });
      case "advance":
        if (state.round + 1 === state.wordIds.length) return { ...state, phase: "complete" };
        return { ...state, round: state.round + 1, turn: 0, phase: "deal", clues: {}, votes: {}, result: undefined };
      default:
        throw new Error("That move is unavailable.");
    }
  },
};
