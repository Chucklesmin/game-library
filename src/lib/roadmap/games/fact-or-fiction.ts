import { randomInt, randomUUID } from "node:crypto";
import type { GameAction, GameContext, GameControl, GameDefinition, GameView } from "../contract.ts";

type Source = { label: string; href: string; reviewedOn: string };
type Fact = {
  id: string;
  category: string;
  rating: "General";
  statement: string;
  truth: boolean;
  explanation: string;
  source: Source;
};

function source(label: string, href: string): Source {
  return { label, href, reviewedOn: "2026-11-26" };
}

const mars = source("NASA Science · Mars facts", "https://science.nasa.gov/mars/facts/");
const mercury = source("NASA Science · Mercury facts", "https://science.nasa.gov/mercury/facts/");
const grandCanyon = source("National Park Service · Grand Canyon geology", "https://www.nps.gov/grca/learn/nature/grca-geology.htm");
const constitution = source("National Archives · How the Constitution happened", "https://www.archives.gov/founding-docs/constitution/how-did-it-happen");
const ocean = source("NOAA · How much water is in the ocean?", "https://oceanservice.noaa.gov/facts/oceanwater.html");
const temperature = source("NIST · Temperature conversions", "https://www.nist.gov/pml/owm/si-units-temperature");
const statue = source("National Park Service · Statue of Liberty facts", "https://www.nps.gov/stli/learn/statue-of-liberty-facts.htm");
const web = source("CERN · A short history of the Web", "https://home.cern/science/computing/the-birth-of-the-web/short-history-web/");

