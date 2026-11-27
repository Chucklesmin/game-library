export type Player = { id: string; name: string };
export type GameContext = {
  players: readonly Player[];
  actorId: string;
  hostId: string;
  now: number;
};

export type GameAction = { id: string; values: Record<string, string> };
export type DisplayCard = {
  title: string;
  body?: string;
  items?: string[];
  link?: { label: string; href: string };
};
export type GameField = {
  name: string;
  label: string;
  type: "text" | "select" | "textarea";
  maxLength?: number;
  options?: { value: string; label: string }[];
};
export type GameControl = { id: string; label: string; fields?: GameField[] };
export type Stroke = { color: string; width: number; points: [number, number][] };
export type GameView = {
  phase: string;
  heading: string;
  detail?: string;
  round?: string;
  deadline?: number;
  privateHeading?: string;
  privateCards?: DisplayCard[];
  cards?: DisplayCard[];
  standings?: { label: string; score: number }[];
  controls: GameControl[];
  finished?: boolean;
  drawing?: { strokes: Stroke[]; strokeAction?: string };
};

export type GameInfo = {
  slug: string;
  title: string;
  description: string;
  minimumPlayers: number;
  maximumPlayers: number;
  instructions: string[];
};
export type GameDefinition<State> = GameInfo & {
  create(context: GameContext): State;
  act(state: State, context: GameContext, action: GameAction): State;
  view(state: State, context: GameContext): GameView;
};
export type RoomView = {
  id: string;
  code: string;
  revision: number;
  players: Player[];
  hostId: string;
  isHost: boolean;
  turn: string | null;
  game: GameView | null;
};
