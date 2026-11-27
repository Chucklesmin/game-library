import { randomInt, randomUUID } from "node:crypto";
import type { GameAction, GameContext, GameDefinition, GameView } from "../contract.ts";

const phrases = [
  "Folding chair",
  "Velvet lantern",
  "Lemon parade",
  "Pocket compass",
  "Marble staircase",
  "Tinfoil crown",
  "Noodle comet",
  "Copper kettle",
  "Paper submarine",
  "Velcro wallet",
  "Peach marmalade",
  "Charcoal pencil",
];

const sessionLengths = [3, 5, 7];
const alphabet = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const roundDuration = 105_000;
const strikeLimit = 2;

type Key = Record<string, string>;

type Puzzle = {
  phrase: string;
  cipher: string[];
  keys: [Key, Key];
};

type State = {
  token: string;
  phase: "setup" | "decoding" | "reveal" | "complete";
  puzzles: Puzzle[];
  roundCount: number;
  index: number;
  deadline: number;
  strikes: number;
  outcome: "solved" | "missed" | "expired" | null;
  solves: number;
  streak: number;
  bestStreak: number;
  secondsSaved: number;
};

function shuffle<Value>(values: readonly Value[]) {
  const shuffled = [...values];
  for (let current = shuffled.length - 1; current > 0; current -= 1) {
    const other = randomInt(current + 1);
    [shuffled[current], shuffled[other]] = [shuffled[other], shuffled[current]];
  }
  return shuffled;
}

function makePuzzle(phrase: string): Puzzle {
  const shuffled = shuffle(alphabet);
  const letters = new Set(phrase.toUpperCase().replaceAll(" ", ""));
  const fromPhrase = shuffled.findIndex((letter) => letters.has(letter));
  const firstHalf = fromPhrase % 2;
  const needsOtherHalf = !shuffled.some((letter, index) => index % 2 !== firstHalf && letters.has(letter));
  if (needsOtherHalf) {
    const fromOtherHalf = shuffled.findIndex((_, index) => index % 2 !== firstHalf);
    [shuffled[fromPhrase], shuffled[fromOtherHalf]] = [shuffled[fromOtherHalf], shuffled[fromPhrase]];
  }
  const keys: [Key, Key] = [{}, {}];
  const encode: Key = {};

  shuffled.forEach((letter, index) => {
    const symbol = String(index + 1).padStart(2, "0");
    keys[index % 2][symbol] = letter;
    encode[letter] = symbol;
  });

  const cipher = phrase.toUpperCase().split(" ").map((word) =>
    [...word].map((letter) => encode[letter]).join(" · "),
  );
  return { phrase, cipher, keys };
}

function normalize(answer: string) {
  return answer.normalize("NFKD").toUpperCase().replace(/[^A-Z]/g, "");
}

function startRound(state: State, index: number, now: number): State {
  return {
    ...state, phase: "decoding", index, deadline: now + roundDuration, strikes: 0, outcome: null,
  };
}

function reveal(state: State, outcome: NonNullable<State["outcome"]>, now: number): State {
  const solved = outcome === "solved";
  const streak = solved ? state.streak + 1 : 0;
  return {
    ...state,
    phase: "reveal",
    outcome,
    solves: state.solves + Number(solved),
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    secondsSaved: state.secondsSaved + (solved ? Math.floor((state.deadline - now) / 1000) : 0),
  };
}

function seat(context: GameContext) {
  const index = context.players.findIndex(({ id }) => id === context.actorId);
  if (index < 0) throw new Error("Only players in the room can take part.");
  return index;
}

function actionId(state: State, command: string) {
  return `${command}:${state.token}:${state.index}`;
}

function create(context: GameContext): State {
  if (context.players.length !== 2 || new Set(context.players.map(({ id }) => id)).size !== 2) {
    throw new Error("Cipher Pair needs exactly two players.");
  }
  if (context.actorId !== context.hostId) throw new Error("Only the host can start Cipher Pair.");
  seat(context);
  return {
    token: randomUUID(),
    phase: "setup",
    puzzles: shuffle(phrases).slice(0, Math.max(...sessionLengths)).map(makePuzzle),
    roundCount: 0, index: 0, deadline: 0, strikes: 0, outcome: null,
    solves: 0, streak: 0, bestStreak: 0, secondsSaved: 0,
  };
}

