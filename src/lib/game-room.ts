import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
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
  const { data, error } = await client().from("rooms").select("id,code,status,host_id,game_id,game_version,game_state,group_score").eq("id", roomId).single();
  if (error) throw error;
  return data as RoomSnapshot;
}

export type CurrentRoomPlayer = { userId: string };
export type RoomPlayer = { userId: string; displayName: string };

export async function getCurrentRoomPlayer(roomId: string): Promise<CurrentRoomPlayer> {
  const user = await ensureGuest();
  const { data, error } = await client().from("room_players").select("user_id").eq("room_id", roomId).eq("user_id", user.id).single();
  if (error) throw error;
  return { userId: data.user_id } as CurrentRoomPlayer;
}

export async function listRoomPlayers(roomId: string): Promise<RoomPlayer[]> {
  const { data, error } = await client().from("room_players").select("user_id,display_name").eq("room_id", roomId).order("joined_at");
  if (error) throw error;
  return (data ?? []).map((player) => ({ userId: player.user_id, displayName: player.display_name }));
}

export async function getCurrentWavelengthRound(roomId: string): Promise<{ id: string; target: number } | null> {
  const { data, error } = await client().from("rounds").select("id,target").eq("room_id", roomId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as { id: string; target: number } | null;
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

export function wavelengthStartGame(roomId: string, packSlug: string, totalRounds: number) {
  return invokeSignalRpc("wavelength_start_game", { p_room_id: roomId, p_pack_slug: packSlug, p_total_rounds: totalRounds });
}

export function wavelengthStartRound(roomId: string) {
  return invokeSignalRpc("wavelength_start_round", { p_room_id: roomId });
}

export function wavelengthSubmitClue(roomId: string, clue: string) {
  return invokeSignalRpc("wavelength_submit_clue", { p_room_id: roomId, p_clue: clue });
}

export function wavelengthSubmitTune(roomId: string, needle: number) {
  return invokeSignalRpc("wavelength_submit_tune", { p_room_id: roomId, p_needle: needle });
}

export function wavelengthRevealRound(roomId: string) {
  return invokeSignalRpc("wavelength_reveal_round", { p_room_id: roomId });
}

export function wavelengthTimeoutPhase(roomId: string) {
  return invokeSignalRpc("wavelength_timeout_phase", { p_room_id: roomId });
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

export type WavelengthPreview = { playerId: string; position: number; sequence: number; receivedAt: number };

const previewTopic = (roomId: string, roundId: string, playerId: string) => `wavelength-preview:${roomId}:${roundId}:${playerId}`;

export function createWavelengthPreviewPublisher(roomId: string, roundId: string, playerId: string) {
  const channel = client().channel(previewTopic(roomId, roundId, playerId), { config: { private: true } }).subscribe();
  return {
    send: (position: number, sequence: number) => channel.send({ type: "broadcast", event: "slider-preview", payload: { roundId, position, sequence } }),
    dispose: () => { void client().removeChannel(channel); },
  };
}

export function subscribeToWavelengthPreviews(roomId: string, roundId: string, playerIds: string[], onPreview: (preview: WavelengthPreview) => void) {
  const db = client();
  const channels: RealtimeChannel[] = playerIds.map((playerId) => db.channel(previewTopic(roomId, roundId, playerId), { config: { private: true } })
    .on("broadcast", { event: "slider-preview" }, ({ payload }) => {
      if (payload?.roundId !== roundId || typeof payload.position !== "number" || typeof payload.sequence !== "number") return;
      onPreview({ playerId, position: Math.max(0, Math.min(100, payload.position)), sequence: payload.sequence, receivedAt: Date.now() });
    }).subscribe());
  return () => { channels.forEach((channel) => { void db.removeChannel(channel); }); };
}
