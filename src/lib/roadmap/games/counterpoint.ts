import { randomInt, randomUUID } from "node:crypto";
import type { DisplayCard, GameContext, GameControl, GameDefinition, GameView } from "../contract.ts";

const lenses = {
  practical: "Most practical",
  creative: "Most creative",
  fair: "Most fair",
};

type Lens = keyof typeof lenses;
type Prompt = { claim: string; lens: Lens };

const prompts: readonly Prompt[] = [
  { claim: "Board game boxes should include a thirty-second version of the rules.", lens: "practical" },
  { claim: "Every park should have a spot reserved for inventing cloud names.", lens: "creative" },
  { claim: "The last slice should go to the person who chose the pizza.", lens: "fair" },
  { claim: "Every museum should end with an exhibit visitors can rearrange.", lens: "creative" },
  { claim: "Libraries should lend party supplies alongside books.", lens: "practical" },
  { claim: "In a potluck, the cook who brings dessert should get out of dish duty.", lens: "fair" },
  { claim: "Apartment elevators should have a button for ten seconds of music.", lens: "creative" },
  { claim: "Friends sharing a toolbox should keep it at the home farthest from a hardware shop.", lens: "practical" },
  { claim: "On a road trip, the person navigating should choose the music.", lens: "fair" },
  { claim: "Community gardens should grow a different shape of vegetable each season.", lens: "creative" },
  { claim: "A recipe should list every bowl and pan before the ingredients.", lens: "practical" },
  { claim: "In a group photo, the person taking the picture should always pick the next pose.", lens: "fair" },
];

const roundsPerMatch = 5;
const targetWins = 3;
const speechLimit = 280;
const seconds = { prep: 20, argument: 45, rebuttal: 30, prediction: 35 };

type Phase = keyof typeof seconds | "reveal" | "complete";
type Seat = 0 | 1;
type Pair<T> = [T, T];
type Ballot = { emphasis: Lens; guess: Lens };

type State = {
  players: Pair<string>;
  queue: number[];
  round: number;
  roundId: string;
  phase: Phase;
  deadline: number | null;
  opener: Seat;
  speaker: Seat;
  ready: Pair<boolean>;
  arguments: Pair<string | null>;
  rebuttals: Pair<string | null>;
  ballots: Pair<Ballot | null>;
  wins: Pair<number>;
  result: { points: Pair<number>; winner: Seat | null } | null;
};

const other = (seat: Seat): Seat => seat === 0 ? 1 : 0;

function put<T>(pair: Pair<T>, seat: Seat, value: T): Pair<T> {
  return seat === 0 ? [value, pair[1]] : [pair[0], value];
}

function seatFor(state: Pick<State, "players">, actorId: string): Seat {
  if (state.players[0] === actorId) return 0;
  if (state.players[1] === actorId) return 1;
  throw new Error("Only these two players can take part in this match.");
}

function deck(): number[] {
  const queue: number[] = [];
  for (let round = 0; round < roundsPerMatch; round++) {
    const priorLens = prompts[queue[round - 1]]?.lens;
    const eligible = prompts.flatMap(({ lens }, index) => lens === priorLens || queue.includes(index) ? [] : [index]);
    queue.push(eligible[randomInt(eligible.length)]);
  }
  return queue;
}

function startRound(players: Pair<string>, queue: number[], round: number, wins: Pair<number>, now: number): State {
  const opener = ((round - 1) % 2) as Seat;
  return {
    players, queue, round, wins, opener, speaker: opener, roundId: randomUUID(),
    phase: "prep", deadline: now + seconds.prep * 1000,
    ready: [false, false], arguments: [null, null], rebuttals: [null, null],
    ballots: [null, null], result: null,
  };
}

const activePrompt = (state: State): Prompt => prompts[state.queue[state.round - 1]];
const playerName = (state: State, context: GameContext, seat: Seat): string =>
  context.players.find(({ id }) => id === state.players[seat])?.name ?? `Player ${seat + 1}`;

function actionId(state: State, action: string): string {
  return `${state.roundId}-${state.phase}-${state.speaker}-${action}`;
}

function enter(state: State, phase: keyof typeof seconds, now: number, speaker = state.opener): State {
  return { ...state, phase, speaker, deadline: now + seconds[phase] * 1000 };
}

function finishSpeech(state: State, text: string | null, now: number): State {
  const records = state.phase === "argument" ? "arguments" : "rebuttals";
  const updated = { ...state, [records]: put(state[records], state.speaker, text) };
  if (state.speaker === state.opener) {
    return enter(updated, state.phase === "argument" ? "argument" : "rebuttal", now, other(state.opener));
  }
  return enter(updated, state.phase === "argument" ? "rebuttal" : "prediction", now);
}