export const factPack: readonly Fact[] = [
  {
    id: "venus-spin", category: "Space", rating: "General", truth: true,
    statement: "Venus takes longer to spin once on its axis than to go around the Sun.",
    explanation: "A full rotation takes roughly 243 Earth days. An orbit around the Sun takes about 225.",
    source: source("NASA Science · Venus facts", "https://science.nasa.gov/venus/venus-facts/"),
  },
  {
    id: "uranus-moons", category: "Space", rating: "General", truth: true,
    statement: "Some of Uranus’s moons are named for characters in Shakespeare’s works.",
    explanation: "The names draw on characters created by William Shakespeare and the poet Alexander Pope.",
    source: source("NASA Science · Uranus facts", "https://science.nasa.gov/uranus/facts/"),
  },
  {
    id: "sound-water", category: "Oceans", rating: "General", truth: true,
    statement: "Under typical conditions, sound moves more than four times as fast in seawater as it does in air.",
    explanation: "NOAA gives representative speeds of about 1,500 meters per second in water and 340 in air.",
    source: source("NOAA · How far does sound travel in the ocean?", "https://oceanservice.noaa.gov/facts/sound.html"),
  },
  {
    id: "canyon-rim", category: "Earth", rating: "General", truth: true,
    statement: "The limestone that caps the Grand Canyon once formed on a seafloor.",
    explanation: "The Kaibab Limestone formed in the sea. Later uplift raised the rock that now makes up the canyon rim.",
    source: grandCanyon,
  },
  {
    id: "minus-forty", category: "Everyday science", rating: "General", truth: true,
    statement: "A temperature of minus 40 reads the same on the Fahrenheit and Celsius scales.",
    explanation: "The exact conversion is °F = 1.8 × °C + 32. Substituting −40 for °C also gives −40 °F.",
    source: temperature,
  },
  {
    id: "octopus-hatchling", category: "Wildlife", rating: "General", truth: true,
    statement: "A giant Pacific octopus starts out in an egg about the size of a grain of rice.",
    explanation: "A newly hatched giant Pacific octopus is only a little over a quarter of an inch long.",
    source: source("Monterey Bay Aquarium · Giant Pacific octopus", "https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/giant-pacific-octopus"),
  },
  {
    id: "liberty-delivery", category: "History", rating: "General", truth: true,
    statement: "The Statue of Liberty was taken apart in France before being sent to New York.",
    explanation: "It was built in France, shipped in pieces in 1885, and reassembled on its pedestal.",
    source: statue,
  },
  {
    id: "web-laboratory", category: "Technology", rating: "General", truth: true,
    statement: "The first website ran on a computer at a particle physics laboratory.",
    explanation: "Tim Berners-Lee hosted the first website on a NeXT computer at CERN.",
    source: web,
  },
  {
    id: "mars-rings", category: "Space", rating: "General", truth: false,
    statement: "A permanent ring of dust surrounds Mars today.",
    explanation: "Mars currently has no rings. Its moon Phobos may eventually break apart, potentially leaving a dusty ring.",
    source: mars,
  },
  {
    id: "mercury-hottest", category: "Space", rating: "General", truth: false,
    statement: "Mercury is the hottest planet in the solar system.",
    explanation: "Venus is hotter because its thick atmosphere traps heat. Mercury is the planet nearest to the Sun.",
    source: mercury,
  },
  {
    id: "ocean-fraction", category: "Oceans", rating: "General", truth: false,
    statement: "Most of the water on Earth is frozen in glaciers and ice caps.",
    explanation: "About 97% of Earth’s water is in the ocean. Roughly 2% is frozen in glaciers and ice caps.",
    source: ocean,
  },
  {
    id: "ratification-all", category: "History", rating: "General", truth: false,
    statement: "The U.S. Constitution needed all 13 original states to ratify it before it could take effect.",
    explanation: "Ratification by nine states was enough to enact the new government.",
    source: constitution,
  },
  {
    id: "degrees-equal", category: "Everyday science", rating: "General", truth: false,
    statement: "An increase of one degree Celsius is the same size as an increase of one degree Fahrenheit.",
    explanation: "A rise of 1 °C equals a rise of 1.8 °F. The scales divide up the same temperature range differently.",
    source: temperature,
  },
  {
    id: "liberty-date", category: "History", rating: "General", truth: false,
    statement: "The Statue of Liberty was officially dedicated on the Fourth of July.",
    explanation: "Its tablet bears the date July 4, 1776. The dedication took place on October 28, 1886.",
    source: statue,
  },
  {
    id: "yellowstone-color", category: "Earth", rating: "General", truth: false,
    statement: "All the rings of color around Yellowstone’s hot springs come from minerals.",
    explanation: "Many color bands come from microorganisms. Different groups thrive in different temperature ranges around the springs.",
    source: source("National Park Service · Yellowstone hydrothermal features", "https://www.nps.gov/yell/learn/nature/hydrothermal-features.htm"),
  },
  {
    id: "web-first-us", category: "Technology", rating: "General", truth: false,
    statement: "The world’s first web server was in the United States.",
    explanation: "The first server ran at CERN in Europe. The first one in the United States came online at SLAC in December 1991.",
    source: web,
  },
];


type Confidence = "steady" | "bold";
type Ballot = { verdict: boolean; confidence: Confidence };
type State = {
  id: string;
  playerIds: string[];
  hostId: string;
  deck: number[];
  reader: number;
  round: number;
  deadline: number;
  phase: "choice" | "reveal" | "complete";
  ballots: Record<string, Ballot>;
  scores: Record<string, number>;
};

const roundCount = 5;
const decisionTime = 35_000;
const minimumPlayers = 2;
const maximumPlayers = 10;

function chooseDeck() {
  const categories = new Set<string>();
  return Array.from({ length: roundCount }, () => {
    const candidates = factPack.flatMap((fact, index) => categories.has(fact.category) ? [] : [index]);
    const selected = candidates[randomInt(candidates.length)];
    categories.add(factPack[selected].category);
    return selected;
  });
}

function requirePlayer(state: State, context: GameContext) {
  if (!state.playerIds.includes(context.actorId) || !context.players.some(({ id }) => id === context.actorId)) {
    throw new Error("Only a player in this match can open it.");
  }
}

