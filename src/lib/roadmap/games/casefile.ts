import { randomInt, randomUUID } from "node:crypto";
import type { GameAction, GameContext, GameControl, GameDefinition, GameView } from "../contract.ts";

const components = ["suspect", "motive", "method"] as const;
type Component = typeof components[number];
type Hypothesis = Record<Component, number>;
type Packet = { witness: string; timeline: string; object: string };
type Case = {
  title: string;
  brief: string;
  choices: Record<Component, readonly string[]>;
  solution: Hypothesis;
  evidence: readonly [Packet, Packet];
  explanation: string;
};

const cases: readonly Case[] = [
  {
    title: "The borrowed moon",
    brief: "A paper moon disappeared from the community theater lobby just before opening night. Find who moved it, why, and how.",
    choices: {
      suspect: ["Mae, the lighting technician", "Inez, the ticket clerk", "Theo, the scenic painter"],
      motive: ["To rehearse a shadow effect", "To clear space for tomorrow's delivery", "To prepare a surprise for the cast"],
      method: ["Rolled it through the side door", "Raised it using the lobby pulley", "Carried it behind the ticket desk"],
    },
    solution: { suspect: 0, motive: 0, method: 1 },
    evidence: [
      {
        witness: "The custodian heard the moon mover tell someone, “Leave it up there until we check whether the silhouette reads from the back row.”",
        timeline: "From 6:20 through 6:30, Inez was on a recorded box-office call. The moon disappeared at 6:25.",
        object: "A photo taken during the move shows a newly tightened cord pulling straight up from the hanging loop.",
      },
      {
        witness: "The stage manager watched Theo mixing paint in the shop the entire time the moon was missing.",
        timeline: "At 6:27, the scheduled backstage check was a shadow rehearsal. The cast surprise and delivery setup were both scheduled for the next day.",
        object: "Above the original display, the lobby pulley held an extra length of the same cord. The door and ticket desk paths were blocked by chairs.",
      },
    ],
    explanation: "Inez and Theo were occupied when the moon vanished. Mae raised it using the lobby pulley, which explains the cord pulling straight up. The scheduled shadow check matches what the custodian heard.",
  },
  {
    title: "The shelf that whispered",
    brief: "The library’s wooden bird is missing from the reading-room shelf. The librarian has confirmed it was moved elsewhere in the building.",
    choices: {
      suspect: ["Leon, the repair volunteer", "Etta, the story reader", "Nico, the cataloger"],
      motive: ["To fix a nick on the wing", "To record its whistle for story hour", "To photograph it for the catalog"],
      method: ["Carried it in a canvas book bag", "Took it on the returns cart", "Slid it inside a hollow display book"],
    },
    solution: { suspect: 1, motive: 1, method: 0 },
    evidence: [
      {
        witness: "The desk volunteer saw someone lift the bird and slide it into an empty cloth carryall at 11:10, but a display hid the person’s face.",
        timeline: "Leon was helping run the lobby craft table from 11:00 to 11:20. The repair workbench was locked all morning.",
        object: "The shelf held no loose wood or paint. The faint whistle comes from a small opening under the bird.",
      },
      {
        witness: "The movement was part of a booking that specified, “Please record the sound the wooden bird makes.”",
        timeline: "Nico appeared on an unbroken video call from 11:05 to 11:15 in the upstairs cataloging room.",
        object: "The recording-room sign-out lists a canvas book bag. The hollow display book remained sealed, and the returns cart was in the lobby craft area.",
      },
    ],
    explanation: "Leon and Nico were both occupied at 11:10, leaving Etta. The recording request identifies the purpose, and the sign-out identifies the cloth carryall as the canvas book bag.",
  },
  {
    title: "The empty bell stand",
    brief: "The greenhouse’s ceremonial handbell is gone from its stand. The grounds crew says it was taken to another room for a planned activity.",
    choices: {
      suspect: ["Vera, the gardener", "Cal, the tour guide", "Sol, the potter"],
      motive: ["To let it dry after a leak", "To fit it with a new paper label", "To copy the shape for a clay lesson"],
      method: ["Moved it on the garden trolley", "Wrapped it in a blue apron", "Packed it in a padded plant crate"],
    },
    solution: { suspect: 2, motive: 2, method: 2 },
    evidence: [
      {
        witness: "A volunteer saw the mover ask for modeling clay and heard, “The class starts as soon as I have a shape to show.”",
        timeline: "The bell was still on its stand at 2:15 and gone by 2:20. Vera was leading a livestream in the herb house throughout that interval.",
        object: "A curl of pale shredded paper was left on the stand where the bell had rested.",
      },
      {
        witness: "Two visitors were on Cal’s continuously supervised audio tour in the east garden from 2:10 to 2:25.",
        timeline: "The leak happened after the stand was already empty. The label maker was reserved the next morning.",
        object: "The plant crate had pale shredded-paper padding. The garden trolley never left the east garden, and the blue apron was still folded in its drawer.",
      },
    ],
    explanation: "Vera and Cal were elsewhere during the five-minute window. Sol needed the bell’s shape for the modeling lesson and carried it in the padded plant crate, leaving a curl of its packing paper.",
  },
  {
    title: "A banner out of place",
    brief: "A commemorative banner vanished from the parade workshop. No doors were opened during the five minutes around its move.",
    choices: {
      suspect: ["Ari, the rehearsal leader", "Bea, the tailor", "Jin, the photographer"],
      motive: ["To check a torn hem", "To test the backdrop under a camera", "To practice the opening handoff"],
      method: ["Slipped it behind a folding screen", "Rolled it around a spare pole", "Lowered it into the prop cabinet"],
    },
    solution: { suspect: 2, motive: 1, method: 0 },
    evidence: [
      {
        witness: "A passing volunteer heard the mover test the banner’s position by asking whether its lettering was readable in the shot.",
        timeline: "The room’s time-lapse shows Bea at the sewing station throughout the move.",
        object: "Two fresh scuffs in the dust led from the banner stand toward the changing area. No pole or roll marks continued past them.",
      },
      {
        witness: "Ari was using both hands to demonstrate the handoff in the rehearsal square throughout the logged move.",
        timeline: "The prop cabinet was locked before the move. The spare pole remained in a rack on the far side of the room.",
        object: "The folding screen is the only divider in the changing area. Fresh banner thread caught on its rear hinge.",
      },
    ],
    explanation: "Bea and Ari were occupied under observation. Jin used the screen as a hidden backdrop for a camera test. Marks toward the changing area and thread on the hinge trace the movement to the screen.",
  },
  {
    title: "The little ferry",
    brief: "A model ferry has left its plinth at the waterfront museum without crossing the front desk. It was moved during a routine exhibition check.",
    choices: {
      suspect: ["Lin, the model builder", "Paz, the accessibility guide", "Jo, the exhibition planner"],
      motive: ["To test how easily visitors can reach it", "To test a repair on the mast", "To arrange a new wall display"],
      method: ["Carried it in a covered tray", "Wheeled it on a low foam cradle", "Moved it by the removable handle"],
    },
    solution: { suspect: 1, motive: 0, method: 1 },
    evidence: [
      {
        witness: "The attendant heard someone ask, “Could a visitor seated here reach the cabin?” just as the plinth emptied.",
        timeline: "Lin was demonstrating a different model repair on camera, with no break during the move window.",
        object: "Fresh parallel wheel tracks led from the plinth to the temporary setup. The tray has no wheels.",
      },
      {
        witness: "A decorator was on an uninterrupted call with Jo in the sound booth when the ferry moved.",
        timeline: "The wall-display check was canceled that morning. The access review was still on the schedule.",
        object: "The ferry’s handle remained detached in the old display. The low foam cradle was the only wheeled carrier in the gallery.",
      },
    ],
    explanation: "Lin and Jo could not have made the move. Paz used the low foam cradle to test seated visitor reach, as shown by the wheel tracks, access-review schedule, and the attendant’s account.",
  },
  {
    title: "The missing mosaic tile",
    brief: "A loose corner tile is absent from a mock-up at the neighborhood craft fair. The mock-up is intact, and the organizers say the tile was taken for one of the scheduled demonstrations.",
    choices: {
      suspect: ["Zora, the color mixer", "Sam, the materials lecturer", "Ren, the display builder"],
      motive: ["To match its color to a sample", "To demonstrate how its size fits the grid", "To compare its weight to replicas"],
      method: ["Carried it in the swatch binder", "Moved it on a felt sorting mat", "Put it in a clear snap case"],
    },
    solution: { suspect: 0, motive: 0, method: 2 },
    evidence: [
      {
        witness: "A maker heard the mover ask to compare the tile with a blue test swatch under the fair’s display light.",
        timeline: "The camera above the lecture table shows Sam remained at the table as the tile was collected.",
        object: "The slot in the sorting mat where the tile would fit was full with an old white test block.",
      },
      {
        witness: "Two volunteers were helping Ren place a heavy display frame during the entire move window.",
        timeline: "The weight demo and grid demo were set for the following day. The color match went ahead just before lunch.",
        object: "The swatch binder was signed out to another stall. A visitor saw a transparent lid click shut. The clear snap case is the only lidded tile-sized carrier on the table.",
      },
    ],
    explanation: "Sam and Ren were both occupied. Zora collected the tile for the color match and used the clear snap case. The other carriers were unavailable, and the transparent lid explains the click.",
  },
];

