import type { GameAdapter } from "@/lib/game-library";

export type SignalState = { phase: "lobby" | "clue" | "tune" | "intercept" | "reveal"; round: number };
export type SignalAction = { type: "start" | "advance" };

const phases: SignalState["phase"][] = ["lobby", "clue", "tune", "intercept", "reveal"];
export const signalGame: GameAdapter<SignalState, SignalAction> = {
  slug: "signal-spectrum",
  initialState: () => ({ phase: "lobby", round: 0 }),
  reduce: (state, action) => {
    if (action.type === "start") return { phase: "clue", round: state.round + 1 };
    const next = phases[(phases.indexOf(state.phase) + 1) % phases.length];
    return next === "lobby" ? { phase: "clue", round: state.round + 1 } : { ...state, phase: next };
  },
  validate: (state) => phases.includes(state.phase) && Number.isInteger(state.round) && state.round >= 0,
};
