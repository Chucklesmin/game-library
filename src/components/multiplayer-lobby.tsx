"use client";

import { FormEvent, useEffect, useState } from "react";
import { createRoom, getRoom, joinRoom, listGames, subscribeToRoom, updateRoomState } from "@/lib/game-room";
import type { GameDefinition, RoomSnapshot } from "@/lib/game-library";
import { hasSupabase } from "@/lib/supabase";

type Props = { displayName: string; onRoomChange: (room: RoomSnapshot | null) => void };

export function MultiplayerLobby({ displayName, onRoomChange }: Props) {
  const [games, setGames] = useState<GameDefinition[]>([]), [gameSlug, setGameSlug] = useState("signal-spectrum"), [code, setCode] = useState(""), [room, setRoom] = useState<RoomSnapshot | null>(null), [message, setMessage] = useState("");
  useEffect(() => { if (hasSupabase) void listGames().then(setGames).catch((e: Error) => setMessage(e.message)); }, []);
  useEffect(() => { if (!room?.id) return; return subscribeToRoom(room.id, setRoom); }, [room]);
  useEffect(() => onRoomChange(room), [room, onRoomChange]);
  const requireName = () => { if (!displayName.trim()) { setMessage("Choose a display name before joining a room."); return false; } return true; };
  const create = async () => { if (!requireName()) return; try { const next = await createRoom(gameSlug, displayName); setRoom(next); setMessage(`Room ${next.code} is ready to share.`); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not create room."); } };
  const join = async (event: FormEvent) => { event.preventDefault(); if (!requireName()) return; try { const next = await joinRoom(code, displayName); setRoom(await getRoom(next.id)); setMessage(`Joined room ${next.code}.`); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not join room."); } };
  if (!hasSupabase) return <small>Multiplayer configuration will be available when Supabase environment values are set.</small>;
  if (room) return <div className="network-room"><span className="eyebrow">ROOM CODE</span><strong>{room.code}</strong><p>{room.status === "lobby" ? "Share this code, then start when everyone is in." : `Live phase: ${room.status}`}</p><button onClick={() => void updateRoomState(room.id, "clue", { phase: "clue", round: 1 }).then(setRoom).catch((e: Error) => setMessage(e.message))}>Start Signal</button><small>{message}</small></div>;
  return <div className="network-room"><label>Game<select value={gameSlug} onChange={(e) => setGameSlug(e.target.value)}>{games.map((game) => <option key={game.id} value={game.slug}>{game.name}</option>)}</select></label><button onClick={() => void create()}>Create multiplayer room</button><form onSubmit={join}><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ROOM CODE" maxLength={6} /><button>Join</button></form><small>{message || "Create a room or join friends with a code."}</small></div>;
}
