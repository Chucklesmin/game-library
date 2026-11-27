import { findRoadmapGame } from "@/lib/roadmap/registry";
import { getRoadmapRoom, postRoadmapRoom, RoomError } from "@/lib/roadmap/server";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function handle(request: Request, slug: string, operation: typeof getRoadmapRoom) {
  const game = findRoadmapGame(slug);
  if (!game) return json({ error: "Game not found." }, 404);
  try {
    return json(await operation(request, game));
  } catch (error) {
    if (error instanceof RoomError) return json({ error: error.message }, error.status);
    return json({ error: "The game could not load. Try again." }, 500);
  }
}

export async function GET(request: Request, context: RouteContext<"/api/games/[slug]">) {
  return handle(request, (await context.params).slug, getRoadmapRoom);
}

export async function POST(request: Request, context: RouteContext<"/api/games/[slug]">) {
  return handle(request, (await context.params).slug, postRoadmapRoom);
}
