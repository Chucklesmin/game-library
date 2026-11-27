import { randomInt } from "node:crypto";
import type { GameControl, GameDefinition, GameView, Player } from "../contract.ts";

const TARGET_SCORE = 3;
const MAX_ROUNDS = TARGET_SCORE * 2 - 1;

const scenarios = [
  { title: "Midnight post office", description: "Two unmarked mailbags arrived after closing. Count the genuine silver stamps.", item: "silver stamp" },
  { title: "The lantern festival", description: "Two bundles of paper lanterns passed through a windy courtyard. Count the lanterns that still glow.", item: "lit lantern" },
  { title: "The seaside archive", description: "Two tins of beach finds are headed for a museum display. Count the pieces of cobalt sea glass.", item: "piece of cobalt sea glass", plural: "pieces of cobalt sea glass" },
  { title: "Rooftop harvest", description: "Two baskets from the rooftop garden are ready for market. Count the striped tomatoes.", item: "striped tomato", plural: "striped tomatoes" },
  { title: "The pin shop", description: "Two trays from an artist's studio are ready for inspection. Count the enamel moth pins.", item: "moth pin" },
  { title: "The rainy-day arcade", description: "Two envelopes from a high-score tournament await the prize judge. Count the golden tokens.", item: "golden token" },
  { title: "Early train to Juniper", description: "Two sample boxes from the platform bakery reached the dining car. Count the cardamom buns.", item: "cardamom bun" },
  { title: "Cubbyhole cinema", description: "Two envelopes at the ticket booth contain hand-numbered keepsakes. Count the violet tickets.", item: "violet ticket" },
] satisfies { title: string; description: string; item: string; plural?: string }[];

type Scenario = (typeof scenarios)[number];
type Seat = 0 | 1;
type Pair<T> = [T, T];
type Claim = { seat: Seat; rank: number };
type Reveal = { challengedBy: Seat; winner: Seat; claim: Claim; total: number; wasBluff: boolean };
type State = {
  players: Pair<string>;
  order: number[];
  round: number;
  opener: Seat;
  turn: Seat;
  hands: Pair<number[]>;
  counts: Pair<number>;
  claims: Claim[];
  scores: Pair<number>;
  reveal: Reveal | null;
};

function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function deal() {
  const deck = shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
  return {
    hands: [deck.slice(0, 4).sort((a, b) => a - b), deck.slice(4).sort((a, b) => a - b)] as Pair<number[]>,
    counts: [randomInt(5), randomInt(5)] as Pair<number>,
  };
}

function playerSeat(state: State, actorId: string): Seat {
  const seat = state.players.indexOf(actorId);
  if (seat !== 0 && seat !== 1) throw new Error("Only the two players in this duel can act.");
  return seat;
}

function nameFor(players: readonly Player[], state: State, seat: Seat) {
  return players.find(({ id }) => id === state.players[seat])?.name ?? "Player";
}

const otherSeat = (seat: Seat): Seat => seat === 0 ? 1 : 0;
const finished = ({ scores }: State) => scores.some((score) => score >= TARGET_SCORE);
const sceneFor = ({ order, round }: State) => scenarios[order[round - 1]];
const actionId = (state: State, verb: string) => `${verb}-${state.round}-${state.claims.length}`;

function describeCount(scenario: Scenario, rank: number) {
  const plural = "plural" in scenario ? scenario.plural : `${scenario.item}s`;
  return `${rank} ${rank === 1 ? scenario.item : plural}`;
}

const describeClaim = (scenario: Scenario, rank: number) => `At least ${describeCount(scenario, rank)}`;

function playControls(state: State, seat: Seat, scenario: Scenario): GameControl[] {
  if (state.reveal) {
    return finished(state) ? [] : [{ id: actionId(state, "next"), label: "Open the next parcels" }];
  }
  if (state.turn !== seat) return [];

  const prior = state.claims.at(-1);
  const choices = state.hands[seat].filter((rank) => rank > (prior?.rank ?? 0));
  const controls: GameControl[] = [];
  if (choices.length) {
    controls.push({
      id: actionId(state, "claim"),
      label: prior ? "Play a higher counterclaim" : "Make a claim",
      fields: [{
        name: "rank", label: "Claim card", type: "select",
        options: choices.map((rank) => ({ value: String(rank), label: describeClaim(scenario, rank) })),
      }],
    });
  }
  if (prior) controls.push({ id: actionId(state, "challenge"), label: "Challenge the claim" });
  return controls;
}