function act(state: State, context: GameContext, action: GameAction): State {
  seat(context);
  if (state.phase === "setup" && action.id === actionId(state, "choose")) {
    if (context.actorId !== context.hostId) throw new Error("Only the host can choose the session length.");
    const option = sessionLengths.find((length) => String(length) === action.values.rounds);
    if (!option) throw new Error("Choose 3, 5, or 7 puzzles.");
    return startRound({ ...state, roundCount: option }, 0, context.now);
  }

  if (state.phase === "decoding") {
    if (action.id === actionId(state, "expire") && context.now >= state.deadline) {
      return reveal(state, "expired", context.now);
    }
    if (action.id === actionId(state, "decode-" + state.strikes) && context.now < state.deadline) {
      const input = action.values.answer;
      if (typeof input !== "string" || input.length > 80 || !normalize(input)) {
        throw new Error("Enter a phrase of up to 80 characters.");
      }
      if (normalize(input) === normalize(state.puzzles[state.index].phrase)) {
        return reveal(state, "solved", context.now);
      }
      const missed = { ...state, strikes: state.strikes + 1 };
      return missed.strikes >= strikeLimit ? reveal(missed, "missed", context.now) : missed;
    }
  }

  if (state.phase === "reveal" && action.id === actionId(state, "continue")) {
    if (context.actorId !== context.hostId) throw new Error("Only the host can continue.");
    if (state.index + 1 >= state.roundCount) return { ...state, phase: "complete" };
    return startRound(state, state.index + 1, context.now);
  }
  throw new Error("This move is unavailable in the current phase.");
}

function view(state: State, context: GameContext): GameView {
  const index = seat(context);
  const isHost = context.actorId === context.hostId;
  if (state.phase === "setup") {
    return {
      phase: state.phase,
      heading: "Choose the session length",
      detail: isHost ? "How many coded phrases do you want to solve together?" : "Waiting for the host to choose the number of puzzles.",
      controls: isHost ? [{
        id: actionId(state, "choose"), label: "Deal the first code", fields: [{
          name: "rounds", label: "Puzzles", type: "select",
          options: sessionLengths.map((length) => ({ value: String(length), label: String(length) })),
        }],
      }] : [],
    };
  }

  const round = `Puzzle ${state.index + 1} of ${state.roundCount}`;
  const standings = [
    { label: "Together solved", score: state.solves },
    { label: "Best streak", score: state.bestStreak },
    { label: "Seconds left on solved puzzles", score: state.secondsSaved },
  ];
  if (state.phase === "complete") {
    return {
      phase: state.phase, heading: "Session complete", detail: `You decoded ${state.solves} of ${state.roundCount} phrases together.`,
      standings, controls: [], finished: true,
    };
  }

  const puzzle = state.puzzles[state.index];
  if (state.phase === "reveal") {
    const heading = state.outcome === "solved" ? "Code cracked" :
      state.outcome === "expired" ? "Time ran out" : "No strikes left";
    return {
      phase: state.phase, heading, round,
      cards: [{ title: "Decoded phrase", body: puzzle.phrase }],
      standings,
      controls: isHost ? [{
        id: actionId(state, "continue"),
        label: state.index + 1 >= state.roundCount ? "See session results" : "Deal next code",
      }] : [],
    };
  }

  const firstReader = context.players[state.index % 2];
  const expired = context.now >= state.deadline;
  const remaining = strikeLimit - state.strikes;
  const privateKey = puzzle.keys[(index + state.index) % 2];
  return {
    phase: state.phase, heading: "Decode the phrase", round, deadline: state.deadline,
    detail: expired ? "The clock has expired. Reveal the phrase together." :
      `${firstReader.name} reads the first number. Talk through the keys together. ${remaining} ${remaining === 1 ? "strike" : "strikes"} left.`,
    cards: [{
      title: "Code on both screens",
      body: `Word lengths: ${puzzle.cipher.map((word) => word.split(" · ").length).join(", ")} letters.`,
      items: puzzle.cipher.map((word, wordIndex) => `Word ${wordIndex + 1}: ${word}`),
    }],
    privateCards: [{
      title: "Your half of the key",
      items: Object.entries(privateKey)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([symbol, letter]) => `${symbol} → ${letter}`),
    }],
    standings,
    controls: expired ? [{ id: actionId(state, "expire"), label: "Reveal expired code" }] : [{
      id: actionId(state, "decode-" + state.strikes), label: "Submit shared answer",
      fields: [{ name: "answer", label: "Decoded phrase", type: "text", maxLength: 80 }],
    }],
  };
}

export const game: GameDefinition<State> = {
  slug: "cipher-pair",
  title: "Cipher Pair",
  description: "Combine two private keys to decode a phrase before time runs out.",
  minimumPlayers: 2,
  maximumPlayers: 2,
  instructions: [
    "You both see a coded phrase. Your screen shows only half of its number-to-letter key.",
    "Read the numbers in order and ask your partner for letters missing from your key. Keep your screens private.",
    "Either player can submit the full phrase. You share two strikes and 105 seconds for each puzzle.",
    "The first reader alternates. Track your total solves, best streak and seconds saved together.",
  ],
  create,
  act,
  view,
};
