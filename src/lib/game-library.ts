export type GameDefinition = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  game_type: string;
  ruleset_version: number;
  config: Record<string, unknown>;
};

export type RoomSnapshot = {
  id: string;
  code: string;
  status: string;
  game_id: string;
  game_version: number;
  game_state: Record<string, unknown>;
  group_score: number;
};

/** Every game provides a pure state reducer; Supabase only persists its output. */
export type GameAdapter<State extends Record<string, unknown>, Action> = {
  slug: string;
  initialState: () => State;
  reduce: (state: State, action: Action) => State;
  validate: (state: State) => boolean;
};