const caseCount = 3;
const durationMs = 120_000;
const leadLimit = 4;
const fieldLabels: Record<Component, string> = { suspect: "Suspect", motive: "Motive", method: "Method" };

type Outcome = "solved" | "spent" | "expired";
type State = {
  token: string;
  players: [string, string];
  order: number[];
  index: number;
  deadline: number;
  leads: number;
  guesses: Hypothesis[];
  lastCost: number;
  outcome: Outcome | null;
  caseScore: number;
  totalScore: number;
  solved: number;
};

function create(context: GameContext): State {
  const [hostSeat, guestSeat] = context.players;
  if (context.players.length !== 2 || hostSeat.id === guestSeat.id) {
    throw new Error("Casefile needs exactly two players.");
  }
  if (context.actorId !== context.hostId || !context.players.some(({ id }) => id === context.actorId)) {
    throw new Error("Only the host can open the casefiles.");
  }
  const available = cases.map((_, index) => index);
  const order = Array.from({ length: caseCount }, () => available.splice(randomInt(available.length), 1)[0]);
  return {
    token: randomUUID(), players: [hostSeat.id, guestSeat.id], order, index: 0,
    deadline: context.now + durationMs, leads: leadLimit, guesses: [], lastCost: 0,
    outcome: null, caseScore: 0, totalScore: 0, solved: 0,
  };
}

