import { randomInt, randomUUID } from "node:crypto";
import type { DisplayCard, GameContext, GameControl, GameDefinition, GameView } from "../contract.ts";

type Scene = {
  title: string;
  incident: string;
  procedure: string;
  obsolete: string;
  duties: [title: string, description: string][];
};

const scenes: Scene[] = [
  {
    title: "The lantern launch",
    incident: "One lantern floated away early during the harbor parade. Everyone was working a station on the launch crew. The harbor office suspects one briefing came from the rehearsal binder.",
    procedure: "Hold every lantern until the bell rings twice.",
    obsolete: "Hold every lantern until a yellow scarf is raised.",
    duties: [["Dock marshal", "You held the crowd behind the chalk line."], ["Wick checker", "You checked each wick before it reached the ramp."], ["Ferry spotter", "You watched the channel for passing boats."], ["Float rigger", "You untangled a guide line beside the railing."], ["Supply runner", "You took spare lanterns from the shed to the dock."], ["Ticket clerk", "You counted launch groups at the gate."], ["Weather flagger", "You watched gusts from the end of the pier."], ["Launch steward", "You gave each crew a marked lane."], ["Dock cleaner", "You pulled soggy paper from the staging area."], ["Harbor scribe", "You logged when the first row was ready."]],
  },
  {
    title: "The ribbon on display",
    incident: "The town's prize ribbon reappeared inside a locked exhibit after closing. Staff had been moving objects for opening night. Someone was issued a packet meant for the old exhibit.",
    procedure: "Leave a numbered paper seal on any cabinet you close.",
    obsolete: "Leave a green cloth loop on any cabinet you close.",
    duties: [["Condition checker", "You inspected the fabric on the borrowed coats."], ["Exhibit labeler", "You corrected two labels near the display aisle."], ["Key steward", "You signed keys in and out at the staff desk."], ["Frame fitter", "You reset a leaning frame near the center cabinet."], ["Cart handler", "You rolled boxed artifacts to the service alcove."], ["Catalog clerk", "You checked loan numbers against the evening list."], ["Gallery attendant", "You walked the visitor route before locking up."], ["Light technician", "You adjusted the beams above the glass cases."], ["Plinth builder", "You leveled the bases along the east wall."], ["Door monitor", "You directed deliveries through the loading door."]],
  },
  {
    title: "The midnight toast",
    incident: "The bakery's festival loaf went missing from the cooling room minutes before judging. The night crew were all preparing deliveries. One of their handover notes came from an earlier festival.",
    procedure: "Collect outgoing trays from the bench beside the freezer.",
    obsolete: "Collect outgoing trays from the rack beside the alley door.",
    duties: [["Oven lead", "You watched the last batch and cleared the hot aisle."], ["Glaze maker", "You weighed the syrup for the morning trays."], ["Box folder", "You folded transport cartons before the runners came."], ["Proofing aide", "You reset the drawers after the last rise."], ["Label writer", "You wrote ingredient cards for the public table."], ["Tray runner", "You sorted trays by their delivery times."], ["Scale keeper", "You checked the weights printed on each batch sheet."], ["Flour clerk", "You counted opened sacks in the dry store."], ["Order caller", "You read the last pickup numbers from the ledger."], ["Cooling attendant", "You cleared a space for the large festival loaf."]],
  },
  {
    title: "The rooftop transmission",
    incident: "A short radio test was heard on the neighborhood broadcast feed. The rooftop relay crew signed in together, but one old maintenance sheet may have been slipped into the stack.",
    procedure: "Confirm a safe test with a red check mark on the log.",
    obsolete: "Confirm a safe test with a black triangle on the log.",
    duties: [["Antenna checker", "You inspected the brackets before the test."], ["Battery runner", "You brought a spare battery to the top floor."], ["Headset steward", "You tested the crew's headset connections."], ["Feed monitor", "You listened to the receiver beside the stairwell."], ["Cable guide", "You moved a cable away from the vent gate."], ["Meter reader", "You copied readings from the battery cabinet."], ["Roof escort", "You walked contractors from the lift to the relay."], ["Equipment clerk", "You checked off the parts borrowed that evening."], ["Mast spotter", "You watched the mast during the wind check."], ["Bench technician", "You tightened the clips on one portable receiver."]],
  },
  {
    title: "The wrong plant label",
    incident: "A botanical garden opened to find a ceremonial fern labeled as a pumpkin vine. The greenhouse crew used different stations before dawn. One station received an outdated relocation instruction.",
    procedure: "Place moved plants on a low slate with the old tag underneath.",
    obsolete: "Place moved plants on a wooden crate with the old tag inside.",
    duties: [["Watering lead", "You watered the dry pots before the gates opened."], ["Bench cleaner", "You swept the staging bench near the doors."], ["Propagation aide", "You carried cuttings from the warm house."], ["Shade steward", "You rolled a screen away from the central aisle."], ["Inventory clerk", "You checked the accession numbers on small pots."], ["Soil mixer", "You carried a bucket of sand to the repotting station."], ["Visitor guide", "You rehearsed the first tour route through the house."], ["Pot runner", "You fetched containers from underneath the sink."], ["Door watcher", "You directed volunteers to their assigned benches."], ["Tag printer", "You ran fresh tags for the plants on display."]],
  },
  {
    title: "The silent preview",
    incident: "A theater preview began with the curtain open and the stage silent. The crew all recall preparing for the opening. One department got its instructions from the previous production.",
    procedure: "Wait for a small white light before taking an opening cue.",
    obsolete: "Wait for a tap on the railing before taking an opening cue.",
    duties: [["Curtain hand", "You checked the curtain track before the house opened."], ["Sound board aide", "You matched the marked channels to the stage plot."], ["Wardrobe runner", "You carried a mended sleeve to the dressing room."], ["Prop keeper", "You set the opening props along a painted line."], ["Fly floor spotter", "You watched the counterweight ropes from above."], ["Front of house aide", "You directed the first visitors to their rows."], ["Stage sweeper", "You removed scrap tape beside the opening mark."], ["Script runner", "You replaced a marked script backstage."], ["Light board aide", "You confirmed the center lamps could dim."], ["Scene shifter", "You lined up the first flats for the preview."]],
  },
  {
    title: "The fountain switch",
    incident: "A fountain rehearsal produced bubbles instead of the usual spray. The event crew was split between the plaza and pump room. One checklist came from the previous demonstration.",
    procedure: "Tie a striped cord to equipment cleared for the rehearsal.",
    obsolete: "Slide an orange sleeve over equipment cleared for the rehearsal.",
    duties: [["Pump aide", "You watched the main pressure gauge during setup."], ["Hose minder", "You straightened a folded hose beside the stairs."], ["Queue steward", "You moved barriers around the edge of the plaza."], ["Nozzle washer", "You rinsed mineral flakes from two fittings."], ["Valve checker", "You read the stamps on the return valves."], ["Timing clerk", "You wrote down the planned intervals for each jet."], ["Power monitor", "You checked that the cables stayed above the water line."], ["Filter runner", "You delivered a new strainer to the pump room."], ["Plaza walker", "You checked the paved route for puddles."], ["Control helper", "You held the printed sequence beside the control box."]],
  },
  {
    title: "The extra railcar",
    incident: "A tiny railcar appeared in the wrong train at a model railway exhibition. Volunteers had been moving trains before opening. The display manager believes one operating slip came from a test layout.",
    procedure: "Park a checked train on the siding under the bridge.",
    obsolete: "Park a checked train on the siding beside the signal box.",
    duties: [["Track wiper", "You cleaned the rails through the main curve."], ["Coupler checker", "You inspected the couplers on the freight cars."], ["Bridge steward", "You checked the guard edging near the span."], ["Signal aide", "You tested the indicator lights on the board."], ["Layout runner", "You moved a tool kit between the display corners."], ["Freight clerk", "You matched car numbers against the layout manifest."], ["Wheel watcher", "You looked for loose wheels on the passenger stock."], ["Scene fixer", "You reset a fence post beside the freight yard."], ["Battery checker", "You replaced a worn battery in a controller."], ["Platform guide", "You pointed volunteers toward inspection stations."]],
  },
];

