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

export function subscribeToRoom(roomId: string, onUpdate: (room: RoomSnapshot) => void) {
  const db = client();
  const channel = db.channel(`room:${roomId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, (event) => onUpdate(event.new as RoomSnapshot)).subscribe();
  return () => { void db.removeChannel(channel); };
}