function seat(state: State, context: GameContext) {
  const index = state.players.indexOf(context.actorId);
  if (index < 0) throw new Error("Only the two assigned investigators may access this case.");
  return index;
}

function actionId(state: State, verb: string) {
  return `${verb}:${state.token}:${state.index}:${state.guesses.length}`;
}

function currentCase(state: State) {
  return cases[state.order[state.index]];
}

function endsSession(state: State) {
  return state.index === state.order.length - 1;
}

function reveal(state: State, outcome: Outcome, now: number): State {
  const gained = outcome === "solved" ? state.leads * 10 + Math.floor((state.deadline - now) / 5000) : 0;
  return {
    ...state, outcome, caseScore: gained, totalScore: state.totalScore + gained,
    solved: state.solved + Number(outcome === "solved"),
  };
}

function readHypothesis(values: GameAction["values"], caseFile: Case): Hypothesis {
  const hypothesis = { suspect: 0, motive: 0, method: 0 };
  for (const component of components) {
    const value = values[component];
    const number = Number(value);
    if (typeof value !== "string" || !/^\d$/.test(value) || number >= caseFile.choices[component].length) {
      throw new Error("Select a suspect, motive, and method from the case file.");
    }
    hypothesis[component] = number;
  }
  return hypothesis;
}

function act(state: State, context: GameContext, action: GameAction): State {
  seat(state, context);
  if (state.outcome) {
    if (endsSession(state) || action.id !== actionId(state, "next")) {
      throw new Error("This action is unavailable for the revealed case.");
    }
    return {
      ...state, index: state.index + 1, deadline: context.now + durationMs,
      leads: leadLimit, guesses: [], lastCost: 0, outcome: null, caseScore: 0,
    };
  }

  if (context.now >= state.deadline) {
    if (action.id !== actionId(state, "expire")) throw new Error("Time is up. Reveal the solution to close this case.");
    return reveal(state, "expired", context.now);
  }
  if (action.id !== actionId(state, "hypothesis")) {
    throw new Error("This action is unavailable for the current case and attempt.");
  }
  const caseFile = currentCase(state);
  const guess = readHypothesis(action.values, caseFile);
  if (state.guesses.some((previous) => components.every((component) => guess[component] === previous[component]))) {
    throw new Error("The team already tried that combination. Change at least one answer.");
  }
  const incorrect = components.filter((component) => guess[component] !== caseFile.solution[component]).length;
  const next: State = {
    ...state,
    leads: Math.max(0, state.leads - incorrect),
    guesses: [...state.guesses, guess],
    lastCost: incorrect,
  };
  if (incorrect === 0) return reveal(next, "solved", context.now);
  if (next.leads === 0) return reveal(next, "spent", context.now);
  return next;
}

