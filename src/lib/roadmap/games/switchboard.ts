import { createHash, randomUUID } from "node:crypto";
import type { GameAction, GameContext, GameDefinition, GameView } from "../contract.ts";

type Cell = readonly [row: number, column: number];
type Direction = "north" | "east" | "south" | "west";
type Map = { route: Cell[]; hazards: Cell[]; budget: number };
type Signal = "ready" | "safe" | "warning" | "reset" | "arrived" | "exhausted";
type Result = { solved: boolean; remaining: number };
type Leg = 0 | 1;
type State = {
  seed: string;
  crew: readonly [string, string];
  phase: "routing" | "route-result" | "finished";
  leg: Leg;
  position: number;
  remaining: number;
  signal: Signal;
  results: Result[];
};

const templates: Cell[][] = [
  [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3]],
  [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [3, 2], [3, 3]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3]],
  [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [3, 2], [3, 3]],
];
const directions: Record<Direction, Cell> = { north: [-1, 0], east: [0, 1], south: [1, 0], west: [0, -1] };
const names: Record<Direction, string> = { north: "North", east: "East", south: "South", west: "West" };
const cellName = ([row, column]: Cell) => `${"ABCD"[row]}${column + 1}`;
const sameCell = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];
const signals: Record<Signal, string> = {
  ready: "Ready at the starting terminal.",
  safe: "Safe connection. Your signal advanced.",
  warning: "Warning. The signal held at the current terminal.",
  reset: "Circuit reset. Your signal returned to the starting terminal.",
  arrived: "Destination reached.",
  exhausted: "Move budget exhausted.",
};

export function makeMap(seed: string, leg: Leg): Map {
  const layout = createHash("sha256").update(seed).digest();
  const firstTemplate = layout[0] % templates.length;
  const template = leg === 0 ? firstTemplate : (firstTemplate + 1 + layout[1] % (templates.length - 1)) % templates.length;
  const transform = ([row, column]: Cell): Cell => {
    const r = layout[2] % 2 ? 3 - row : row;
    const c = layout[3] % 2 ? 3 - column : column;
    return layout[4] % 2 ? [c, r] : [r, c];
  };
  const route = templates[template].map(transform);
  const alternate = templates[(template + 1) % templates.length].map(transform);
  const hazardOrder = createHash("sha256").update(`${seed}/hazards/${leg}`).digest();
  // Leave an alternate route open so the hazard monitor cannot give away the answer.
  const openCells = [...route, ...alternate];
  const offRoute: Cell[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const cell = [row, column] as const;
      if (!openCells.some((step) => sameCell(step, cell))) offRoute.push(cell);
    }
  }
  const eligibleHazards = offRoute.filter((cell) => {
    const separation = Math.abs(cell[0] - route[0][0]) + Math.abs(cell[1] - route[0][1]);
    return separation > 1;
  });
  const hazards = eligibleHazards
    .map((cell) => ({ cell, order: hazardOrder[cell[0] * 4 + cell[1]] }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)
    .map(({ cell }) => cell);
  return { route, hazards, budget: route.length + 5 };
}

function create(context: GameContext): State {
  if (context.players.length !== 2 || context.players[0].id === context.players[1].id) {
    throw new Error("Switchboard needs exactly two different players.");
  }
  const seed = randomUUID();
  return {
    seed, crew: [context.players[0].id, context.players[1].id], phase: "routing", leg: 0,
    position: 0, remaining: makeMap(seed, 0).budget, signal: "ready", results: [],
  };
}

function checkCrew(state: State, context: GameContext) {
  if (!state.crew.includes(context.actorId)) throw new Error("Join this crew first.");
}

function validMoves(cell: Cell) {
  return (Object.keys(directions) as Direction[]).filter((direction) => {
    const [dr, dc] = directions[direction];
    return cell[0] + dr >= 0 && cell[0] + dr < 4 && cell[1] + dc >= 0 && cell[1] + dc < 4;
  });
}

function moveId(state: State, direction: Direction) {
  return `move-${state.leg}-${state.remaining}-${direction}`;
}

function takeMove(state: State, map: Map, direction: Direction): State {
  const [row, column] = map.route[state.position];
  const [dr, dc] = directions[direction];
  const target: Cell = [row + dr, column + dc];
  const remaining = state.remaining - 1;
  const safe = sameCell(target, map.route[state.position + 1]);
  const reset = map.hazards.some((cell) => sameCell(target, cell));
  const position = safe ? state.position + 1 : reset ? 0 : state.position;
  const solved = position === map.route.length - 1;
  if (solved || remaining === 0) {
    return {
      ...state, position, remaining, phase: "route-result", signal: solved ? "arrived" : "exhausted",
      results: [...state.results, { solved, remaining }],
    };
  }
  return { ...state, position, remaining, signal: safe ? "safe" : reset ? "reset" : "warning" };
}