export const game: GameDefinition<State> = {
  slug: "double-bluff",
  title: "Double Bluff",
  description: "Inspect one parcel, play a claim card, and decide when your opponent is bluffing.",
  minimumPlayers: 2,
  maximumPlayers: 2,
  instructions: [
    "Inspect one of two matching parcels. Your count and four claim cards are private. The two parcels together can contain up to eight matching items.",
    "Play a card to claim at least that many matching items in both parcels combined. Your opponent can play a higher card or challenge your claim.",
    "A false claim awards the challenger one point. A true claim awards the claimant one point.",
    "Inspect fresh parcels each round and alternate who starts. First to three points wins.",
  ],
  create(context) {
    if (context.players.length !== 2 || context.players[0].id === context.players[1].id) {
      throw new Error("Double Bluff requires exactly two different players.");
    }
    const players: Pair<string> = [context.players[0].id, context.players[1].id];
    if (!players.includes(context.actorId)) throw new Error("Join this duel to play.");
    return {
      ...deal(),
      players,
      order: shuffle(scenarios.map((_, index) => index)).slice(0, MAX_ROUNDS),
      round: 1,
      opener: 0,
      turn: 0,
      claims: [],
      scores: [0, 0],
      reveal: null,
    };
  },
  act(state, context, action) {
    const seat = playerSeat(state, context.actorId);
    if (state.reveal) {
      if (finished(state) || action.id !== actionId(state, "next")) throw new Error("That round is closed.");
      const opener = otherSeat(state.opener);
      return { ...state, ...deal(), round: state.round + 1, opener, turn: opener, claims: [], reveal: null };
    }
    if (state.turn !== seat) throw new Error("Wait for your opponent to act.");

    const prior = state.claims.at(-1);
    if (action.id === actionId(state, "claim")) {
      const rawRank = action.values.rank;
      const rank = Number(rawRank);
      if (!/^[1-8]$/.test(rawRank ?? "") || !state.hands[seat].includes(rank) || rank <= (prior?.rank ?? 0)) {
        throw new Error("Play a held card that is higher than the previous claim.");
      }
      const hands: Pair<number[]> = [...state.hands];
      hands[seat] = state.hands[seat].filter((card) => card !== rank);
      return { ...state, hands, turn: otherSeat(seat), claims: [...state.claims, { seat, rank }] };
    }

    if (action.id === actionId(state, "challenge") && prior) {
      const total = state.counts[0] + state.counts[1];
      const wasBluff = prior.rank > total;
      const winner = wasBluff ? seat : prior.seat;
      const scores: Pair<number> = [...state.scores];
      scores[winner] += 1;
      return { ...state, scores, reveal: { challengedBy: seat, winner, claim: prior, total, wasBluff } };
    }

    throw new Error("That action is unavailable in the current turn.");
  },
  view(state, context): GameView {
    const seat = playerSeat(state, context.actorId);
    const scenario = sceneFor(state);
    const prior = state.claims.at(-1);
    const name = (id: Seat) => nameFor(context.players, state, id);
    const shared: GameView = {
      phase: state.reveal ? (finished(state) ? "complete" : "reveal") : "claiming",
      heading: state.turn === seat ? (prior ? "Counter or challenge" : "Make the opening claim") : `Waiting for ${name(state.turn)}`,
      round: `Round ${state.round} · First to ${TARGET_SCORE} points`,
      cards: [
        { title: scenario.title, body: scenario.description },
        ...(prior && !state.reveal ? [{
          title: "Claims on the table",
          items: state.claims.map((claim) => `${name(claim.seat)} · ${describeClaim(scenario, claim.rank)}`),
        }] : []),
      ],
      standings: state.players.map((_, index) => {
        const id = index === 0 ? 0 : 1;
        return { label: name(id), score: state.scores[id] };
      }).sort((a, b) => b.score - a.score),
      controls: playControls(state, seat, scenario),
    };

    if (state.reveal) {
      const result = state.reveal;
      const verdict = result.wasBluff ? "Bluff called" : "Claim stands";
      const winner = name(result.winner);
      return {
        ...shared,
        heading: finished(state) ? `${winner} wins the duel` : verdict,
        detail: `${name(result.challengedBy)} challenged the last claim. ${verdict}. ${winner} scores one point.`,
        cards: [...(shared.cards ?? []), {
          title: "Claim history",
          items: [
            ...state.claims.map((claim, index) => {
              const move = index === 0 ? "opened with" : "countered with";
              return `${index + 1}. ${name(claim.seat)} ${move}: ${describeClaim(scenario, claim.rank)}`;
            }),
            `${state.claims.length + 1}. ${name(result.challengedBy)} challenged`,
          ],
        }, {
          title: "Parcel inspection",
          body: `${describeClaim(scenario, result.claim.rank)} claimed · ${describeCount(scenario, result.total)} found`,
          items: [
            `${name(0)} opened ${describeCount(scenario, state.counts[0])}`,
            `${name(1)} opened ${describeCount(scenario, state.counts[1])}`,
          ],
        }],
        finished: finished(state),
      };
    }

    const onlyChallenge = state.turn === seat && shared.controls.length === 1 && !!prior;
    return {
      ...shared,
      detail: onlyChallenge ? "You have no higher card. Challenge to open both parcels." : undefined,
      privateCards: [
        { title: "Your parcel", body: `${describeCount(scenario, state.counts[seat])}. Use it to estimate the combined count.` },
        {
          title: "Your claim cards",
          body: state.hands[seat].length ? undefined : "You have played every card.",
          items: state.hands[seat].map((rank) => describeClaim(scenario, rank)),
        },
      ],
    };
  },
};
