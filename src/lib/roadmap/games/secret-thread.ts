import { randomInt, randomUUID } from "node:crypto";
import type { GameAction, GameContext, GameControl, GameDefinition, GameView } from "../contract.ts";

type Puzzle = {
  answer: string;
  explanation: string;
  pairs: readonly (readonly [string, string])[];
};

const PUZZLES: readonly Puzzle[] = [
  {
    answer: "Bridge",
    explanation: "A bridge can span water, link song sections, support the strings on a violin, or replace missing teeth.",
    pairs: [
      ["A detour ends when a river crossing reopens.", "A song changes direction before returning to its chorus."],
      ["On a violin, four strings rest on a little wooden arch.", "A dentist joins an artificial tooth to its neighbors."],
      ["The captain steers from an elevated room.", "A card partnership bids for a contract."],
      ["A gymnast arches up from the floor.", "A narrow passage can join two buildings above the street."],
      ["The span must leave room for boats to pass underneath.", "A paragraph can link two otherwise separate ideas."],
      ["Spectacles rest across this part of your nose.", "A small piece of hardware joins network segments."],
      ["An extra loan covers the gap before long-term funding arrives.", "Two city neighborhoods meet above railroad tracks."],
      ["A plank crossing turns hikers into single-file travelers.", "A songwriter sometimes calls the contrasting section the middle eight."],
    ],
  },
  {
    answer: "Shell",
    explanation: "A shell can house a snail, protect an egg, or provide the interface where someone types computer commands.",
    pairs: [
      ["A snail carries its own shelter.", "Breakfast starts with a crack."],
      ["A terminal waits for your next typed command.", "A crab has to molt to grow."],
      ["A hermit crab moves into someone else's old home.", "A baked pastry case is ready for its filling."],
      ["A nutcracker opens a hard outer cover.", "Macaroni can be shaped like a small curved cup."],
      ["A fossil can preserve the outline of an ancient mollusk.", "An empty building still has an exterior."],
      ["A scallop valve may wash up on a beach.", "In chemistry, electrons are grouped around a nucleus in layers."],
      ["A taco's crisp folded casing holds the filling.", "A protective jacket can block wind without providing insulation."],
      ["A chocolate coating breaks when you tap the dessert.", "A company can legally exist with almost no operations."],
    ],
  },
  {
    answer: "Spring",
    explanation: "Spring is a season, a source of groundwater, and a component that can return to shape after compression.",
    pairs: [
      ["Cherry blossoms arrive before summer heat.", "A pen clicks when a coiled part compresses."],
      ["Water emerges naturally from underground.", "An unused trap snaps back after the latch releases."],
      ["Snow melts and the first crocuses appear.", "A mattress gives when you sit and bounces back when you stand."],
      ["Mineral-rich water bubbles up at a spa.", "A dancer leaps suddenly from a crouch."],
      ["A clothespin holds laundry because a coil presses its arms together.", "A bear finally leaves its winter den."],
      ["A clockmaker winds a flat strip to store mechanical energy.", "A hiker refills their bottle where water seeps from rock."],
      ["An equinox starts this season in one hemisphere.", "A loose sofa cushion lets you feel a coil beneath it."],
      ["A little push sends a jack-in-the-box into the air.", "A farmer watches for the last frost before planting."],
    ],
  },
  {
    answer: "Current",
    explanation: "Current can be moving water, the flow of electrical charge, or something that applies at the present time.",
    pairs: [
      ["A swimmer notices the river carrying them sideways.", "A multimeter reads amperes."],
      ["Yesterday’s schedule has been replaced by the one in effect now.", "The Gulf Stream moves warm water across an ocean."],
      ["Closing the circuit lets charge flow.", "A breaking-news desk covers affairs happening right now."],
      ["A diver watches little particles drift in one direction.", "A fuse opens when too much charge flows per second."],
      ["The homepage lists the prices that apply today.", "A strong undertow surprises a beachgoer."],
      ["A conductor completes a path back to the power source.", "Your train platform may change from the one in an old screenshot."],
      ["A weather map traces moving air with arrows.", "The latest edition replaces an obsolete manual."],
      ["A river bend can sweep a canoe toward its outer bank.", "A battery supplies direct flow instead of alternation."],
    ],
  },
  {
    answer: "Draft",
    explanation: "A draft can be an early version of writing, a flow of cool air, or a selection process used by sports leagues.",
    pairs: [
      ["An editor marks up a rough first version.", "A gap under the door lets cool air through."],
      ["A team claims a player with the first pick.", "A writer moves paragraphs around before publishing."],
      ["Air leaking around a window makes a candle flicker.", "A bartender pulls a handle to dispense beer from a keg."],
      ["A message sits in the outbox editor before it is sent.", "Ships with deep hulls need more water below the surface."],
      ["A racing driver follows another car to reduce air resistance.", "A league awards selection slots before its season begins."],
      ["A manuscript has a version number and blank sections to fill.", "A chimney depends on upward-moving air."],
      ["A brewer distinguishes a pint poured from a tap from one poured from a bottle.", "An artist's preliminary plans show where the walls will go."],
      ["A strip of weather seal stops a cold flow through the front door.", "A coach scouts prospects before announcing a selection."],
    ],
  },
  {
    answer: "Frame",
    explanation: "A frame can surround a picture, be a single image in a video, or form the supporting structure of a bicycle.",
    pairs: [
      ["A wooden border holds a photograph.", "A paused movie displays one image."],
      ["Pedals, wheels, and handlebars attach to this bicycle structure.", "A bowling scorecard has ten turns of up to two ordinary rolls."],
      ["A comic artist puts a scene inside one outlined panel.", "An optician fits lenses into a pair of rims."],
      ["An architect draws the supporting skeleton of a building.", "A photographer moves a step so a tree fits inside the image edges."],
      ["A filmmaker counts 24 individual images in a second.", "A picture hangs by a wire mounted to its border."],
      ["A story’s setup changes how you interpret the events inside it.", "A welder joins tubes into a bicycle’s main structure."],
      ["A screen capture freezes the exact moment a ball crosses a line.", "In bowling, a strike completes this unit on the first roll, except for possible bonus rolls in the tenth."],
      ["A doorway's surrounding structure holds the hinges.", "A lawyer shapes the question so one interpretation sounds natural."],
    ],
  },
  {
    answer: "Root",
    explanation: "A root can anchor a plant, be a base form of a word, or be a value that solves an equation when the expression equals zero.",
    pairs: [
      ["A plant draws water through fine underground strands.", "The square of 7 is 49, making 7 one answer to an inverse-power question."],
      ["A linguist removes endings to find the word’s base.", "A tree’s support spreads under the pavement."],
      ["A calculator uses a radical sign to show the operation.", "A dentist cleans a canal beneath the tooth’s crown."],
      ["A genealogist looks for where a family line began.", "A quadratic graph crosses the x-axis at a solution."],
      ["The top-level directory contains every other directory under it.", "A carrot is the part of the plant eaten underground."],
      ["A poet hears the same base in two words with different suffixes.", "A gardener loosens the buried part before repotting."],
      ["A postmortem asks for the underlying cause of a failure.", "The value that makes x³ equal 27 is 3."],
      ["A supporter cheers for the home team.", "The account with the broadest privileges on a Unix system."],
    ],
  },
  {
    answer: "Track",
    explanation: "A track can carry a train, define a running course, or be one recording in a playlist.",
    pairs: [
      ["A train follows two steel rails.", "A playlist skips to its next song."],
      ["A runner stays inside a marked lane around an oval.", "A ranger follows impressions left in mud."],
      ["A producer isolates the vocal recording from the instruments.", "A tank rolls on continuous metal treads."],
      ["A courier’s progress can be followed by scanning a parcel.", "A railway switch sends a carriage down a different path."],
      ["A cyclist rides a banked circuit indoors.", "A hunter studies which direction the prints point."],
      ["A stage recording has separate audio layers.", "A sleigh leaves a long mark in new snow."],
      ["A school offers an accelerated route through its classes.", "A project manager follows whether a deadline is still achievable."],
      ["A satellite receiver follows the position of an object over time.", "A numbered list on the album sleeve names each recording."],
    ],
  },
];

