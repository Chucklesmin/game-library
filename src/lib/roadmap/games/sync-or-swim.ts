import type { GameContext, GameDefinition, GameView } from "../contract.ts";

const ROUND_COUNT = 6;
const ROUND_DURATION_MS = 45_000;
const TARGET_STREAK = 3;
const PREDICTION_ROUNDS = [2, 5];

const prompts = [
  { question: "Pick a window seat view for a long train ride.", choices: ["Pine forest", "City skyline", "Ocean cliffs", "Rolling farmland"] },
  { question: "A floating bookshop needs a mascot. Which one gets the job?", choices: ["Heron", "Otter", "Frog", "Beaver"] },
  { question: "Which sound should announce the arrival of a dinner delivery robot?", choices: ["Bicycle bell", "Tiny gong", "Boat horn", "Slide whistle"] },
  { question: "Which table would you sit at in an empty diner?", choices: ["Counter stool", "Window booth", "Round table", "Corner booth"] },
  { question: "Choose the first room to open in a museum of small joys.", choices: ["Fresh bread", "Good socks", "Bouncy pens", "Rain on a roof"] },
  { question: "What goes in the middle of a backyard on game night?", choices: ["Projector screen", "Fire pit", "Giant beanbag", "Ping-pong table"] },
  { question: "Pick the quickest way to make a hotel room feel like home.", choices: ["Unpack your bag", "Find the best chair", "Put on music", "Open the curtains"] },
  { question: "A raccoon opened a repair shop. What does it specialize in?", choices: ["Bike bells", "Music boxes", "Pocket watches", "Flashlights"] },
  { question: "Which would you grab from a cart of free snacks?", choices: ["Soft pretzel", "Popcorn", "Apple slices", "Lemon bar"] },
  { question: "Pick a stop for a 20-minute road trip break.", choices: ["Scenic lookout", "Bakery", "Used bookstore", "Garden center"] },
  { question: "Which tool would you take on a tiny treasure hunt?", choices: ["Magnifying glass", "Paper map", "Compass", "Pocket mirror"] },
  { question: "A free hour opened up on a rainy Saturday. What sounds best?", choices: ["Make soup", "Play a board game", "Read on the couch", "Take a rain walk"] },
];

type Prediction = "match" | "miss" | "skip";
type Phase = "select" | "reveal" | "complete";
type Outcome = "match" | "miss" | "timeout";
type RoundResult = { round: number; outcome: Outcome };
const outcomeLabels: Record<Outcome, string> = { match: "Matched", miss: "Different picks", timeout: "Timed out" };

type State = {
  players: [string, string];
  round: number;
  promptOffset: number;
  phase: Phase;
  deadline: number;
  choices: Record<string, number>;
  predictions: Record<string, Prediction>;
  streak: number;
  bestStreak: number;
  matches: number;
  correctPredictions: number;
  history?: RoundResult[];
};

function currentPrompt(state: State) {
  return prompts[(state.promptOffset + state.round - 1) % prompts.length];
}

function outcome(state: State): Outcome {
  const [first, second] = state.players;
  if (!Object.hasOwn(state.choices, first) || !Object.hasOwn(state.choices, second)) {
    return "timeout";
  }
  return state.choices[first] === state.choices[second] ? "match" : "miss";
}

function resultHistory(state: State, result: Outcome): RoundResult[] {
  const history = state.history ?? [];
  return history.at(-1)?.round === state.round ? history : [...history, { round: state.round, outcome: result }];
}

function reveal(state: State): State {
  const result = outcome(state);
  const streak = result === "match" ? state.streak + 1 : 0;
  const roundPredictions = result === "timeout"
    ? 0
    : state.players.filter((id) => state.predictions[id] === result).length;

  return {
    ...state,
    phase: state.round === ROUND_COUNT ? "complete" : "reveal",
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    matches: state.matches + Number(result === "match"),
    correctPredictions: state.correctPredictions + roundPredictions,
    history: resultHistory(state, result),
  };
}

function requirePlayer(state: State, context: GameContext) {
  if (!state.players.includes(context.actorId)) {
    throw new Error("Only the two players in this game can see or play the round.");
  }
}

