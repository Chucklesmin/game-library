import { randomInt } from "node:crypto";
import type { GameContext, GameControl, GameDefinition, GameView, Stroke } from "../contract.ts";

const DRAWING_TIME_MS = 55_000;
const STROKE_DELAY_MS = 60;
const GUESS_DELAY_MS = 650;
const MAX_STROKES = 50;
const MAX_STROKE_POINTS = 150;
const MAX_DRAWING_POINTS = 3_000;
const MAX_GUESS_LENGTH = 72;
const COLORS = ["#211721", "#be3b44", "#2160b3", "#237b58", "#b66c15"];
const WIDTHS = [2, 4, 7];

type Clue = { scene: string; parts: readonly (readonly string[])[] };
const clues: readonly Clue[] = [
  { scene: "A snowman with a scarf", parts: [["snowman", "snow person"], ["scarf", "scarves"]] },
  { scene: "A frog on a lily pad", parts: [["frog", "toad"], ["lily pad", "lilypad", "water lily"]] },
  { scene: "An umbrella in the wind", parts: [["umbrella", "parasol"], ["wind", "windy", "gust", "blowing", "blown"]] },
  { scene: "A broken pencil", parts: [["pencil"], ["broken", "snapped", "cracked", "split"]] },
  { scene: "A bear eating honey", parts: [["bear"], ["honey"]] },
  { scene: "A rabbit in a top hat", parts: [["rabbit", "bunny", "hare"], ["hat"]] },
  { scene: "A sailboat in a bottle", parts: [["sailboat", "sail boat", "ship", "boat"], ["bottle"]] },
  { scene: "A cat on a roof", parts: [["cat", "kitten"], ["roof", "rooftop"]] },
  { scene: "A clock with no hands", parts: [["clock", "watch"], ["no hands", "without hands", "missing hands", "handless"]] },
  { scene: "A fish jumping out of a bowl", parts: [["fish", "goldfish"], ["bowl", "fishbowl"], ["jumping", "leaping", "jump", "leap", "out"]] },
  { scene: "A bicycle with a flat tire", parts: [["bicycle", "bike"], ["flat", "deflated", "punctured", "puncture"], ["tire", "tyre", "wheel"]] },
  { scene: "A snail in a race", parts: [["snail"], ["race", "racing", "running", "finish line", "track"]] },
  { scene: "A dog chasing its tail", parts: [["dog", "puppy"], ["tail"], ["chasing", "chase", "spinning", "biting", "catching", "catch"]] },
  { scene: "An ice cream cone melting", parts: [["ice cream", "icecream", "gelato"], ["melting", "melted", "dripping", "drops"]] },
  { scene: "A kite stuck in a tree", parts: [["kite"], ["tree", "branch"]] },
  { scene: "A volcano with a flag", parts: [["volcano"], ["flag", "banner"]] },
  { scene: "A guitar with one string", parts: [["guitar"], ["one string", "single string", "1 string", "one remaining string"]] },
  { scene: "A stack of pancakes", parts: [["pancake", "pancakes", "flapjacks", "hotcakes"], ["stack", "stacked", "pile", "tower"]] },
  { scene: "An owl with glasses", parts: [["owl"], ["glasses", "spectacles", "eyeglasses"]] },
  { scene: "A duck wearing boots", parts: [["duck", "duckling"], ["boots", "boot", "wellies", "galoshes"]] },
  { scene: "A turtle with a backpack", parts: [["turtle", "tortoise"], ["backpack", "bag", "rucksack", "knapsack"]] },
  { scene: "An astronaut playing tennis", parts: [["astronaut", "spaceman", "space suit", "spacesuit"], ["tennis", "racket", "racquet"]] },
  { scene: "A bridge over a waterfall", parts: [["bridge"], ["waterfall", "waterfalls", "falls", "cascade"]] },
  { scene: "A mouse on a skateboard", parts: [["mouse", "rat"], ["skateboard", "skateboarding", "skate board"]] },
  { scene: "A pirate with a telescope", parts: [["pirate"], ["telescope", "spyglass", "spy glass"]] },
  { scene: "A cactus in a teacup", parts: [["cactus", "cacti", "succulent"], ["teacup", "tea cup", "cup", "mug"]] },
  { scene: "A cake with one candle", parts: [["cake", "cupcake"], ["candle", "candles"]] },
  { scene: "A horse behind a fence", parts: [["horse", "pony"], ["fence", "gate", "corral"]] },
  { scene: "A hot air balloon over a mountain", parts: [["balloon"], ["mountain", "mountains", "peak", "peaks"]] },
  { scene: "A robot watering flowers", parts: [["robot", "android"], ["watering", "waters", "watering can"], ["flower", "flowers", "plant", "plants", "garden"]] },
  { scene: "A penguin with earmuffs", parts: [["penguin"], ["earmuffs", "ear muffs", "headphones"]] },
  { scene: "A crocodile at the dentist", parts: [["crocodile", "alligator", "gator"], ["dentist", "dental", "tooth doctor"]] },
  { scene: "A shark with a toothbrush", parts: [["shark"], ["toothbrush", "tooth brush", "brushing teeth", "brushing its teeth"]] },
  { scene: "A ladder to the moon", parts: [["ladder"], ["moon"]] },
  { scene: "A dragon blowing bubbles", parts: [["dragon"], ["bubbles", "bubble"]] },
  { scene: "A fox reading a book", parts: [["fox"], ["book", "reading", "novel"]] },
  { scene: "A clown on a unicycle", parts: [["clown", "jester"], ["unicycle", "one wheel", "single wheel"]] },
  { scene: "A bee carrying a suitcase", parts: [["bee", "bumblebee", "honeybee"], ["suitcase", "luggage", "briefcase", "case"]] },
  { scene: "A squirrel holding an umbrella", parts: [["squirrel"], ["umbrella", "parasol"]] },
  { scene: "A mushroom with a door", parts: [["mushroom", "toadstool"], ["door", "doorway", "house", "home"]] },
];