function currentFact(state: State) {
  return factPack[state.deck[state.round]];
}

function actionId(state: State, action: string) {
  return `${action}-${state.id}-${state.round}`;
}

function parseBallot({ verdict, confidence }: GameAction["values"]): Ballot {
  if ((verdict !== "fact" && verdict !== "fiction") || (confidence !== "steady" && confidence !== "bold")) {
    throw new Error("Choose Fact or Fiction and set your confidence.");
  }
  return { verdict: verdict === "fact", confidence };
}

function roundScore(ballot: Ballot | undefined, truth: boolean) {
  if (!ballot) return 0;
  const correct = ballot.verdict === truth;
  if (ballot.confidence === "bold") return correct ? 3 : -2;
  return correct ? 1 : 0;
}

function finishRound(state: State): State {
  const { truth } = currentFact(state);
  const scores = Object.fromEntries(state.playerIds.map((id) => [
    id, state.scores[id] + roundScore(state.ballots[id], truth),
  ]));
  return { ...state, phase: state.round === roundCount - 1 ? "complete" : "reveal", scores };
}

function lockControl(state: State): GameControl {
  return {
    id: actionId(state, "lock"),
    label: "Lock verdict",
    fields: [
      { name: "verdict", label: "Your verdict", type: "select", options: [
        { value: "fact", label: "Fact" }, { value: "fiction", label: "Fiction" },
      ] },
      { name: "confidence", label: "Confidence", type: "select", options: [
        { value: "steady", label: "Steady (+1 if right, 0 if wrong)" },
        { value: "bold", label: "Bold (+3 if right, −2 if wrong)" },
      ] },
    ],
  };
}

function verdictText(verdict: boolean) {
  return verdict ? "Fact" : "Fiction";
}

function scoreText(score: number) {
  return score > 0 ? `+${score}` : String(score);
}

