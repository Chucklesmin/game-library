import type { GameAdapter } from "@/lib/game-library";

export type PulseVoteState = { phase: "prompt" | "vote" | "results"; promptIndex: number; votes: Record<string, string> };
export type PulseVoteAction =
  | { type: "open_vote" }
  | { type: "cast_vote"; voterId: string; choice: string }
  | { type: "reveal" }
  | { type: "next_prompt" };

export const pulseVoteGame: GameAdapter<PulseVoteState, PulseVoteAction> = {
  slug: "pulse-vote",
  initialState: () => ({ phase: "prompt", promptIndex: 0, votes: {} }),
  reduce: (state, action) => {
    if (action.type === "open_vote") return { ...state, phase: "vote", votes: {} };
    if (action.type === "cast_vote" && state.phase === "vote" && action.choice.trim()) return { ...state, votes: { ...state.votes, [action.voterId]: action.choice.trim() } };
    if (action.type === "reveal") return { ...state, phase: "results" };
    if (action.type === "next_prompt") return { phase: "prompt", promptIndex: state.promptIndex + 1, votes: {} };
    return state;
  },
  validate: (state) => ["prompt", "vote", "results"].includes(state.phase) && Number.isInteger(state.promptIndex) && state.promptIndex >= 0 && Object.values(state.votes).every((vote) => vote.length > 0),
};
