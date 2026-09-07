import { supabase } from "@/lib/supabase";
import type { GameDefinition, RoomSnapshot } from "@/lib/game-library";

const client = () => { if (!supabase) throw new Error("Multiplayer is not configured."); return supabase; };

export async function ensureGuest() {
  const db = client();
  const { data: { session } } = await db.auth.getSession();
  if (session) return session.user;
  const { data, error } = await db.auth.signInAnonymously();
  if (error) throw new Error("Guest sign-in is unavailable. Enable Anonymous Sign-Ins in Supabase Auth.");
  if (!data.user) throw new Error("Guest sign-in did not return a user.");
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
  const { data, error } = await client().from("rooms").select("id,code,status,game_id,game_version,game_state,active_team,amber_score,violet_score").eq("id", roomId).single();
  if (error) throw error;
  return data as RoomSnapshot;
}

export type CurrentRoomPlayer = { team: "amber" | "violet"; is_keeper: boolean };

export async function getCurrentRoomPlayer(roomId: string): Promise<CurrentRoomPlayer> {
  const user = await ensureGuest();
  const { data, error } = await client().from("room_players").select("team,is_keeper").eq("room_id", roomId).eq("user_id", user.id).single();
  if (error) throw error;
  return data as CurrentRoomPlayer;
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

async function invokeSignalRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as T;
}

export function signalStartRound(roomId: string, spectrum: { left: string; right: string }, target: number) {
  return invokeSignalRpc("signal_start_round", { p_room_id: roomId, p_spectrum: spectrum, p_target: target });
}

export function signalSubmitClue(roomId: string, clue: string) {
  return invokeSignalRpc("signal_submit_clue", { p_room_id: roomId, p_clue: clue });
}

export function signalSubmitTune(roomId: string, needle: number) {
  return invokeSignalRpc("signal_submit_tune", { p_room_id: roomId, p_needle: needle });
}

export function signalSubmitIntercept(roomId: string, intercept: "left" | "right") {
  return invokeSignalRpc("signal_submit_intercept", { p_room_id: roomId, p_intercept: intercept });
}

export function signalRevealRound(roomId: string) {
  return invokeSignalRpc("signal_reveal_round", { p_room_id: roomId });
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