type Phase = "setup" | "ready" | "drawing" | "reveal" | "complete";
type Result = { kind: "solved"; guesser: string } | { kind: "expired" | "skipped" };
type State = {
  phase: Phase;
  roster: string[];
  promptStart: number;
  totalTurns: number;
  turn: number;
  deadline: number | null;
  strokes: Stroke[];
  strokePoints: number;
  strokeRevision?: number;
  lastStrokeAt: number | null;
  lastGuesses: Record<string, number>;
  result: Result | null;
  scores: Record<string, number>;
};

const artistId = (state: State) => state.roster[(state.turn - 1) % state.roster.length];
const currentClue = (state: State) => clues[(state.promptStart + state.turn - 1) % clues.length];
const moveId = (kind: string, state: State) => `${kind}-${state.turn}`;
const strokeRevision = (state: State) => state.strokeRevision ?? state.strokes.length;
const undoId = (state: State) => `${moveId("undo", state)}-${strokeRevision(state)}`;
const playerName = (context: GameContext, id: string) => context.players.find((player) => player.id === id)?.name ?? "Player";

function requireMember(state: State, context: GameContext) {
  if (!state.roster.includes(context.actorId)) throw new Error("Only the players in this match can play.");
}

function beginTurn(state: State, turn: number, totalTurns = state.totalTurns): State {
  return {
    ...state,
    phase: "ready",
    turn,
    totalTurns,
    deadline: null,
    strokes: [],
    strokePoints: 0,
    strokeRevision: 0,
    lastStrokeAt: null,
    lastGuesses: {},
    result: null,
  };
}

function reveal(state: State, result: Result): State {
  const scores = result.kind === "solved" ? {
    ...state.scores,
    [artistId(state)]: state.scores[artistId(state)] + 1,
    [result.guesser]: state.scores[result.guesser] + 2,
  } : state.scores;
  return { ...state, phase: state.turn === state.totalTurns ? "complete" : "reveal", deadline: null, result, scores };
}

function readStroke(raw: string | undefined): Stroke {
  if (!raw || raw.length > 15_000) throw new Error("That stroke is too large or empty.");
  let object: unknown;
  try {
    object = JSON.parse(raw);
  } catch {
    throw new Error("That stroke could not be read.");
  }
  if (!object || typeof object !== "object" || Array.isArray(object)) throw new Error("Invalid stroke.");
  const { color, width, points } = object as { color?: string; width?: number; points?: unknown };
  if (!color || !COLORS.includes(color) || typeof width !== "number" || !WIDTHS.includes(width)
      || !Array.isArray(points) || points.length < 1 || points.length > MAX_STROKE_POINTS) {
    throw new Error("Use an available pen and keep each stroke to 150 points.");
  }

  const cleanPoints: [number, number][] = points.map((point: unknown) => {
    if (!Array.isArray(point) || point.length !== 2 || !point.every((coordinate) =>
      typeof coordinate === "number" && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)) {
      throw new Error("Stroke points must stay inside the drawing area.");
    }
    return [Math.round(point[0] * 10_000) / 10_000, Math.round(point[1] * 10_000) / 10_000];
  });
  return { color, width, points: cleanPoints };
}