const ROUNDS = 5;
const MAX_STRIKES = 3;
const STREAK_GOAL = 3;
const TIME_LIMIT = 90_000;

type State = {
  puzzles: Puzzle[];
  round: number;
  roundId: string;
  phase: "puzzle" | "reveal" | "finished";
  deadline: number;
  wrongGuesses: string[];
  result?: "solved" | "strikes" | "expired";
  streak: number;
  bestStreak: number;
  solves: number;
};

function assertMember(context: GameContext) {
  const seat = context.players.findIndex((player) => player.id === context.actorId);
  if (seat === -1) throw new Error("Join the room to play Secret Thread.");
  return seat;
}

function normalize(answer: string) {
  return answer.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/^(?:a|an|the) /, "");
}

function choosePuzzles() {
  const choices = [...PUZZLES];
  const selected: Puzzle[] = [];
  while (selected.length < ROUNDS) selected.push(choices.splice(randomInt(choices.length), 1)[0]);
  return selected;
}

function finishRound(state: State, result: NonNullable<State["result"]>): State {
  const solved = result === "solved";
  const streak = solved ? state.streak + 1 : 0;
  return {
    ...state,
    phase: "reveal",
    result,
    streak,
    bestStreak: Math.max(streak, state.bestStreak),
    solves: state.solves + Number(solved),
  };
}

function actionId(name: string, state: State) {
  return `${name}:${state.roundId}`;
}

