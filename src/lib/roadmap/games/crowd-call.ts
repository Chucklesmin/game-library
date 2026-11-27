import type { DisplayCard, GameContext, GameControl, GameDefinition, GameView } from "../contract.ts";

const ROUND_COUNT = 5;

const prompts = [
  { question: "What would this room save from a closing neighborhood arcade?", choices: ["The pinball machine", "The racing cabinet", "The claw machine", "The high-score board"] },
  { question: "What would make everyone stop scrolling on a rainy afternoon?", choices: ["A blanket fort", "A puzzle on the table", "A stovetop snack", "A movie picked by a coin flip"] },
  { question: "What should our group put on the cover of its imaginary album?", choices: ["A blurry elevator photo", "An empty diner booth", "Everyone's shoes in a circle", "A crooked traffic cone"] },
  { question: "Which tiny adventure would this room choose for a surprise day off?", choices: ["A ferry with no destination picked", "A bakery crawl", "A visit to a used bookstore", "A picnic at the nearest park"] },
  { question: "Which job would this room give a very polite ghost?", choices: ["Proofread signs", "Cool down the fridge", "Locate missing keys"] },
  { question: "What should be the mascot for a team that always arrives early?", choices: ["A caffeinated turtle", "A punctual pigeon", "A rooster with a wristwatch", "A dog already by the door"] },
  { question: "What would we add to a waiting room to make the time go faster?", choices: ["A tiny putting green", "A shelf of odd magazines", "A window onto a bird feeder", "A jar of conversation cards", "A communal crossword"] },
  { question: "What would this room order first at a midnight pancake diner?", choices: ["Chocolate chip pancakes", "A tower of waffles", "Crispy hash browns", "A strawberry milkshake"] },
  { question: "Which souvenir would our room keep from a fictional moon vacation?", choices: ["A pressed moon flower", "A low-gravity snow globe", "A stamped crater map", "A postcard that arrives first"] },
  { question: "Which sound should open our group's imaginary late-night radio show?", choices: ["A chair scooting over tile", "Three knocks on a door", "A microwave finishing", "A train crossing a bridge"] },
  { question: "Which new room should our library add?", choices: ["A rain-sounds room", "A nap room", "A board-game room", "A quiet greenhouse", "A room for very loud page turns"] },
  { question: "What would we trust a helpful household robot to handle first?", choices: ["Fold the fitted sheet", "Untangle the charging cables", "Sort the sock drawer", "Water every plant exactly enough"] },
  { question: "Which event should be the finale at a very small neighborhood fair?", choices: ["A slow bicycle race", "A porch-light parade", "A rubber-duck boat race", "A sidewalk chalk final"] },
  { question: "Where would this room put an unexpected free bench?", choices: ["At the top of a hill", "Under a wide tree", "Outside the corner bakery", "Beside the bus stop"] },
  { question: "What would this room choose as a prize for winning a low-stakes contest?", choices: ["The first slice of cake", "A tiny trophy", "Control of the next playlist", "A handwritten certificate"] },
  { question: "What would we put at the center of a maze made of cardboard?", choices: ["A cold lemonade stand", "A working photo booth", "An absurdly comfortable chair"] },
] as const;

type ChoicesByPlayer = Readonly<Record<string, number>>;
type Result = { counts: number[]; leaders: number[] };
type State = {
  phase: "prediction" | "voting" | "reveal" | "complete";
  match: number;
  round: number;
  firstPrompt: number;
  predictions: ChoicesByPlayer;
  ballots: ChoicesByPlayer;
  scores: ChoicesByPlayer;
  result: Result | null;
};

function checkParticipant(context: GameContext) {
  if (!context.players.some((player) => player.id === context.actorId)) {
    throw new Error("Only Crowd Call players can open this match.");
  }
}

function checkHost(context: GameContext) {
  if (context.actorId !== context.hostId) throw new Error("Only the host can advance Crowd Call.");
}

function promptFor(state: State) {
  return prompts[(state.firstPrompt + state.round - 1) % prompts.length];
}

function moveId(state: State, name: string) {
  return `${name}-${state.match}-${state.round}`;
}

function choose(state: State, choices: ChoicesByPlayer, actorId: string, value: string) {
  if (Object.hasOwn(choices, actorId)) throw new Error("Your choice is already locked.");
  const index = promptFor(state).choices.findIndex((_, option) => String(option) === value);
  if (index === -1) throw new Error("Pick an answer to lock in.");
  return { ...choices, [actorId]: index };
}

function roundPoints(state: State, playerId: string, leaders: readonly number[]) {
  const predictionPoints = leaders.includes(state.predictions[playerId]) ? 2 : 0;
  const votePoints = leaders.includes(state.ballots[playerId]) ? 1 : 0;
  return { predictionPoints, votePoints, total: predictionPoints + votePoints };
}

function closeVoting(state: State, context: GameContext): State {
  const counts = promptFor(state).choices.map(() => 0);
  for (const choice of Object.values(state.ballots)) counts[choice] += 1;
  const highest = Math.max(...counts);
  const leaders = counts.flatMap((count, index) => count > 0 && count === highest ? [index] : []);
  const scores = Object.fromEntries(context.players.map(({ id }) => [
    id,
    state.scores[id] + roundPoints(state, id, leaders).total,
  ]));
  return { ...state, scores, result: { counts, leaders }, phase: "reveal" };
}

function choiceControl(state: State, name: string, label: string, fieldLabel: string): GameControl {
  return {
    id: moveId(state, name),
    label,
    fields: [{
      name: "choice",
      label: fieldLabel,
      type: "select",
      options: promptFor(state).choices.map((choice, index) => ({ value: String(index), label: choice })),
    }],
  };
}

