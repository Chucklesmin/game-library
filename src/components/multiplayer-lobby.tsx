"use client";

import { FormEvent, useEffect, useState } from "react";
import { createRoom, getCurrentRoomPlayer, getRoom, joinRoom, subscribeToRoom, subscribeToRoomEvents, type CurrentRoomPlayer } from "@/lib/game-room";
import type { RoomSnapshot } from "@/lib/game-library";
import { hasSupabase } from "@/lib/supabase";

type Props = { displayName: string; gameSlug: string; onRoomChange: (room: RoomSnapshot | null) => void; onRoleChange: (role: CurrentRoomPlayer | null) => void };

export function MultiplayerLobby({ displayName, gameSlug, onRoomChange, onRoleChange }: Props) {
  const [code, setCode] = useState(""), [room, setRoom] = useState<RoomSnapshot | null>(null), [message, setMessage] = useState("");
  useEffect(() => { if (!room?.id) return; return subscribeToRoom(room.id, setRoom); }, [room]);
  useEffect(() => { if (!room?.id) return; return subscribeToRoomEvents(room.id, (event) => setMessage(`Live: ${event.event_type}`)); }, [room]);
  useEffect(() => onRoomChange(room), [room, onRoomChange]);
  useEffect(() => { if (!room) { onRoleChange(null); return; } void getCurrentRoomPlayer(room.id).then(onRoleChange).catch((e: Error) => setMessage(e.message)); }, [room, onRoleChange]);
  const requireName = () => { if (!displayName.trim()) { setMessage("Choose a display name before joining a room."); return false; } return true; };
  const create = async () => { if (!requireName()) return; try { const next = await createRoom(gameSlug, displayName); setRoom(await getRoom(next.id)); setMessage(`Room ${next.code} is ready to share.`); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not create room."); } };
  const join = async (event: FormEvent) => { event.preventDefault(); if (!requireName()) return; try { const next = await joinRoom(code, displayName); setRoom(await getRoom(next.id)); setMessage(`Joined room ${next.code}.`); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not join room."); } };
  if (!hasSupabase) return <small>Multiplayer configuration will be available when Supabase environment values are set.</small>;
  if (room) return <div className="network-room"><span className="eyebrow">ROOM CODE</span><strong>{room.code}</strong><p>{room.status === "lobby" ? "Share this code, then start the round from the board." : `Live phase: ${room.status}`}</p><small>{message}</small></div>;
  return <div className="network-room"><button onClick={() => void create()}>Create Wavelength room</button><form onSubmit={join}><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ROOM CODE" maxLength={6} /><button>Join</button></form><small>{message || "Create a room or join friends with a code."}</small></div>;
}
