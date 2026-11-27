import { notFound } from "next/navigation";
import { RoadmapRoom } from "@/components/roadmap-room";
import { findRoadmapGame } from "@/lib/roadmap/registry";
import { roadmapConfigured } from "@/lib/roadmap/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/games/[slug]">) {
  const game = findRoadmapGame((await params).slug);
  return game ? { title: `${game.title} | Game Library`, description: game.description } : {};
}

export default async function GamePage({ params, searchParams }: PageProps<"/games/[slug]">) {
  const game = findRoadmapGame((await params).slug);
  if (!game) notFound();
  const { slug, title, description, minimumPlayers, maximumPlayers, instructions } = game;
  const { code } = await searchParams;
  return <RoadmapRoom game={{ slug, title, description, minimumPlayers, maximumPlayers, instructions }}
    configured={roadmapConfigured()} inviteCode={typeof code === "string" ? code : ""} />;
}