function standingsFor(state: State, context: GameContext) {
  return context.players
    .map(({ id, name }) => ({ label: name, score: state.scores[id] }))
    .sort((first, second) => second.score - first.score);
}

function viewFor(state: State, context: GameContext): GameView {
  checkParticipant(context);
  const prompt = promptFor(state);
  const host = context.actorId === context.hostId;
  const prediction = state.predictions[context.actorId];
  const ballot = state.ballots[context.actorId];
  const privateCards: DisplayCard[] = [];
  const round = `Round ${state.round} of ${ROUND_COUNT}`;
  if (prediction !== undefined) privateCards.push({ title: "Your prediction", body: prompt.choices[prediction] });
  if (ballot !== undefined) privateCards.push({ title: "Your vote", body: prompt.choices[ballot] });

  if (state.phase === "prediction") {
    const controls: GameControl[] = [];
    if (prediction === undefined) controls.push(choiceControl(state, "predict", "Lock prediction", "Most popular answer"));
    if (host) controls.push({ id: moveId(state, "open"), label: "Open voting" });
    const total = Object.keys(state.predictions).length;
    return {
      phase: "Prediction",
      heading: prompt.question,
      detail: `Predict what the room will pick. ${total} of ${context.players.length} predictions locked.`,
      round, controls, privateCards,
    };
  }

  if (state.phase === "voting") {
    const controls: GameControl[] = [];
    if (ballot === undefined) controls.push(choiceControl(state, "vote", "Lock vote", "Your own answer"));
    if (host) controls.push({ id: moveId(state, "close"), label: "Reveal tally" });
    const total = Object.keys(state.ballots).length;
    return {
      phase: "Voting",
      heading: prompt.question,
      detail: `Vote for your own answer. ${total} of ${context.players.length} votes locked.`,
      round, controls, privateCards,
    };
  }

  const standings = standingsFor(state, context);
  if (state.phase === "complete") {
    const topScore = standings[0].score;
    const winners = standings.filter(({ score }) => score === topScore).map(({ label }) => label);
    const detail = topScore === 0
      ? "No points were scored this match."
      : `${winners.join(", ")} ${winners.length === 1 ? "wins" : "tie for first"} with ${topScore} points.`;
    return { phase: "Final", heading: "Final standings", detail, standings, controls: [], finished: true };
  }

  const result = state.result!;
  const { predictionPoints, votePoints, total } = roundPoints(state, context.actorId, result.leaders);
  privateCards.push({
    title: "Your round score",
    body: `+${total}`,
    items: [
      `${prediction === undefined ? "No prediction" : "Prediction"} · +${predictionPoints}`,
      `${ballot === undefined ? "No vote" : "Vote"} · +${votePoints}`,
    ],
  });
  const detail = result.leaders.length
    ? `${result.leaders.map((index) => prompt.choices[index]).join(" / ")} ${result.leaders.length === 1 ? "led the vote" : "tied for the lead"}.`
    : "The room cast no ballots. Nobody earned points.";
  return {
    phase: "Reveal",
    heading: "The room's call",
    detail,
    round,
    cards: [{
      title: prompt.question,
      items: prompt.choices.map((choice, index) => {
        const count = result.counts[index];
        const leadLabel = result.leaders.includes(index) ? " · Leading answer" : "";
        return `${choice} — ${count} ${count === 1 ? "vote" : "votes"}${leadLabel}`;
      }),
    }],
    privateCards,
    standings,
    controls: host ? [{ id: moveId(state, "next"), label: state.round < ROUND_COUNT ? "Next prompt" : "See final standings" }] : [],
  };
}

export const game: GameDefinition<State> = {
  slug: "crowd-call",
  title: "Crowd Call",
  description: "Read the room first. Then cast your own vote and see how close you called it.",
  minimumPlayers: 3,
  maximumPlayers: 12,
  instructions: [
    "First, lock a private prediction for the answer you expect to lead.",
    "Then cast a private vote for your own answer. The host can advance when players are away.",
    "Earn 2 points for predicting a leading answer and 1 for voting for one. All answers tied for the highest vote count qualify. With no votes, nobody scores.",
    "Play five rounds. The highest total wins, and tied players share first place.",
  ],
  create(context) {
    checkParticipant(context);
    checkHost(context);
    if (context.players.length < game.minimumPlayers || context.players.length > game.maximumPlayers) {
      throw new Error("Crowd Call needs 3–12 players.");
    }
    return {
      phase: "prediction",
      match: context.now,
      round: 1,
      firstPrompt: Math.floor(context.now / 1000) % prompts.length,
      predictions: {},
      ballots: {},
      scores: Object.fromEntries(context.players.map(({ id }) => [id, 0])),
      result: null,
    };
  },
  act(state, context, action) {
    checkParticipant(context);
    if (state.phase === "prediction") {
      if (action.id === moveId(state, "predict")) {
        return { ...state, predictions: choose(state, state.predictions, context.actorId, action.values.choice) };
      }
      if (action.id === moveId(state, "open")) {
        checkHost(context);
        return { ...state, phase: "voting" };
      }
    }
    if (state.phase === "voting") {
      if (action.id === moveId(state, "vote")) {
        return { ...state, ballots: choose(state, state.ballots, context.actorId, action.values.choice) };
      }
      if (action.id === moveId(state, "close")) {
        checkHost(context);
        return closeVoting(state, context);
      }
    }
    if (state.phase === "reveal" && action.id === moveId(state, "next")) {
      checkHost(context);
      if (state.round === ROUND_COUNT) return { ...state, phase: "complete" };
      return { ...state, phase: "prediction", round: state.round + 1, predictions: {}, ballots: {}, result: null };
    }
    throw new Error("That action is no longer available. Check the current round.");
  },
  view: viewFor,
};