function normalizedAnswer(answer: string) {
  return answer.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/^(?:a|an|the)\s+/, "");
}

export const game: GameDefinition<State> = {
  slug: "sketch-relay",
  title: "Sketch Relay",
  description: "Draw the secret scene in 55 seconds while everyone else races to guess it.",
  minimumPlayers: 3,
  maximumPlayers: 8,
  instructions: [
    "One artist at a time draws a private scene. Skip letters, numbers, and spoken hints.",
    "Everyone else types the scene they see. Guess the main subject and its key action or detail.",
    "The first correct guess earns two points and gives the artist one. An unfinished sketch earns no points.",
    "Every player draws once or twice, depending on the host’s setup. The most points wins.",
  ],
  create(context) {
    const roster = context.players.map((player) => player.id);
    if (roster.length < 3 || roster.length > 8 || new Set(roster).size !== roster.length) {
      throw new Error("Sketch Relay needs 3–8 different players.");
    }
    return {
      phase: "setup", roster, promptStart: randomInt(clues.length), totalTurns: 0, turn: 0,
      deadline: null, strokes: [], strokePoints: 0, lastStrokeAt: null, lastGuesses: {}, result: null,
      scores: Object.fromEntries(roster.map((id) => [id, 0])),
    };
  },
  act(state, context, action) {
    requireMember(state, context);
    const { actorId, hostId, now } = context;
    if (state.phase === "setup" && action.id === "choose-passes") {
      if (actorId !== hostId) throw new Error("Only the host can choose the number of passes.");
      const { passes } = action.values;
      if (passes !== "1" && passes !== "2") throw new Error("Choose one or two passes around the group.");
      return beginTurn(state, 1, state.roster.length * Number(passes));
    }
    if (state.phase === "ready") {
      if (action.id === moveId("begin", state) && actorId === artistId(state)) {
        return { ...state, phase: "drawing", deadline: now + DRAWING_TIME_MS };
      }
      if (action.id === moveId("skip", state) && actorId === hostId) return reveal(state, { kind: "skipped" });
    }
    if (state.phase === "reveal" && action.id === moveId("next", state) && actorId === hostId) {
      return beginTurn(state, state.turn + 1);
    }
    if (state.phase !== "drawing" || state.deadline === null) throw new Error("That move is not available now.");
    if (action.id === moveId("expire", state)) {
      if (now < state.deadline) throw new Error("The artist still has time.");
      return reveal(state, { kind: "expired" });
    }
    if (now >= state.deadline) throw new Error("Time has run out. Reveal the answer to continue.");
    if (action.id === moveId("stroke", state)) {
      if (actorId !== artistId(state)) throw new Error("Only the active artist can draw.");
      if (state.lastStrokeAt !== null && now - state.lastStrokeAt < STROKE_DELAY_MS) {
        throw new Error("Give the last stroke a moment to save.");
      }
      const stroke = readStroke(action.values.stroke);
      const strokePoints = state.strokePoints + stroke.points.length;
      if (state.strokes.length >= MAX_STROKES || strokePoints > MAX_DRAWING_POINTS) {
        throw new Error("The sketch is full. Give the room a chance to guess.");
      }
      return {
        ...state, strokes: [...state.strokes, stroke], strokePoints,
        strokeRevision: strokeRevision(state) + 1, lastStrokeAt: now,
      };
    }
    if (action.id === undoId(state)) {
      if (actorId !== artistId(state)) throw new Error("Only the active artist can undo.");
      const lastStroke = state.strokes.at(-1);
      if (!lastStroke) throw new Error("There is no stroke to undo.");
      return {
        ...state, strokes: state.strokes.slice(0, -1), strokePoints: state.strokePoints - lastStroke.points.length,
        strokeRevision: strokeRevision(state) + 1,
      };
    }
    if (action.id === moveId("guess", state)) {
      if (actorId === artistId(state)) throw new Error("The artist cannot guess their own scene.");
      const { guess } = action.values;
      const answer = guess && guess.length <= MAX_GUESS_LENGTH ? normalizedAnswer(guess) : "";
      if (!answer) throw new Error("Enter a guess of 1–72 characters.");
      if (Object.hasOwn(state.lastGuesses, actorId) && now - state.lastGuesses[actorId] < GUESS_DELAY_MS) {
        throw new Error("Wait a moment before guessing again.");
      }
      const words = " " + answer + " ";
      const matches = currentClue(state).parts.every((part) => part.some((word) => words.includes(" " + word + " ")));
      if (matches) return reveal(state, { kind: "solved", guesser: actorId });
      return { ...state, lastGuesses: { ...state.lastGuesses, [actorId]: now } };
    }
    throw new Error("That move is not available now.");
  },
  view(state, context): GameView {
    requireMember(state, context);
    const { actorId, hostId, now } = context;
    const standings = state.roster.map((id) => ({ label: playerName(context, id), score: state.scores[id] }))
      .sort((first, second) => second.score - first.score);
    if (state.phase === "setup") {
      return {
        phase: state.phase, heading: "Set up your drawing relay",
        detail: actorId === hostId ? "Everyone draws once per pass." : "The host is choosing how often everyone draws.",
        controls: actorId === hostId ? [{
          id: "choose-passes", label: "Set up the first turn",
          fields: [{
            name: "passes", label: "Passes around the group", type: "select",
            options: [{ value: "1", label: "One pass" }, { value: "2", label: "Two passes" }],
          }],
        }] : [],
      };
    }

    const round = `Turn ${state.turn} of ${state.totalTurns}`;
    const artist = playerName(context, artistId(state));
    const isArtist = actorId === artistId(state);
    if (state.phase === "ready") {
      const controls: GameControl[] = [];
      if (isArtist) controls.push({ id: moveId("begin", state), label: "Start drawing" });
      if (actorId === hostId) controls.push({ id: moveId("skip", state), label: "Skip this turn" });
      return {
        phase: state.phase, round, standings, controls,
        heading: isArtist ? "You’re up to draw" : `${artist} draws next`,
        detail: isArtist
          ? "Start when you’re ready. Your scene and the 55-second timer will appear together."
          : "The timer starts when the artist is ready.",
      };
    }

    if (state.phase === "drawing" && state.deadline !== null) {
      const expired = now >= state.deadline;
      const full = state.strokes.length >= MAX_STROKES || state.strokePoints >= MAX_DRAWING_POINTS;
      const canDraw = isArtist && !expired && !full;
      const controls: GameControl[] = expired
        ? [{ id: moveId("expire", state), label: "Reveal the answer" }]
        : isArtist ? (state.strokes.length ? [{ id: undoId(state), label: "Undo last stroke" }] : []) : [{
          id: moveId("guess", state), label: "Guess",
          fields: [{ name: "guess", label: "Your guess", type: "text", maxLength: MAX_GUESS_LENGTH }],
        }];
      let detail = isArtist
        ? "Draw the scene with shapes. The group can see each stroke when you finish it."
        : "Name the subject and the action or detail you see.";
      if (expired) detail = "Time ran out. Reveal the answer to finish the turn.";
      else if (isArtist && full) detail = "The sketch is full. Undo a stroke to make room, or let the room guess.";
      else if (!isArtist && Object.hasOwn(state.lastGuesses, actorId)) detail = "That guess didn’t match. Try again.";
      return {
        phase: state.phase, round, standings, controls, detail, deadline: state.deadline,
        heading: isArtist ? "Draw your scene" : `Guess ${artist}’s scene`,
        privateCards: isArtist ? [{ title: "Your scene", body: currentClue(state).scene }] : undefined,
        drawing: { strokes: state.strokes, strokeAction: canDraw ? moveId("stroke", state) : undefined },
      };
    }

    const finished = state.phase === "complete";
    const leaders = standings.filter((entry) => entry.score === standings[0].score).map((entry) => entry.label);
    const detail = state.result?.kind === "solved"
      ? `${playerName(context, state.result.guesser)} guessed first and earned 2 points. ${artist} earned 1 point.`
      : state.result?.kind === "skipped" ? "The host skipped this turn. No points were awarded."
        : "Time ran out before a correct guess. No points were awarded.";
    return {
      phase: state.phase, round, standings, detail, finished,
      heading: finished ? "Sketch Relay complete" : state.result?.kind === "solved" ? "Scene solved!" : "Scene revealed",
      cards: [
        { title: "The scene", body: currentClue(state).scene },
        ...(finished ? [{
          title: leaders.length === 1 ? "Winner" : "Shared first place",
          body: `${leaders.join(", ")} · ${standings[0].score} points`,
        }] : []),
      ],
      drawing: state.strokes.length > 0 ? { strokes: state.strokes } : undefined,
      controls: !finished && actorId === hostId ? [{ id: moveId("next", state), label: "Next artist" }] : [],
    };
  },
};
