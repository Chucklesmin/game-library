import { randomInt, randomUUID } from "node:crypto";
import type { GameAction, GameContext, GameControl, GameDefinition, GameView } from "../contract.ts";

type Puzzle = {
  answer: string;
  explanation: string;
  pairs: readonly (readonly [string, string])[];
};

type AuthoredClue = readonly [fragment: string, connection: string];
type AuthoredPuzzle = Omit<Puzzle, "pairs"> & {
  pairs: readonly (readonly [AuthoredClue, AuthoredClue])[];
};

const PUZZLES: readonly AuthoredPuzzle[] = [
  {
    answer: "Bridge",
    explanation: "A bridge can span water, link song sections, support the strings on a violin, or replace missing teeth.",
    pairs: [
      [
        ["A detour ends when a river crossing reopens.", "A road bridge lets traffic cross the river."],
        ["A song changes direction before returning to its chorus.", "A musical bridge changes the mood or melody between familiar sections."],
      ],
      [
        ["On a violin, four strings rest on a little wooden arch.", "A violin bridge holds the strings above the instrument’s body."],
        ["A dentist joins an artificial tooth to its neighbors.", "A dental bridge holds a replacement tooth between neighboring teeth."],
      ],
      [
        ["The captain steers from an elevated room.", "The bridge is a ship’s command and navigation room."],
        ["A card partnership bids for a contract.", "Contract bridge is a card game where partners bid together."],
      ],
      [
        ["A gymnast arches up from the floor.", "A gymnastics bridge is a backbend supported by hands and feet."],
        ["A narrow passage can join two buildings above the street.", "A skybridge connects buildings above street level."],
      ],
      [
        ["The span must leave room for boats to pass underneath.", "A bridge leaves clearance for boats beneath its span."],
        ["A paragraph can link two otherwise separate ideas.", "A transition can bridge the gap between ideas."],
      ],
      [
        ["Spectacles rest across this part of your nose.", "The nose bridge supports eyeglasses between the lenses."],
        ["A small piece of hardware joins network segments.", "A network bridge connects segments so traffic can pass between them."],
      ],
      [
        ["An extra loan covers the gap before long-term funding arrives.", "A bridge loan covers expenses until longer-term funding arrives."],
        ["Two city neighborhoods meet above railroad tracks.", "An overpass is a bridge that spans the railroad tracks."],
      ],
      [
        ["A plank crossing turns hikers into single-file travelers.", "A footbridge carries hikers over an obstacle."],
        ["A songwriter sometimes calls the contrasting section the middle eight.", "The middle eight often serves as a musical bridge."],
      ],
    ],
  },
  {
    answer: "Shell",
    explanation: "A shell can house a snail, protect an egg, or provide the interface where someone types computer commands.",
    pairs: [
      [
        ["A snail carries its own shelter.", "A snail’s shell protects its soft body."],
        ["Breakfast starts with a crack.", "Cracking the eggshell exposes the egg inside."],
      ],
      [
        ["A terminal waits for your next typed command.", "The shell interprets commands entered in a terminal."],
        ["A crab has to molt to grow.", "A crab sheds its hard outer shell as it grows."],
      ],
      [
        ["A hermit crab moves into someone else's old home.", "A hermit crab finds a discarded shell to live in."],
        ["A baked pastry case is ready for its filling.", "A pastry shell is a baked case for a filling."],
      ],
      [
        ["A nutcracker opens a hard outer cover.", "A nutshell protects the edible kernel."],
        ["Macaroni can be shaped like a small curved cup.", "Shell pasta is named for its curved, hollow shape."],
      ],
      [
        ["A fossil can preserve the outline of an ancient mollusk.", "The shape of a fossilized shell can identify a mollusk."],
        ["An empty building still has an exterior.", "The shell of a building is its outer structure."],
      ],
      [
        ["A scallop valve may wash up on a beach.", "A scallop’s two shell halves are called valves."],
        ["In chemistry, electrons are grouped around a nucleus in layers.", "An electron shell groups electrons by energy level."],
      ],
      [
        ["A taco's crisp folded casing holds the filling.", "A crisp taco shell holds the filling."],
        ["A protective jacket can block wind without providing insulation.", "A shell jacket is a protective outer layer."],
      ],
      [
        ["A chocolate coating breaks when you tap the dessert.", "A hardened chocolate shell covers the dessert."],
        ["A company can legally exist with almost no operations.", "A shell company has little or no active business."],
      ],
    ],
  },
  {
    answer: "Spring",
    explanation: "Spring is a season, a source of groundwater, and a component that can return to shape after compression.",
    pairs: [
      [
        ["Cherry blossoms arrive before summer heat.", "Cherry trees usually bloom in spring."],
        ["A pen clicks when a coiled part compresses.", "A spring inside a retractable pen compresses and releases."],
      ],
      [
        ["Water emerges naturally from underground.", "A spring is a place where groundwater reaches the surface."],
        ["An unused trap snaps back after the latch releases.", "A spring can snap a trap shut when its latch releases."],
      ],
      [
        ["Snow melts and the first crocuses appear.", "Melting snow and early crocuses signal spring."],
        ["A mattress gives when you sit and bounces back when you stand.", "Mattress springs compress under weight and rebound when it lifts."],
      ],
      [
        ["Mineral-rich water bubbles up at a spa.", "A mineral spring brings dissolved minerals to the surface."],
        ["A dancer leaps suddenly from a crouch.", "The dancer springs up by pushing off suddenly."],
      ],
      [
        ["A clothespin holds laundry because a coil presses its arms together.", "A clothespin spring squeezes its two arms together."],
        ["A bear finally leaves its winter den.", "Many bears emerge from their dens in spring."],
      ],
      [
        ["A clockmaker winds a flat strip to store mechanical energy.", "A wound mainspring stores energy to run a mechanical clock."],
        ["A hiker refills their bottle where water seeps from rock.", "Seepage from rock can mark a natural spring."],
      ],
      [
        ["An equinox starts this season in one hemisphere.", "The vernal equinox marks the beginning of astronomical spring."],
        ["A loose sofa cushion lets you feel a coil beneath it.", "The coil under the cushion is a spring."],
      ],
      [
        ["A little push sends a jack-in-the-box into the air.", "A spring pushes the jack-in-the-box figure upward."],
        ["A farmer watches for the last frost before planting.", "The last spring frost helps determine when outdoor planting can start."],
      ],
    ],
  },
  {
    answer: "Current",
    explanation: "Current can be moving water, the flow of electrical charge, or something that applies at the present time.",
    pairs: [
      [
        ["A swimmer notices the river carrying them sideways.", "A river current carries the swimmer downstream or sideways."],
        ["A multimeter reads amperes.", "Amperes are the units of electric current."],
      ],
      [
        ["Yesterday’s schedule has been replaced by the one in effect now.", "The schedule in effect now is the current one."],
        ["The Gulf Stream moves warm water across an ocean.", "The Gulf Stream is a warm ocean current."],
      ],
      [
        ["Closing the circuit lets charge flow.", "A closed circuit gives electric current a path to flow."],
        ["A breaking-news desk covers affairs happening right now.", "Current affairs are events happening around the present time."],
      ],
      [
        ["A diver watches little particles drift in one direction.", "Drifting particles show the direction of an underwater current."],
        ["A fuse opens when too much charge flows per second.", "A fuse interrupts electric current when it exceeds a safe level."],
      ],
      [
        ["The homepage lists the prices that apply today.", "The prices in effect today are the current prices."],
        ["A strong undertow surprises a beachgoer.", "An undertow is a current flowing away from the shore beneath incoming waves."],
      ],
      [
        ["A conductor completes a path back to the power source.", "A continuous conducting path lets electric current return to its source."],
        ["Your train platform may change from the one in an old screenshot.", "The current platform is the assignment in effect now."],
      ],
      [
        ["A weather map traces moving air with arrows.", "Air currents are streams of moving air."],
        ["The latest edition replaces an obsolete manual.", "The latest edition is the current version."],
      ],
      [
        ["A river bend can sweep a canoe toward its outer bank.", "A river’s current can push a canoe toward the outside of a bend."],
        ["A battery supplies direct flow instead of alternation.", "Direct current flows in one direction."],
      ],
    ],
  },
  {
    answer: "Draft",
    explanation: "A draft can be an early version of writing, a flow of cool air, or a selection process used by sports leagues.",
    pairs: [
      [
        ["An editor marks up a rough first version.", "A rough draft is an early version open to edits."],
        ["A gap under the door lets cool air through.", "A draft is a stream of air through an opening."],
      ],
      [
        ["A team claims a player with the first pick.", "A sports draft lets teams select eligible players in order."],
        ["A writer moves paragraphs around before publishing.", "A writer can reorder paragraphs in a draft."],
      ],
      [
        ["Air leaking around a window makes a candle flicker.", "A draft around the window makes the candle flame flicker."],
        ["A bartender pulls a handle to dispense beer from a keg.", "Draft beer is served from a keg through a tap."],
      ],
      [
        ["A message sits in the outbox editor before it is sent.", "A draft is a message that has been written and saved for later sending."],
        ["Ships with deep hulls need more water below the surface.", "A ship’s draft measures how far its hull extends below the waterline."],
      ],
      [
        ["A racing driver follows another car to reduce air resistance.", "Drafting behind another car can reduce aerodynamic drag."],
        ["A league awards selection slots before its season begins.", "Draft slots tell teams when they can pick."],
      ],
      [
        ["A manuscript has a version number and blank sections to fill.", "A manuscript draft can contain placeholders while the writer works."],
        ["A chimney depends on upward-moving air.", "A chimney draft pulls gases upward."],
      ],
      [
        ["A brewer distinguishes a pint poured from a tap from one poured from a bottle.", "Draft beer comes from a tap instead of a bottle."],
        ["An artist's preliminary plans show where the walls will go.", "A preliminary drawing can be a draft of the layout."],
      ],
      [
        ["A strip of weather seal stops a cold flow through the front door.", "Weather sealing stops a cold draft through the door."],
        ["A coach scouts prospects before announcing a selection.", "Scouting helps a team prepare to select players in the draft."],
      ],
    ],
  },
  {
    answer: "Frame",
    explanation: "A frame can surround a picture, be a single image in a video, or form the supporting structure of a bicycle.",
    pairs: [
      [
        ["A wooden border holds a photograph.", "A picture frame surrounds and holds the photograph."],
        ["A paused movie displays one image.", "A paused video displays a single frame."],
      ],
      [
        ["Pedals, wheels, and handlebars attach to this bicycle structure.", "The bicycle frame connects and supports its main parts."],
        ["A bowling scorecard has ten turns of up to two ordinary rolls.", "A bowling game is divided into ten frames."],
      ],
      [
        ["A comic artist puts a scene inside one outlined panel.", "A comic frame encloses a single scene."],
        ["An optician fits lenses into a pair of rims.", "Eyeglass frames hold the lenses."],
      ],
      [
        ["An architect draws the supporting skeleton of a building.", "A building frame is the skeleton supporting the structure."],
        ["A photographer moves a step so a tree fits inside the image edges.", "Changing the framing can put the tree inside the composition."],
      ],
      [
        ["A filmmaker counts 24 individual images in a second.", "Each of those individual film images is a frame."],
        ["A picture hangs by a wire mounted to its border.", "A wire fixed to the picture frame lets it hang."],
      ],
      [
        ["A story’s setup changes how you interpret the events inside it.", "A story’s framing changes how the audience interprets it."],
        ["A welder joins tubes into a bicycle’s main structure.", "The welded bicycle frame supports the major components."],
      ],
      [
        ["A screen capture freezes the exact moment a ball crosses a line.", "A screenshot captures one frame of a moving sequence."],
        ["In bowling, a strike completes this unit on the first roll, except for possible bonus rolls in the tenth.", "A strike usually finishes a bowling frame on its first roll."],
      ],
      [
        ["A doorway's surrounding structure holds the hinges.", "A door frame surrounds the door and supports its hinges."],
        ["A lawyer shapes the question so one interpretation sounds natural.", "How the lawyer frames the question can suggest an interpretation."],
      ],
    ],
  },
  {
    answer: "Root",
    explanation: "A root can anchor a plant, be a base form of a word, or be a value that solves an equation when the expression equals zero.",
    pairs: [
      [
        ["A plant draws water through fine underground strands.", "Fine roots absorb water from the soil."],
        ["The square of 7 is 49, making 7 one answer to an inverse-power question.", "Seven is a square root of 49."],
      ],
      [
        ["A linguist removes endings to find the word’s base.", "A word’s root is its base, before the added endings."],
        ["A tree’s support spreads under the pavement.", "Tree roots spread underground to anchor the trunk."],
      ],
      [
        ["A calculator uses a radical sign to show the operation.", "A radical sign denotes a root, such as a square root."],
        ["A dentist cleans a canal beneath the tooth’s crown.", "A root canal runs through the part of a tooth beneath its crown."],
      ],
      [
        ["A genealogist looks for where a family line began.", "A family’s roots are its origins."],
        ["A quadratic graph crosses the x-axis at a solution.", "At an x-intercept, the function is zero and the x-value is a root."],
      ],
      [
        ["The top-level directory contains every other directory under it.", "The root directory is at the top of a file system."],
        ["A carrot is the part of the plant eaten underground.", "The edible portion of a carrot is its enlarged taproot."],
      ],
      [
        ["A poet hears the same base in two words with different suffixes.", "Different suffixes can attach to the same root word."],
        ["A gardener loosens the buried part before repotting.", "Loosening the roots helps them spread in their new pot."],
      ],
      [
        ["A postmortem asks for the underlying cause of a failure.", "A root cause is the underlying reason the failure occurred."],
        ["The value that makes x³ equal 27 is 3.", "Three is the cube root of 27."],
      ],
      [
        ["A supporter cheers for the home team.", "To root for a team is to cheer for it."],
        ["The account with the broadest privileges on a Unix system.", "The root user is the Unix superuser."],
      ],
    ],
  },
  {
    answer: "Track",
    explanation: "A track can carry a train, define a running course, or be one recording in a playlist.",
    pairs: [
      [
        ["A train follows two steel rails.", "The rails form the track that guides the train."],
        ["A playlist skips to its next song.", "Each song is a track in the playlist."],
      ],
      [
        ["A runner stays inside a marked lane around an oval.", "The marked lanes form a running track."],
        ["A ranger follows impressions left in mud.", "The impressions are tracks left by an animal or person."],
      ],
      [
        ["A producer isolates the vocal recording from the instruments.", "A vocal track contains the voice apart from the other audio layers."],
        ["A tank rolls on continuous metal treads.", "A tank moves on continuous tracks."],
      ],
      [
        ["A courier’s progress can be followed by scanning a parcel.", "A scan lets people track the parcel’s progress."],
        ["A railway switch sends a carriage down a different path.", "A switch directs the carriage onto a different track."],
      ],
      [
        ["A cyclist rides a banked circuit indoors.", "The banked circuit is a cycling track."],
        ["A hunter studies which direction the prints point.", "The direction of the animal’s tracks shows where it went."],
      ],
      [
        ["A stage recording has separate audio layers.", "Each separate layer of a recording is an audio track."],
        ["A sleigh leaves a long mark in new snow.", "The runners of the sleigh leave tracks in the snow."],
      ],
      [
        ["A school offers an accelerated route through its classes.", "An accelerated track is a path through a school’s classes."],
        ["A project manager follows whether a deadline is still achievable.", "Tracking a deadline means following progress toward it."],
      ],
      [
        ["A satellite receiver follows the position of an object over time.", "Tracking an object means following its position over time."],
        ["A numbered list on the album sleeve names each recording.", "The album’s track list names its individual recordings."],
      ],
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
  while (selected.length < ROUNDS) {
    const { answer, explanation, pairs } = choices.splice(randomInt(choices.length), 1)[0];
    selected.push({
      answer,
      explanation,
      pairs: pairs.map(([[first], [second]]) => [first, second]),
    });
  }
  return selected;
}

function pairFor(puzzle: Puzzle, round: number, seat: number) {
  return puzzle.pairs[(seat + round) % puzzle.pairs.length];
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

  const previousGuesses = state.wrongGuesses.length
    ? [{ title: "Previous guesses", items: state.wrongGuesses }]
    : [];

  switch (state.phase) {
    case "puzzle": {
      const expired = context.now >= state.deadline;
      const pair = pairFor(puzzle, state.round, seat);
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
        cards: [{ title: "Strikes left", body: `Remaining: ${MAX_STRIKES - state.wrongGuesses.length} of ${MAX_STRIKES}` }, ...previousGuesses, progress],
        controls,
      };
    }
    case "reveal": {
      const headings = { solved: "Thread found", strikes: "Out of strikes", expired: "Time ran out" };
      const authored = PUZZLES.find(({ answer }) => answer === puzzle.answer);
      const connections = new Map(authored?.pairs.flat());
      const clueCards = context.players.map(({ name }, index) => ({
        title: `${name}’s clues`,
        items: pairFor(puzzle, state.round, index).map((fragment) => {
          const connection = connections.get(fragment);
          return connection ? `${fragment} — ${connection}` : fragment;
        }),
      }));
      return {
        phase: state.phase,
        round,
        heading: headings[state.result ?? "expired"],
        cards: [{ title: puzzle.answer, body: puzzle.explanation }, ...clueCards, ...previousGuesses, progress],
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
