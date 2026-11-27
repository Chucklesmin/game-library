import type { Metadata } from "next";
import { PulseVoteRoom } from "@/components/pulse-vote-room";

export const metadata: Metadata = {
  title: "Pulse Vote | Game Library",
  description: "Cast a private vote and see where the room lands.",
};

export default function PulseVotePage() {
  return <PulseVoteRoom />;
}
