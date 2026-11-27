export const PULSE_VOTE_SLUG = "pulse-vote";
export const PULSE_MIN_PLAYERS = 3;
export const PULSE_MAX_PLAYERS = 8;
export const PULSE_MAX_ROUNDS = 10;
export const PULSE_DEFAULT_ROUNDS = 5;

export type PulseVotePlayer = { id: string; name: string; score: number; rank: number };
export type PulseVoteView = {
  roomId: string;
  code: string;
  isHost: boolean;
  hostId: string;
  phase: "lobby" | "vote" | "reveal" | "complete";
  roundId: string | null;
  round: number | null;
  totalRounds: number | null;
  prompt: { question: string; choices: string[] } | null;
  players: PulseVotePlayer[];
  myChoice: number | null;
  result: { counts: number[]; winners: number[] } | null;
};

export type PulseVoteMove =
  | { action: "start"; value: number }
  | { action: "vote"; value: number }
  | { action: "close" | "next" };