export const game: GameDefinition<State> = {
  slug: "fact-or-fiction",
  title: "Fact or Fiction",
  description: "Decide what’s true, then bet how sure you are before the room reveals the answer.",
  minimumPlayers,
  maximumPlayers,
  instructions: [
    "Read the statement, then privately choose Fact or Fiction and your confidence.",
    "Steady earns 1 if correct and 0 if wrong. Bold earns 3 if correct and loses 2 if wrong.",
    "The answer appears once everyone locks a verdict or a player reveals after the 35-second deadline.",
    "Play five statements. The highest total wins, with tied players sharing the place.",
  ],
  create(context) {
    const playerIds = context.players.map(({ id }) => id);
    if (context.actorId !== context.hostId || !playerIds.includes(context.hostId)) {
      throw new Error("Only the room host can start Fact or Fiction.");
    }
    if (playerIds.length < minimumPlayers || playerIds.length > maximumPlayers || new Set(playerIds).size !== playerIds.length) {
      throw new Error("Fact or Fiction needs 2–10 players.");
    }
    return {
      id: randomUUID(),
      playerIds,
      hostId: context.hostId,
      deck: chooseDeck(),
      reader: playerIds.indexOf(context.hostId),
      round: 0,
      phase: "choice",
      deadline: context.now + decisionTime,
      ballots: {},
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
    };
  },
  act(state, context, action) {
    requirePlayer(state, context);
    if (state.phase === "choice") {
      if (action.id === actionId(state, "close")) {
        if (context.now < state.deadline) throw new Error("The verdict timer has not ended.");
        return finishRound(state);
      }
      if (action.id === actionId(state, "lock")) {
        if (context.now >= state.deadline) throw new Error("Verdicts are closed for this statement.");
        if (Object.hasOwn(state.ballots, context.actorId)) throw new Error("Your verdict is already locked.");
        const ballots = { ...state.ballots, [context.actorId]: parseBallot(action.values) };
        const next = { ...state, ballots };
        return Object.keys(ballots).length === state.playerIds.length ? finishRound(next) : next;
      }
    }
    if (state.phase === "reveal" && action.id === actionId(state, "next")) {
      if (context.actorId !== state.hostId) throw new Error("Only the host can read the next statement.");
      return {
        ...state,
        phase: "choice",
        round: state.round + 1,
        reader: (state.reader + 1) % state.playerIds.length,
        deadline: context.now + decisionTime,
        ballots: {},
      };
    }
    throw new Error("That action is unavailable for the current statement.");
  },
  view(state, context): GameView {
    requirePlayer(state, context);
    const fact = currentFact(state);
    const playerName = (id: string) => context.players.find((player) => player.id === id)?.name ?? "Player";
    const standings = state.playerIds.map((id) => ({ id, label: playerName(id), score: state.scores[id] }))
      .sort((left, right) => right.score - left.score);
    const shared = {
      phase: state.phase,
      round: `Round ${state.round + 1} of ${roundCount}`,
      standings: standings.map(({ label, score }) => ({ label, score })),
    };
    if (state.phase === "choice") {
      const locked = Object.hasOwn(state.ballots, context.actorId);
      const expired = context.now >= state.deadline;
      const reader = state.playerIds[state.reader];
      const title = reader === context.actorId ? "You’re the reader" : `${playerName(reader)} is the reader`;
      const ballot = locked ? state.ballots[context.actorId] : undefined;
      return {
        ...shared,
        heading: fact.statement,
        detail: expired ? "Time’s up. Reveal the answer to score the round."
          : locked ? "Verdict locked. Waiting for the room." : `${title}. Lock your verdict privately.`,
        deadline: state.deadline,
        cards: [{ title: "Topic", body: fact.category }],
        privateCards: ballot ? [{
          title: "Your locked verdict",
          body: `${verdictText(ballot.verdict)} · ${ballot.confidence === "bold" ? "Bold" : "Steady"}`,
        }] : undefined,
        controls: expired ? [{ id: actionId(state, "close"), label: "Reveal the answer" }] : locked ? [] : [lockControl(state)],
      };
    }
    const complete = state.phase === "complete";
    const ballot = Object.hasOwn(state.ballots, context.actorId) ? state.ballots[context.actorId] : undefined;
    const points = roundScore(ballot, fact.truth);
    const personalResult = ballot
      ? `${ballot.verdict === fact.truth ? "Correct" : "Incorrect"} verdict with ${ballot.confidence === "bold" ? "Bold" : "Steady"} confidence.`
      : "You left this statement unanswered.";
    const leaders = standings.filter(({ score }) => score === standings[0].score).map(({ label }) => label);
    const cards = [
      {
        title: `${verdictText(fact.truth)} · ${fact.category}`,
        body: fact.explanation,
        link: { label: fact.source.label, href: fact.source.href },
        items: [`Source reviewed ${fact.source.reviewedOn}`],
      },
      {
        title: "Round scores",
        items: state.playerIds.map((id) => {
          const ballot = state.ballots[id];
          if (!ballot) return `${playerName(id)} · No verdict · 0`;
          const confidence = ballot.confidence === "bold" ? "Bold" : "Steady";
          return `${playerName(id)} · ${verdictText(ballot.verdict)} · ${confidence} · ${scoreText(roundScore(ballot, fact.truth))}`;
        }),
      },
    ];
    return {
      ...shared,
      heading: complete ? "Final standings" : verdictText(fact.truth),
      detail: complete ? (leaders.length === 1 ? `${leaders[0]} wins.` : `${leaders.join(", ")} share first place.`)
        : fact.statement,
      privateCards: [{ title: "Your round score", body: `${scoreText(points)} ${Math.abs(points) === 1 ? "point" : "points"}. ${personalResult}` }],
      cards: complete ? [{ title: "Final statement", body: fact.statement }, ...cards] : cards,
      controls: !complete && context.actorId === state.hostId ? [{ id: actionId(state, "next"), label: "Next statement" }] : [],
      finished: complete,
    };
  },
};
