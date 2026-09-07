import { supabase } from "@/lib/supabase";
import type { GameDefinition, RoomSnapshot } from "@/lib/game-library";

const client = () => { if (!supabase) throw new Error("Multiplayer is not configured."); return supabase; };

export async function ensureGuest() {
  const db = client();
  const { data: { session } } = await db.auth.getSession();
  if (session) return session.user;
  const { data, error } = await db.auth.signInAnonymously();
  if (error) throw new Error("Guest sign-in is unavailable. Enable Anonymous Sign-Ins in Supabase Auth.");
  return data.user;
}

export async function listGames(): Promise<GameDefinition[]> {
  await ensureGuest();
  const { data, error } = await client().from("games").select("id,slug,name,summary,game_type,ruleset_version,config").eq("is_published", true).order("name");
  if (error) throw error;
  return (data ?? []) as GameDefinition[];
}

export async function createRoom(gameSlug: string, displayName: string) {
  await ensureGuest();
  const { data, error } = await client().rpc("create_room_for_game", { p_game_slug: gameSlug, p_display_name: displayName });
  if (error) throw error;
  return data as RoomSnapshot;
}

export async function joinRoom(code: string, displayName: string) {
  await ensureGuest();
  const { data, error } = await client().rpc("join_room_by_code", { p_code: code.toUpperCase(), p_display_name: displayName });
  if (error) throw error;
  return data as RoomSnapshot;
}

export async function getRoom(roomId: string): Promise<RoomSnapshot> {
  const { data, error } = await client().from("rooms").select("id,code,status,game_id,game_version,game_state,amber_score,violet_score").eq("id", roomId).single();
  if (error) throw error;
  return data as RoomSnapshot;
}

export async function updateRoomState(roomId: string, status: string, state: Record<string, unknown>) {
  const { data, error } = await client().rpc("update_room_state", { p_room_id: roomId, p_status: status, p_game_state: state });
  if (error) throw error;
  return data as RoomSnapshot;
}

export async function appendRoomEvent(roomId: string, eventType: string, payload: Record<string, unknown>) {
  const { data, error } = await client().rpc("append_room_event", { p_room_id: roomId, p_event_type: eventType, p_payload: payload });
  if (error) throw error;
  return data;
}

export function subscribeToRoom(roomId: string, onUpdate: (room: RoomSnapshot) => void) {
  const db = client();
  const channel = db.channel(`room:${roomId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, (event) => onUpdate(event.new as RoomSnapshot)).subscribe();
  return () => { void db.removeChannel(channel); };
}

export function subscribeToRoomEvents(roomId: string, onEvent: (event: { event_type: string; payload: Record<string, unknown>; actor_id: string }) => void) {
  const db = client();
  const channel = db.channel(`room-events:${roomId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "room_events", filter: `room_id=eq.${roomId}` }, (event) => onEvent(event.new as { event_type: string; payload: Record<string, unknown>; actor_id: string })).subscribe();
  return () => { void db.removeChannel(channel); };
}