function readLens(value: string): Lens {
  if (!Object.hasOwn(lenses, value)) throw new Error("Choose one of the available judging lenses.");
  return value as Lens;
}

function resolve(state: State): State {
  const featured = activePrompt(state).lens;
  function score(seat: Seat): number {
    const ballot = state.ballots[seat];
    if (!ballot) return 0;
    const completeCase = Boolean(state.arguments[seat] && state.rebuttals[seat]);
    const choseFeatured = Number(completeCase && ballot.emphasis === featured);
    const correctPrediction = Number(ballot.guess === state.ballots[other(seat)]?.emphasis);
    return choseFeatured + correctPrediction;
  }
  const points: Pair<number> = [score(0), score(1)];
  const winner = points[0] === points[1] ? null : points[0] > points[1] ? 0 : 1;
  const wins = winner === null ? state.wins : put(state.wins, winner, state.wins[winner] + 1);
  const finished = wins.includes(targetWins) || state.round === roundsPerMatch;
  return { ...state, wins, result: { points, winner }, phase: finished ? "complete" : "reveal", deadline: null };
}

function expired(state: State, now: number): boolean {
  return state.deadline !== null && now >= state.deadline;
}

const lensOptions = (Object.entries(lenses) as [Lens, string][]).map(([value, label]) => ({ value, label }));

function control(state: State, action: string, label: string, fields?: GameControl["fields"]): GameControl {
  return { id: actionId(state, action), label, ...(fields ? { fields } : {}) };
}

function speechCards(state: State, context: GameContext): DisplayCard[] {
  const cards: DisplayCard[] = [];
  for (const [label, speeches] of [["Argument", state.arguments], ["Rebuttal", state.rebuttals]] as const) {
    for (const seat of [state.opener, other(state.opener)]) {
      const speech = speeches[seat];
      if (speech) cards.push({ title: `${label} · ${playerName(state, context, seat)}`, body: speech });
    }
  }
  return cards;
}