function investigationControl(state: State, caseFile: Case): GameControl {
  return {
    id: actionId(state, "hypothesis"), label: "Submit hypothesis",
    fields: components.map((component) => ({
      name: component, label: fieldLabels[component], type: "select",
      options: caseFile.choices[component].map((choice, value) => ({ value: String(value), label: choice })),
    })),
  };
}

function view(state: State, context: GameContext): GameView {
  const position = seat(state, context);
  const caseFile = currentCase(state);
  const round = `Case ${state.index + 1} of ${state.order.length}`;
  const standings = [
    { label: "Cases solved", score: state.solved },
    { label: "Team score", score: state.totalScore },
  ];

  const hypothesisCards = state.guesses.length ? [{
    title: "Submitted hypotheses",
    items: state.guesses.map((guess, index) => {
      const choices = components.map((component) =>
        `${fieldLabels[component]}: ${caseFile.choices[component][guess[component]]}`).join(" · ");
      return `Attempt ${index + 1} · ${choices}`;
    }),
  }] : [];

  if (state.outcome) {
    const finished = endsSession(state);
    const result = {
      solved: `Case solved. Your team earned ${state.caseScore} points.`,
      spent: "Your team ran out of leads.",
      expired: "Time ran out before your team closed the case.",
    }[state.outcome];
    return {
      phase: finished ? "complete" : "reveal", heading: finished ? "Casefile closed" : "Case reveal",
      round, detail: finished ? `${result} Cases solved: ${state.solved} of ${state.order.length}.` : result,
      standings, finished,
      cards: [
        {
          title: caseFile.title, body: caseFile.explanation,
          items: components.map((component) => `${fieldLabels[component]} · ${caseFile.choices[component][caseFile.solution[component]]}`),
        },
        ...hypothesisCards,
      ],
      controls: finished ? [] : [{ id: actionId(state, "next"), label: "Open next case" }],
    };
  }

  const evidence = caseFile.evidence[(position + state.index) % 2];
  const expired = context.now >= state.deadline;
  const progress = state.lastCost === 0
    ? `${state.leads} shared leads. Compare evidence with your partner before you submit.`
    : `Your last attempt had ${state.lastCost} incorrect ${state.lastCost === 1 ? "answer" : "answers"}. ${state.leads} shared ${state.leads === 1 ? "lead remains" : "leads remain"}.`;

  return {
    phase: "investigate", heading: caseFile.title, round, deadline: state.deadline,
    detail: expired ? "Time is up. Reveal the solution to close the case." : progress,
    cards: [{ title: "Case briefing", body: caseFile.brief }, ...hypothesisCards],
    privateCards: [
      { title: "Witness note", body: evidence.witness },
      { title: "Timeline note", body: evidence.timeline },
      { title: "Object note", body: evidence.object },
    ],
    standings,
    controls: expired ? [{ id: actionId(state, "expire"), label: "Reveal solution" }] : [investigationControl(state, caseFile)],
  };
}

export const game: GameDefinition<State> = {
  slug: "casefile",
  title: "Casefile",
  description: "Compare private clues with a partner to solve three mysteries before your leads run out.",
  minimumPlayers: 2,
  maximumPlayers: 2,
  instructions: [
    "Each investigator has a different witness, timeline, and object note. Describe your evidence to each other.",
    "Either player can submit one shared suspect, motive, and method. Each wrong answer costs a shared lead, with four leads available per case.",
    "Solve each case within two minutes. A solve earns ten points per remaining lead and one point for every five full seconds left.",
    "The true culprit and explanation are shown after a solve, after you run out of leads, or when time runs out.",
  ],
  create, act, view,
};