function act(state: State, context: GameContext, action: GameAction): State {
  assertMember(context);
  if (state.phase === "puzzle") {
    if (context.now >= state.deadline) {
      if (action.id !== actionId("reveal", state)) throw new Error("Time is up. Reveal the connection.");
      return finishRound(state, "expired");
    }
    if (action.id !== actionId("guess", state)) throw new Error("Choose an action from this puzzle.");
    const input = action.values.answer;
    if (typeof input !== "string" || input.length > 60) throw new Error("Enter a connection of up to 60 characters.");
    const guess = normalize(input);
    if (!guess) throw new Error("Enter a connection before submitting.");
    const expected = normalize(state.puzzles[state.round].answer);
    if (guess === expected || guess === `${expected}s`) return finishRound(state, "solved");
    if (state.wrongGuesses.includes(guess)) throw new Error("The group already tried that answer.");
    const tried = { ...state, wrongGuesses: [...state.wrongGuesses, guess] };
    return tried.wrongGuesses.length === MAX_STRIKES ? finishRound(tried, "strikes") : tried;
  }

  if (state.phase !== "reveal" || action.id !== actionId("next", state)) {
    throw new Error("This puzzle is no longer accepting moves.");
  }
  if (context.actorId !== context.hostId) throw new Error("Only the host can begin the next puzzle.");
  if (state.round === ROUNDS - 1) return { ...state, phase: "finished" };
  return {
    ...state,
    round: state.round + 1,
    roundId: randomUUID(),
    phase: "puzzle",
    deadline: context.now + TIME_LIMIT,
    wrongGuesses: [],
    result: undefined,
  };
}

function view(state: State, context: GameContext): GameView {
  const seat = assertMember(context);
  const puzzle = state.puzzles[state.round];
  const round = `Puzzle ${state.round + 1} / ${ROUNDS}`;
  const progress = {
    title: "Team progress",
    items: [`${state.streak} in a row`, `${state.bestStreak} best streak`, `${state.solves} solved of ${ROUNDS}`],
  };

  switch (state.phase) {
    case "puzzle": {
      const expired = context.now >= state.deadline;
      const pair = puzzle.pairs[(seat + state.round) % puzzle.pairs.length];
      const controls: GameControl[] = expired
        ? [{ id: actionId("reveal", state), label: "Reveal the connection" }]
        : [{ id: actionId("guess", state), label: "Submit team answer", fields: [
          { name: "answer", label: "Shared connection", type: "text", maxLength: 60 },
        ] }];
      return {
        phase: state.phase,
        round,
        heading: expired ? "Time is up" : "Find the common thread",
        detail: expired ? "Anyone can reveal the answer."
          : "Describe your clues aloud. Agree before one teammate submits an answer.",
        deadline: state.deadline,
        privateCards: [{ title: "Your two clue fragments", items: [...pair] }],
        cards: [{ title: "Strikes left", body: `Remaining: ${MAX_STRIKES - state.wrongGuesses.length} of ${MAX_STRIKES}` }, progress],
        controls,
      };
    }
    case "reveal": {
      const headings = { solved: "Thread found", strikes: "Out of strikes", expired: "Time ran out" };
      return {
        phase: state.phase,
        round,
        heading: headings[state.result ?? "expired"],
        cards: [{ title: puzzle.answer, body: puzzle.explanation }, progress],
        controls: context.actorId === context.hostId
          ? [{ id: actionId("next", state), label: state.round === ROUNDS - 1 ? "See session results" : "Start next puzzle" }]
          : [],
        detail: context.actorId === context.hostId ? undefined : "The host advances when the team is ready.",
      };
    }
    case "finished":
      return {
        phase: state.phase,
        finished: true,
        heading: state.bestStreak >= STREAK_GOAL ? "The team reached its streak goal" : "Session complete",
        detail: `Goal: solve ${STREAK_GOAL} puzzles in a row.`,
        cards: [progress],
        controls: [],
      };
  }
}

export const game: GameDefinition<State> = {
  slug: "secret-thread",
  title: "Secret Thread",
  description: "Trade private clues and find the word that connects them.",
  minimumPlayers: 3,
  maximumPlayers: 8,
  instructions: [
    "Read your two private clues. Describe them aloud while teammates keep their cards on their own screens.",
    "Work together to name the word linking the clues. Agree on a guess, then have one teammate submit it.",
    "You share three strikes and 90 seconds per puzzle. A solve continues your streak. Running out of strikes or time breaks it.",
    "Solve three puzzles in a row across five puzzles to reach the team goal.",
  ],
  create(context) {
    assertMember(context);
    if (context.players.length < 3 || context.players.length > 8) {
      throw new Error("Secret Thread needs 3 to 8 players.");
    }
    return {
      puzzles: choosePuzzles(),
      round: 0,
      roundId: randomUUID(),
      phase: "puzzle",
      deadline: context.now + TIME_LIMIT,
      wrongGuesses: [],
      streak: 0,
      bestStreak: 0,
      solves: 0,
    };
  },
  act,
  view,
};