export const game: GameDefinition<State> = {
  slug: "counterpoint",
  title: "Counterpoint",
  description: "Make a case, answer your opponent, and predict which judging lens they used.",
  minimumPlayers: 2,
  maximumPlayers: 2,
  instructions: [
    "You get assigned the For or Against position. Use the short prep time to decide what you’ll argue.",
    "Take turns writing one argument and one rebuttal. Then privately choose the lens your case used and predict your opponent’s lens.",
    "Earn one point for declaring the featured lens after submitting both speeches, and one for a correct prediction. More points win the round. Tied rounds earn neither player a win.",
    "The opening side alternates. First to three round wins takes the match, or whoever leads after five rounds. Equal wins after five is a draw.",
  ],

  create(context) {
    if (context.players.length !== 2 || context.players[0].id === context.players[1].id) {
      throw new Error("Counterpoint needs exactly two players.");
    }
    if (context.actorId !== context.hostId) throw new Error("Only the host can start the match.");
    const players: Pair<string> = [context.players[0].id, context.players[1].id];
    seatFor({ players }, context.actorId);
    return startRound(players, deck(), 1, [0, 0], context.now);
  },

  act(state, context, action) {
    const seat = seatFor(state, context.actorId);
    const is = (verb: string) => action.id === actionId(state, verb);
    if (state.phase === "complete") throw new Error("This match has ended.");
    if (state.phase === "reveal") {
      if (!is("next")) throw new Error("That move belongs to a different step.");
      return startRound(state.players, state.queue, state.round + 1, state.wins, context.now);
    }
    if (is("timeout")) {
      if (!expired(state, context.now)) throw new Error("Time remains for this step.");
      if (state.phase === "prep") return enter(state, "argument", context.now);
      if (state.phase === "prediction") return resolve(state);
      return finishSpeech(state, null, context.now);
    }
    if (expired(state, context.now)) throw new Error("Time is up. Continue to the next step.");

    if (state.phase === "prep" && is("ready")) {
      if (state.ready[seat]) throw new Error("You are already ready.");
      const ready = put(state.ready, seat, true);
      const next = { ...state, ready };
      return ready.every(Boolean) ? enter(next, "argument", context.now) : next;
    }
    if ((state.phase === "argument" || state.phase === "rebuttal") && (is("speak") || is("pass"))) {
      if (seat !== state.speaker) throw new Error("Wait for your turn to speak.");
      if (is("pass")) return finishSpeech(state, null, context.now);
      const speech = action.values.text?.trim();
      if (!speech || [...speech].length > speechLimit) {
        throw new Error(`Write between 1 and ${speechLimit} characters.`);
      }
      return finishSpeech(state, speech, context.now);
    }
    if (state.phase === "prediction" && is("lock")) {
      if (state.ballots[seat]) throw new Error("You already locked your prediction.");
      const ballot = { emphasis: readLens(action.values.emphasis), guess: readLens(action.values.guess) };
      const ballots = put(state.ballots, seat, ballot);
      const next = { ...state, ballots };
      return ballots.every(Boolean) ? resolve(next) : next;
    }
    throw new Error("That move belongs to a different step.");
  },

  view(state, context): GameView {
    const seat = seatFor(state, context.actorId);
    const prompt = activePrompt(state);
    const actorSide = seat === state.opener ? "For" : "Against";
    const cards: DisplayCard[] = [
      { title: "The claim", body: prompt.claim, items: [`Featured lens: ${lenses[prompt.lens]}`] },
      ...speechCards(state, context),
    ];
    const base = {
      phase: state.phase,
      round: `Round ${state.round} of ${roundsPerMatch}`,
      deadline: state.deadline ?? undefined,
      standings: ([0, 1] as const).map((index) => ({ label: playerName(state, context, index), score: state.wins[index] })),
      cards,
    };

    if (state.result) {
      const finished = state.phase === "complete";
      const { winner, points } = state.result;
      const roundVerdict = winner === null ? "The round is tied." : `${playerName(state, context, winner)} wins the round.`;
      const matchLeader = state.wins[0] === state.wins[1] ? null : state.wins[0] > state.wins[1] ? 0 : 1;
      const heading = !finished ? "Round result" : matchLeader === null ? "Match drawn"
        : `${playerName(state, context, matchLeader)} wins the match`;
      return {
        ...base, heading, detail: roundVerdict, finished,
        cards: [
          ...cards,
          ...([0, 1] as const).map((index) => {
            const ballot = state.ballots[index];
            const playedBoth = Boolean(state.arguments[index] && state.rebuttals[index]);
            return {
              title: `${playerName(state, context, index)} · ${points[index]} point${points[index] === 1 ? "" : "s"}`,
              items: ballot ? [
                `Declared lens: ${lenses[ballot.emphasis]}${playedBoth && ballot.emphasis === prompt.lens ? " (+1)" : ""}`,
                `Predicted opponent: ${lenses[ballot.guess]}${ballot.guess === state.ballots[other(index)]?.emphasis ? " (+1)" : ""}`,
              ] : ["No prediction submitted"],
            };
          }),
        ],
        controls: finished ? [] : [control(state, "next", "Next claim")],
      };
    }

    const ownBallot = state.ballots[seat];
    const privateCards: DisplayCard[] | undefined = ownBallot ? [{
      title: "Your locked choices",
      items: [`Declared lens: ${lenses[ownBallot.emphasis]}`, `Predicted opponent: ${lenses[ownBallot.guess]}`],
    }] : undefined;
    if (expired(state, context.now)) {
      return { ...base, heading: "Time is up", detail: "Either player can continue.",
        privateCards, controls: [control(state, "timeout", "Continue")] };
    }
    if (state.phase === "prep") {
      return {
        ...base, heading: "Prepare your case",
        detail: `You’re arguing ${actorSide.toLowerCase()} the claim. The For side opens.`,
        controls: state.ready[seat] ? [] : [control(state, "ready", "Ready to debate")],
        privateCards: state.ready[seat] ? [{ title: "Ready", body: "Waiting for your opponent." }] : undefined,
      };
    }
    if (state.phase === "argument" || state.phase === "rebuttal") {
      const label = state.phase === "argument" ? "argument" : "rebuttal";
      const active = state.speaker === seat;
      return {
        ...base, heading: active ? `Write your ${label}` : `${playerName(state, context, state.speaker)} is writing`,
        detail: `You’re arguing ${actorSide.toLowerCase()} the claim.`,
        controls: active ? [
          control(state, "speak", `Submit ${label}`, [
            { name: "text", label: `Your ${label}`, type: "textarea", maxLength: speechLimit },
          ]),
          control(state, "pass", "Pass this turn"),
        ] : [],
      };
    }
    return {
      ...base, heading: ownBallot ? "Prediction locked" : "Read your opponent",
      detail: ownBallot ? "Waiting for your opponent." : "Choose the lens you used and predict the lens they used.",
      privateCards,
      controls: ownBallot ? [] : [control(state, "lock", "Lock choices", [
        { name: "emphasis", label: "Lens I used", type: "select", options: lensOptions },
        { name: "guess", label: "Lens I expect from my opponent", type: "select", options: lensOptions },
      ])],
    };
  },
};