export const game: GameDefinition<State> = {
  slug: "sync-or-swim",
  title: "Sync or Swim",
  description: "Lock your choices in silence and see how long you can stay in sync.",
  minimumPlayers: 2,
  maximumPlayers: 2,
  instructions: [
    "Pick the answer you think your partner will pick. Keep your choices private until reveal.",
    "Make three matches in a row over six prompts to reach the shared streak goal.",
    "Some rounds offer a private prediction before you choose. Correct predictions are tracked separately.",
    "A mismatch or missed deadline breaks the streak.",
  ],
  create(context) {
    const [first, second] = context.players;
    if (context.players.length !== 2 || !first || !second || first.id === second.id) {
      throw new Error("Sync or Swim needs exactly two players.");
    }
    return {
      players: [first.id, second.id],
      round: 1,
      promptOffset: context.now % prompts.length,
      phase: "select",
      deadline: context.now + ROUND_DURATION_MS,
      choices: {},
      predictions: {},
      streak: 0,
      bestStreak: 0,
      matches: 0,
      correctPredictions: 0,
      history: [],
    };
  },
  act(state, context, action) {
    requirePlayer(state, context);
    const { actorId, now } = context;
    const { round } = state;

    if (state.phase === "reveal" && action.id === `next-${round}`) {
      return {
        ...state,
        round: round + 1,
        phase: "select",
        deadline: now + ROUND_DURATION_MS,
        history: resultHistory(state, outcome(state)),
        choices: {},
        predictions: {},
      };
    }
    if (state.phase !== "select") {
      throw new Error("That action is no longer available.");
    }
    if (action.id === `reveal-${round}`) {
      if (now < state.deadline) {
        throw new Error("Both choices stay private until everyone locks in or time runs out.");
      }
      return reveal(state);
    }
    if (now >= state.deadline) {
      throw new Error("Time is up. Reveal the round to continue.");
    }
    if (Object.hasOwn(state.choices, actorId)) {
      throw new Error("Your choice is already locked.");
    }

    const needsPrediction = PREDICTION_ROUNDS.includes(round)
      && !Object.hasOwn(state.predictions, actorId);
    if (needsPrediction) {
      const prediction = action.id === `predict-match-${round}` ? "match"
        : action.id === `predict-miss-${round}` ? "miss"
        : action.id === `predict-skip-${round}` ? "skip"
        : null;
      if (prediction === null) {
        throw new Error("Make or skip your prediction first.");
      }
      return { ...state, predictions: { ...state.predictions, [actorId]: prediction } };
    }
    if (action.id !== `choose-${round}`) {
      throw new Error("That action is no longer available.");
    }

    const { choice } = action.values;
    if (!/^[0-4]$/.test(choice ?? "") || Number(choice) >= currentPrompt(state).choices.length) {
      throw new Error("Choose an answer from this round.");
    }
    const next = { ...state, choices: { ...state.choices, [actorId]: Number(choice) } };
    return state.players.every((id) => Object.hasOwn(next.choices, id)) ? reveal(next) : next;
  },
  view(state, context) {
    requirePlayer(state, context);
    const { round } = state;
    const prompt = currentPrompt(state);
    const base = {
      round: `Round ${round} of ${ROUND_COUNT}`,
      standings: [
        { label: "Current streak", score: state.streak },
        { label: "Best streak", score: state.bestStreak },
        { label: "Matching rounds", score: state.matches },
        { label: "Correct predictions", score: state.correctPredictions },
      ],
    };

    if (state.phase === "select") {
      const selectionView: GameView = {
        ...base, phase: state.phase, heading: prompt.question, deadline: state.deadline, controls: [],
      };
      if (context.now >= state.deadline) {
        return {
          ...selectionView,
          detail: "Time is up. Reveal both results to finish the round.",
          controls: [{ id: `reveal-${round}`, label: "Reveal choices" }],
        };
      }
      if (Object.hasOwn(state.choices, context.actorId)) {
        return { ...selectionView, detail: "Choice locked. Waiting for your partner." };
      }
      if (PREDICTION_ROUNDS.includes(round) && !Object.hasOwn(state.predictions, context.actorId)) {
        return {
          ...selectionView,
          detail: "Before choosing an answer, do you think you and your partner will match?",
          cards: [{ title: "Possible answers", items: [...prompt.choices] }],
          controls: [
            { id: `predict-match-${round}`, label: "We’ll match" },
            { id: `predict-miss-${round}`, label: "We’ll pick differently" },
            { id: `predict-skip-${round}`, label: "Skip prediction" },
          ],
        };
      }
      return {
        ...selectionView,
        detail: "Choose privately. Both answers appear together.",
        controls: [{
          id: `choose-${round}`,
          label: "Lock choice",
          fields: [{
            name: "choice",
            label: "Your choice",
            type: "select",
            options: prompt.choices.map((choice, index) => ({ value: String(index), label: choice })),
          }],
        }],
      };
    }

    const result = outcome(state);
    const complete = state.phase === "complete";
    const resultHeading = result === "match" ? "In sync!" : result === "miss" ? "Different picks" : "Time ran out";
    const goalHeading = state.bestStreak >= TARGET_STREAK ? "Streak goal reached!" : "Session complete";
    const resultDetail = result === "match" ? "Your streak grew by one."
      : result === "miss" ? "Different choices reset your streak."
      : "At least one player missed their choice. The streak resets and predictions are void.";
    const history = resultHistory(state, result);

    return {
      ...base,
      phase: state.phase,
      heading: complete ? goalHeading : resultHeading,
      detail: complete ? `Goal: ${TARGET_STREAK} matches in a row. Your best streak was ${state.bestStreak}.` : resultDetail,
      cards: [
        { title: `Round ${round} · ${resultHeading}`, body: prompt.question },
        ...state.players.map((id) => {
          const prediction = state.predictions[id];
          const items = prediction === "match" || prediction === "miss"
            ? [`Prediction: ${prediction === "match" ? "Match" : "Different choices"} · ${result === "timeout" ? "Void" : prediction === result ? "Correct" : "Incorrect"}`]
            : undefined;
          return {
            title: context.players.find((player) => player.id === id)?.name ?? "Player",
            body: prompt.choices[state.choices[id]] ?? "No choice",
            items,
          };
        }),
        {
          title: "Round timeline",
          body: history[0].round > 1 ? "Earlier round results were not recorded." : undefined,
          items: history.map(({ round, outcome }) => `Round ${round} · ${outcomeLabels[outcome]}`),
        },
      ],
      finished: complete,
      controls: complete ? [] : [{ id: `next-${round}`, label: "Next prompt" }],
    };
  },
};