function act(state: State, context: GameContext, action: GameAction): State {
  checkCrew(state, context);
  if (state.phase === "route-result" && action.id === `continue-${state.leg}`) {
    if (state.leg === 1) return { ...state, phase: "finished" };
    return { ...state, phase: "routing", leg: 1, position: 0, remaining: makeMap(state.seed, 1).budget, signal: "ready" };
  }
  if (state.phase !== "routing") throw new Error("This route is over.");
  if (context.actorId === state.crew[state.leg]) throw new Error("Give directions to your operator. Only they can move the signal.");
  const map = makeMap(state.seed, state.leg);
  const direction = validMoves(map.route[state.position]).find((option) => moveId(state, option) === action.id);
  if (!direction) throw new Error("That move is unavailable. Use a direction shown on your current board.");
  return takeMove(state, map, direction);
}

function view(state: State, context: GameContext): GameView {
  checkCrew(state, context);
  const round = `Route ${state.leg + 1} of 2`;
  const map = makeMap(state.seed, state.leg);
  const checkpoints = {
    title: "Connected checkpoints",
    body: `${state.position} of ${map.route.length - 1} connected.`,
    items: map.route.slice(0, state.position + 1).map((cell, index) =>
      `${index === 0 ? "Start" : `Checkpoint ${index}`} · ${cellName(cell)}`),
  };
  if (state.phase !== "routing") {
    const solved = state.results.filter((result) => result.solved).length;
    const score = state.results.reduce((sum, result) => sum + (result.solved ? result.remaining : 0), 0);
    const finished = state.phase === "finished";
    return {
      phase: state.phase, round, finished,
      heading: finished ? (solved === 2 ? "Both routes connected" : "Session complete") : signals[state.signal],
      detail: finished
        ? (solved === 2 ? "Your crew connected both circuits. Your score is the sum of the moves you saved." : "Both routes must reach the destination for a crew win.")
        : (state.leg === 0 ? "Swap roles for the second circuit." : "Both circuits have ended."),
      cards: [...state.results.map((result, index) => ({
        title: `Route ${index + 1}`,
        body: result.solved ? `Connected with ${result.remaining} moves left.` : "Move budget exhausted before connecting.",
      })), ...(finished ? [] : [checkpoints])],
      standings: [{ label: "Routes connected", score: solved }, { label: "Combined moves saved", score }],
      controls: finished ? [] : [{ id: `continue-${state.leg}`, label: state.leg === 0 ? "Swap roles and start route 2" : "See crew results" }],
    };
  }

  const position = map.route[state.position];
  const navigator = context.actorId === state.crew[state.leg];
  return {
    phase: state.phase, round,
    heading: navigator ? "Navigate the signal" : "Operate the switchboard",
    detail: navigator ? "Tell your partner which direction to move. Keep your route on this screen." : "Listen to your navigator and tap one direction at a time.",
    cards: [{
      title: "Signal",
      body: signals[state.signal],
      items: [`Current terminal ${cellName(position)}`, `Destination ${cellName(map.route[map.route.length - 1])}`, `${state.remaining} moves left`],
    }, checkpoints],
    privateCards: navigator ? [{
      title: "Your safe route",
      body: "Rows A–D run north to south. Columns 1–4 run west to east.",
      items: map.route.map((cell, index) => `${index === 0 ? "Start" : index === map.route.length - 1 ? "Destination" : `Step ${index}`} · ${cellName(cell)}`),
    }] : [{
      title: "Your hazard monitor",
      body: "Entering one of these terminals returns the signal to the start. Other terminals may still be off-route.",
      items: map.hazards.map((cell) => `Reset at ${cellName(cell)}`),
    }],
    controls: navigator ? [] : validMoves(position).map((direction) => ({ id: moveId(state, direction), label: names[direction] })),
  };
}

export const game: GameDefinition<State> = {
  slug: "switchboard",
  title: "Switchboard",
  description: "Talk your partner through two hidden circuit routes, then swap controls.",
  minimumPlayers: 2,
  maximumPlayers: 2,
  instructions: [
    "One player sees the safe route. The other sees the switches and reset hazards.",
    "Guide the operator aloud, one direction at a time. Each switch uses one move.",
    "An off-route move can leave you in place or send you back to the start.",
    "Swap roles for the second route. Connect both circuits and save as many moves as you can.",
  ],
  create, act, view,
};
