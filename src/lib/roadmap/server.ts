import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { GameAction, GameContext, GameDefinition, GameView, Player, RoomView } from "./contract";

type Room = {
  id: string;
  code: string;
  slug: string;
  revision: number;
  host_id: string;
  players: Player[];
  state: unknown | null;
  match_id: string | null;
};

export class RoomError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const authOptions = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };

export function roadmapConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.ROADMAP_RPC_TOKEN);
}

async function authenticate(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serverToken = process.env.ROADMAP_RPC_TOKEN;
  if (!url || !publicKey || !serverToken) throw new RoomError("Game rooms are temporarily unavailable.", 503);
  const token = request.headers.get("authorization")?.match(/^Bearer ([\w.-]+)$/i)?.[1];
  if (!token) throw new RoomError("Sign in as a guest to continue.", 401);

  const auth = createClient(url, publicKey, { auth: authOptions });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) throw new RoomError("Your guest session expired. Reopen the room to reconnect.", 401);
  return {
    service: createClient(url, publicKey, {
      auth: authOptions,
      global: { headers: { Authorization: `Bearer ${token}`, "x-roadmap-server-token": serverToken } },
    }),
    actorId: data.user.id,
  };
}

type Service = Awaited<ReturnType<typeof authenticate>>["service"];

function project(room: Room, game: GameDefinition<unknown>, actorId: string, now = Date.now()) {
  const context: GameContext = { players: room.players, actorId, hostId: room.host_id, now };
  const view = room.state === null ? null : game.view(room.state, context);
  const turn = turnKey(room, view);
  return { context, view, turn };
}

function turnKey(room: Room, view: GameView | null) {
  if (!view) return null;
  return createHash("sha256")
    .update(JSON.stringify([room.match_id, view.phase, view.round, view.deadline]))
    .digest("base64url");
}

function roomView(room: Room, game: GameDefinition<unknown>, actorId: string): RoomView {
  const { view, turn } = project(room, game, actorId);
  return {
    id: room.id, code: room.code, revision: room.revision, players: room.players,
    hostId: room.host_id, isHost: room.host_id === actorId, turn, game: view,
  };
}

async function loadRoom(service: Service, id: string, slug: string) {
  const { data, error } = await service.rpc("roadmap_server_load", { p_id: id, p_slug: slug });
  if (error) throw new RoomError("Could not load this room.", 503);
  if (!data) throw new RoomError("This room is unavailable for your guest session.", 404);
  return data as Room;
}

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

async function readCommand(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > 18000) throw new RoomError("Move is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RoomError("Send a room command.", 400);
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 18000) throw new RoomError("Move is too large.", 413);
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RoomError) {
      await reader.cancel();
      throw error;
    }
    throw new RoomError("This room command could not be read.", 400);
  } finally {
    reader.releaseLock();
  }
}

function parseAction(body: Record<string, unknown>): GameAction {
  const { action, values } = body;
  if (typeof action !== "string" || action.length > 100 ||
    !values || typeof values !== "object" || Array.isArray(values)) {
    throw new RoomError("Choose a valid move.", 400);
  }
  const entries = Object.entries(values);
  if (entries.length > 12 || entries.some(([key, value]) =>
    !/^[\w-]{1,40}$/.test(key) || typeof value !== "string" || value.length > 16000)) {
    throw new RoomError("Move values are invalid.", 400);
  }
  return { id: action, values: Object.assign(Object.create(null), Object.fromEntries(entries)) };
}

export async function getRoadmapRoom(request: Request, game: GameDefinition<unknown>) {
  const id = new URL(request.url).searchParams.get("room");
  if (!isUuid(id)) throw new RoomError("Choose a room to open.", 400);
  const { service, actorId } = await authenticate(request);
  const room = await loadRoom(service, id, game.slug);
  return roomView(room, game, actorId);
}

export async function postRoadmapRoom(request: Request, game: GameDefinition<unknown>) {
  const { service, actorId } = await authenticate(request);
  const body = await readCommand(request);
  if (body.operation === "create" || body.operation === "join") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!name || [...name].length > 24) throw new RoomError("Choose a display name of 1–24 characters.", 400);
    if (body.operation === "join" && !/^[0-9A-F]{6}$/.test(code)) throw new RoomError("Enter the six-character room code.", 400);
    const { data, error } = await service.rpc("roadmap_server_open", {
      p_slug: game.slug, p_name: name, p_max: game.maximumPlayers,
      p_code: body.operation === "join" ? code : null,
    });
    if (error?.code === "P0001") throw new RoomError(error.message, 409);
    if (error || !data) throw new RoomError("Could not open this room.", 503);
    return roomView(data as Room, game, actorId);
  }

  if (body.operation !== "move" || !isUuid(body.room)) throw new RoomError("Choose a room action.", 400);
  const action = parseAction(body);
  const starting = action.id === "$start";
  // Distinct players can act simultaneously in the same turn. On contention,
  // reload the state and rerun the rules before committing another revision.
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const room = await loadRoom(service, body.room, game.slug);
    const { context, view, turn } = project(room, game, actorId);
    if (body.turn !== turn) throw new RoomError("The game has moved on. Try the current turn.", 409);
    let state: unknown;
    try {
      if (starting) {
        if (room.host_id !== actorId) throw new Error("Only the host can start a match.");
        if (view && !view.finished) throw new Error("A match is already in progress.");
        if (room.players.length < game.minimumPlayers || room.players.length > game.maximumPlayers) {
          throw new Error("The room does not have the required number of players.");
        }
        state = game.create(context);
      } else {
        if (!view || !view.controls.some((control) => control.id === action.id) &&
          view.drawing?.strokeAction !== action.id) throw new Error("This move is unavailable in the current turn.");
        state = game.act(room.state, context, action);
      }
    } catch (error) {
      throw new RoomError(error instanceof Error ? error.message : "This move is not available.", 409);
    }
    const { data, error } = await service.rpc("roadmap_server_commit", {
      p_id: room.id, p_revision: room.revision, p_state: state,
      p_match: starting ? randomUUID() : room.match_id,
    });
    if (error) throw new RoomError("Could not save this move.", 503);
    if (data) return roomView(data as Room, game, actorId);
  }
  throw new RoomError("Several moves arrived together. Try your move again.", 409);
}