const rounds = 3;
const alibiTime = 40_000;
const discussionTime = 45_000;
const accusationTime = 45_000;
const maximumAlibiLength = 180;

type Phase = "briefing" | "alibis" | "discussion" | "accusation" | "reveal" | "complete";
type Reveal = { caught: boolean; tally: Record<string, number>; votes: number };
type State = {
  id: string;
  players: string[];
  cases: { scene: number; mismatch: string; duties: number[] }[];
  stage: Phase;
  round: number;
  speaker: number;
  deadline?: number;
  statements: Record<string, string | null>;
  accusations: Record<string, string | null>;
  scores: Record<string, number>;
  reveal?: Reveal;
};

function shuffle<T>(source: readonly T[]) {
  const items = [...source];
  for (let index = items.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function create(context: GameContext): State {
  if (context.actorId !== context.hostId) throw new Error("Only the host can start Alibi.");
  const players = context.players.map(({ id }) => id);
  if (players.length < 4 || players.length > 10 || new Set(players).size !== players.length || !players.includes(context.hostId)) {
    throw new Error("Alibi needs four to ten distinct players.");
  }
  const comparisons = shuffle(players);
  return {
    id: randomUUID(), players,
    cases: shuffle(scenes.map((_, index) => index)).slice(0, rounds).map((scene, index) => ({
      scene, mismatch: comparisons[index], duties: shuffle(scenes[scene].duties.map((_, duty) => duty)),
    })),
    stage: "briefing", round: 0, speaker: 0, statements: {}, accusations: {},
    scores: Object.fromEntries(players.map((id) => [id, 0])),
  };
}

function requirePlayer(state: State, context: GameContext) {
  if (!state.players.includes(context.actorId) || !context.players.some(({ id }) => id === context.actorId)) {
    throw new Error("Only players in this Alibi match can open its records.");
  }
}

function name(context: GameContext, id: string) {
  return context.players.find((player) => player.id === id)?.name ?? "Player";
}

function reader(state: State) {
  return state.players[state.round % state.players.length];
}

function activeSpeaker(state: State) {
  return state.players[(state.round + state.speaker) % state.players.length];
}

function currentCase(state: State) {
  return state.cases[state.round];
}

function canLead(state: State, context: GameContext) {
  return context.actorId === context.hostId || context.actorId === reader(state);
}

function expired(state: State, context: GameContext) {
  return state.deadline !== undefined && context.now >= state.deadline;
}

function control(state: State, verb: string, label: string, fields?: GameControl["fields"]): GameControl {
  return { id: [verb, state.id, state.round, state.stage, state.speaker].join("."), label, fields };
}

function recordCard(state: State, participant: string): DisplayCard {
  const record = currentCase(state);
  const scene = scenes[record.scene];
  const [title, duty] = scene.duties[record.duties[state.players.indexOf(participant)]];
  const note = participant === record.mismatch ? scene.obsolete : scene.procedure;
  return { title, body: duty, items: [`Your shift note: ${note}`] };
}

function reveal(state: State): State {
  const tally: Record<string, number> = Object.fromEntries(state.players.map((id) => [id, 0]));
  let votes = 0;
  for (const accused of Object.values(state.accusations)) {
    if (accused !== null) {
      tally[accused] += 1;
      votes++;
    }
  }
  const mismatch = currentCase(state).mismatch;
  const caught = tally[mismatch] > 0 && state.players.every((id) => id === mismatch || tally[id] < tally[mismatch]);
  const scores = { ...state.scores };
  if (caught) {
    for (const [voter, accused] of Object.entries(state.accusations)) {
      if (accused === mismatch) scores[voter]++;
    }
  } else {
    scores[mismatch]++;
  }
  return { ...state, stage: "reveal", deadline: undefined, scores, reveal: { caught, tally, votes } };
}

function nextSpeaker(state: State, context: GameContext, text: string | null): State {
  const statements = { ...state.statements, [activeSpeaker(state)]: text };
  if (state.speaker + 1 === state.players.length) {
    return { ...state, statements, stage: "discussion", deadline: context.now + discussionTime };
  }
  return { ...state, statements, speaker: state.speaker + 1, deadline: context.now + alibiTime };
}

function standings(state: State, context: GameContext) {
  return state.players.map((id) => ({ label: name(context, id), score: state.scores[id] }))
    .sort((left, right) => right.score - left.score);
}

function controls(state: State, context: GameContext): GameControl[] {
  const actor = context.actorId;
  const elapsed = expired(state, context);
  switch (state.stage) {
    case "briefing":
      return canLead(state, context) ? [control(state, "begin", "Start alibis")] : [];
    case "alibis":
      if (elapsed) return [control(state, "skip", "Move past expired turn")];
      if (actor !== activeSpeaker(state)) return [];
      return [
        control(state, "alibi", "Share alibi", [{ name: "statement", label: "Your alibi", type: "textarea", maxLength: maximumAlibiLength }]),
        control(state, "pass", "Pass this turn"),
      ];
    case "discussion":
      return canLead(state, context) || elapsed ? [control(state, "open", "Open accusations")] : [];
    case "accusation":
      if (elapsed) return [control(state, "reveal", "Reveal accusations")];
      if (Object.hasOwn(state.accusations, actor)) return [];
      return [
        control(state, "accuse", "Lock accusation", [{
          name: "target", label: "Who got the wrong packet?", type: "select",
          options: state.players.filter((id) => id !== actor).map((id) => ({ value: id, label: name(context, id) })),
        }]),
        control(state, "abstain", "Abstain"),
      ];
    case "reveal":
      return canLead(state, context) ? [control(state, "next", state.round + 1 === rounds ? "See final standings" : "Open the next incident")] : [];
    case "complete":
      return [];
  }
}

const act: GameDefinition<State>["act"] = (state, context, action) => {
  requirePlayer(state, context);
  if (!controls(state, context).some(({ id }) => id === action.id)) {
    throw new Error("That action is unavailable or belongs to an earlier Alibi turn.");
  }
  const [verb] = action.id.split(".");
  switch (verb) {
    case "begin":
      return { ...state, stage: "alibis", deadline: context.now + alibiTime };
    case "alibi": {
      const statement = action.values.statement?.trim().replace(/\s+/g, " ");
      if (!statement || statement.length > maximumAlibiLength || !/[\p{L}\p{N}]/u.test(statement)) {
        throw new Error("Write an alibi between 1 and 180 characters.");
      }
      return nextSpeaker(state, context, statement);
    }
    case "pass":
    case "skip":
      return nextSpeaker(state, context, null);
    case "open":
      return { ...state, stage: "accusation", deadline: context.now + accusationTime };
    case "accuse":
    case "abstain": {
      const target = verb === "accuse" ? action.values.target : null;
      if (target !== null && (!state.players.includes(target) || target === context.actorId)) {
        throw new Error("Accuse another player in this match.");
      }
      const accusations = { ...state.accusations, [context.actorId]: target };
      const next = { ...state, accusations };
      return Object.keys(accusations).length === state.players.length ? reveal(next) : next;
    }
    case "reveal":
      return reveal(state);
    case "next":
      return state.round + 1 === rounds ? { ...state, stage: "complete" } : {
        ...state, stage: "briefing", round: state.round + 1, speaker: 0, deadline: undefined,
        statements: {}, accusations: {}, reveal: undefined,
      };
    default:
      throw new Error("Unknown Alibi move.");
  }
};

function alibiCards(state: State, context: GameContext): DisplayCard[] {
  const entries = Object.entries(state.statements);
  return entries.length ? [{
    title: "Alibis on record",
    items: entries.map(([player, statement]) => `${name(context, player)}: ${statement ?? "No alibi given."}`),
  }] : [];
}

function resultCards(state: State, context: GameContext, scene: Scene): DisplayCard[] {
  const record = currentCase(state);
  const result = state.reveal;
  if (!result) return [];
  const card = recordCard(state, record.mismatch);
  return [
    { title: `${name(context, record.mismatch)}’s mismatched packet`, body: `${card.title}. ${card.body}`, items: card.items },
    { title: "Correct briefing", body: scene.procedure },
    {
      title: result.votes ? "Accusation tally" : "No accusations were cast",
      items: Object.entries(result.tally).filter(([, count]) => count > 0)
        .sort((left, right) => right[1] - left[1])
        .map(([id, count]) => `${name(context, id)}: ${count} ${count === 1 ? "accusation" : "accusations"}`),
    },
  ];
}

function view(state: State, context: GameContext): GameView {
  requirePlayer(state, context);
  const scene = scenes[currentCase(state).scene];
  const board: GameView = {
    phase: state.stage, heading: scene.title, round: `Incident ${state.round + 1} of ${rounds}`,
    controls: controls(state, context), deadline: state.deadline,
    cards: [{ title: scene.title, body: scene.incident }],
  };
  if (state.stage === "complete") {
    const ranks = standings(state, context);
    const leaders = ranks.filter(({ score }) => score === ranks[0].score).map(({ label }) => label);
    return { ...board, heading: leaders.length === 1 ? `${leaders[0]} wins` : "Tied for first",
      detail: leaders.length === 1 ? "All three incidents are closed." : leaders.join(", "),
      cards: [], standings: ranks, finished: true };
  }
  if (state.stage === "reveal") {
    return { ...board, heading: state.reveal?.caught ? "The mismatch was caught" : "The mismatch got away",
      detail: state.reveal?.caught ? "Correct accusers earn one point." : "The player with the mismatched packet earns one point.",
      cards: [...resultCards(state, context, scene), ...alibiCards(state, context)], standings: standings(state, context) };
  }

  board.privateCards = [recordCard(state, context.actorId)];
  board.cards?.push(...alibiCards(state, context));
  if (state.stage === "briefing") {
    return { ...board, heading: "Read your shift packet", detail: `${name(context, reader(state))} reads the incident aloud and starts the alibis.` };
  }
  if (state.stage === "alibis") {
    const actorIsSpeaking = activeSpeaker(state) === context.actorId;
    return { ...board, heading: actorIsSpeaking ? "Your turn to give an alibi" : `${name(context, activeSpeaker(state))} is giving an alibi`,
      detail: "Describe what you were doing and work in one detail from your briefing without reading the packet aloud." };
  }
  if (state.stage === "discussion") {
    return { ...board, heading: "Compare the alibis", detail: "Look for one witness whose details came from a different set of instructions." };
  }
  const locked = Object.hasOwn(state.accusations, context.actorId);
  const ballots = Object.keys(state.accusations).length;
  return { ...board, heading: "Accuse privately",
    detail: `${locked ? "Your decision is locked. " : ""}${ballots} of ${state.players.length} decisions locked.` };
}

export const game: GameDefinition<State> = {
  slug: "alibi",
  title: "Alibi",
  description: "Compare suspicious alibis and find the player working from the wrong briefing.",
  minimumPlayers: 4,
  maximumPlayers: 10,
  instructions: [
    "Read the public incident and your private shift packet. One packet contains obsolete instructions.",
    "Take turns describing where you were. Work a detail into your alibi without reading your packet aloud.",
    "Discuss the inconsistencies and privately accuse another player. A unique top accusation for the mismatch earns correct accusers a point. If the room ties or picks anyone else, the mismatch earns a point.",
    "A new reader leads each of three incidents. The highest total wins.",
  ],
  create, act, view,
};
