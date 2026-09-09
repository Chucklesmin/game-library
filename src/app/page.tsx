"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PACKS, type Spectrum } from "@/lib/packs";
import { MultiplayerLobby } from "@/components/multiplayer-lobby";
import type { RoomSnapshot } from "@/lib/game-library";
import { getCurrentRoomPlayer, subscribeToRoom, wavelengthRevealRound, wavelengthStartRound, wavelengthSubmitClue, wavelengthSubmitTune, type CurrentRoomPlayer } from "@/lib/game-room";

type Phase = "library" | "game" | "clue" | "tune" | "reveal_pending" | "reveal";
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const allSpectra = () => PACKS.flatMap((pack) => pack.spectra);
const randomTarget = () => 12 + Math.floor(Math.random() * 77);
const randomSpectrum = () => { const spectra = allSpectra(); return spectra[Math.floor(Math.random() * spectra.length)]; };
const scoreGuess = (needle: number, target: number) => { const distance = Math.abs(needle - target); return distance <= 5 ? 4 : distance <= 12 ? 3 : distance <= 20 ? 2 : 0; };

function pointOnArc(value: number, radius = 156) { const angle = Math.PI - (Math.PI * value) / 100; return { x: 200 + radius * Math.cos(angle), y: 190 - radius * Math.sin(angle) }; }

function Dial({ needle, target, revealed, onChange }: { needle: number; target: number; revealed: boolean; onChange?: (value: number) => void }) {
  const needlePoint = pointOnArc(needle, 150), targetStart = pointOnArc(clamp(target - 20)), targetEnd = pointOnArc(clamp(target + 20)), midStart = pointOnArc(clamp(target - 12)), midEnd = pointOnArc(clamp(target + 12)), centerStart = pointOnArc(clamp(target - 5)), centerEnd = pointOnArc(clamp(target + 5));
  return <div className="dial-wrap"><svg className="dial" viewBox="0 0 400 210" role="img" aria-label="Wavelength dial"><path className="dial-base" d="M44 190 A156 156 0 0 1 356 190" />{revealed && <><path className="dial-band outer" d={`M ${targetStart.x} ${targetStart.y} A156 156 0 0 1 ${targetEnd.x} ${targetEnd.y}`} /><path className="dial-band middle" d={`M ${midStart.x} ${midStart.y} A156 156 0 0 1 ${midEnd.x} ${midEnd.y}`} /><path className="dial-band center" d={`M ${centerStart.x} ${centerStart.y} A156 156 0 0 1 ${centerEnd.x} ${centerEnd.y}`} /></>}<line className="dial-needle" x1="200" y1="190" x2={needlePoint.x} y2={needlePoint.y} /><circle className="dial-hub" cx="200" cy="190" r="10" /><text x="30" y="207">0</text><text x="355" y="207">100</text></svg>{onChange && <input aria-label="Tune the Wavelength dial" className="dial-slider" type="range" min="0" max="100" value={needle} onChange={(event) => onChange(clamp(Number(event.target.value)))} />}</div>;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("library"), [name, setName] = useState(""), [liveRoom, setLiveRoom] = useState<RoomSnapshot | null>(null), [liveRole, setLiveRole] = useState<CurrentRoomPlayer | null>(null);
  const [spectrum, setSpectrum] = useState<Spectrum>(PACKS[0].spectra[0]), [target, setTarget] = useState(50), [needle, setNeedle] = useState(50), [clue, setClue] = useState(""), [groupScore, setGroupScore] = useState(0), [notice, setNotice] = useState("Choose a game, then invite your people.");
  const liveRoomId = liveRoom?.id;
  useEffect(() => { if (!liveRoomId) return; void getCurrentRoomPlayer(liveRoomId).then(setLiveRole).catch((error: Error) => setNotice(error.message)); }, [liveRoomId]);
  useEffect(() => { if (!liveRoomId) return; return subscribeToRoom(liveRoomId, setLiveRoom); }, [liveRoomId]);
  const liveState = (liveRoom?.game_state ?? {}) as Record<string, unknown>;
  const currentPhase = (liveRoom ? liveState.phase === "lobby" ? "game" : liveState.phase || "game" : phase) as Phase;
  const currentSpectrum = (liveRoom && liveState.spectrum ? liveState.spectrum : spectrum) as Spectrum;
  const currentTarget = typeof liveState.target === "number" ? liveState.target : target;
  const currentNeedle = typeof liveState.needle === "number" ? liveState.needle : needle;
  const currentScore = liveRoom ? liveRoom.group_score : groupScore;
  const isLiveKeeper = Boolean(liveRole && liveState.keeperId === liveRole.userId);
  const revealScore = useMemo(() => scoreGuess(needle, target), [needle, target]);
  const resetLocalRound = () => { setSpectrum(randomSpectrum()); setTarget(randomTarget()); setNeedle(50); setClue(""); setPhase("clue"); };
  const begin = () => { if (!name.trim()) return setNotice("Add a display name first."); setPhase("clue"); setNotice(`${name.trim()} is the Keeper. The target is private on this device.`); };
  const revealLocal = () => { setGroupScore((score) => score + revealScore); setPhase("reveal"); };
  const copyRoomCode = async () => { if (!liveRoom) return; try { await navigator.clipboard.writeText(liveRoom.code); setNotice("Room code copied. Send it to your friends."); } catch { setNotice(`Share room code ${liveRoom.code}.`); } };
  const startLiveRound = () => { if (liveRoom) void wavelengthStartRound(liveRoom.id).catch((error: Error) => setNotice(error.message)); };

  if (currentPhase === "library") return <main className="library-shell"><header><Link className="brand" href="/">Game Library</Link><span>Simple games for your people.</span></header><section className="library-hero"><p className="eyebrow">PLAY TOGETHER</p><h1>Choose your game.</h1><p className="lede">Every game gets its own card. Pick one to see how you want to play.</p><div className="game-grid"><article className="game-card"><div><p className="eyebrow">READY TO PLAY</p><h2>Wavelength</h2><p>Give one clue. Find the hidden spot. Get on the same wavelength.</p><span className="game-meta">2–8 players · 15 minutes</span></div><button onClick={() => setPhase("game")}>Open Wavelength</button></article><article className="game-card coming-soon"><div><p className="eyebrow">UP NEXT</p><h2>Pulse Vote</h2><p>Make a private prediction, then see where the room lands.</p><span className="game-meta">3–8 players · coming soon</span></div><button disabled>Coming soon</button></article></div></section><footer>Game Library is free to play. No accounts, purchases, or tracking required for local games.</footer></main>;

  if (currentPhase === "game") return <main className="game-shell"><header><button className="back-button" onClick={() => { setLiveRoom(null); setLiveRole(null); setPhase("library"); }}>← Home</button><span className="game-title">Wavelength</span><span className="score">2–8 players</span></header><section className="game-choice"><p className="eyebrow">WAVELENGTH</p>{liveRoom ? <><h1>Your room is ready.</h1><p>Share the code, then begin. One Keeper sets the target each round; everyone else plays together for one shared score.</p><div className="room-ready"><div><span className="eyebrow">ROOM CODE</span><strong>{liveRoom.code}</strong></div><button className="copy-button" onClick={() => void copyRoomCode()}>Copy code</button><p>{liveRole ? "You&apos;re in the room. Anyone can begin the first round." : "Confirming your room…"}</p><button onClick={startLiveRound}>Start Wavelength</button></div></> : <><h1>How do you want to play?</h1><p>Pass one device around, or make a private room and bring friends in remotely.</p><label className="name-field">Display name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Jordan" maxLength={24} /></label><div className="play-options"><article><h2>In the room</h2><p>Take turns as Keeper and play for a shared score.</p><button onClick={begin}>Start local game</button></article><article><h2>Online</h2><p>Create a private room or join one with a code.</p><MultiplayerLobby displayName={name} gameSlug="signal-spectrum" onRoomChange={setLiveRoom} onRoleChange={setLiveRole} /></article></div></>}<small className="notice">{notice}</small></section></main>;

  return <main className="game-shell"><header><button className="back-button" onClick={() => { setLiveRoom(null); setLiveRole(null); setPhase("library"); }}>← Home</button><span className="game-title">Wavelength</span><span className="score">Group score {currentScore}</span></header><section className="game-board"><div className="spectrum"><span>{currentSpectrum.left}</span><div /><span>{currentSpectrum.right}</span></div>
    {currentPhase === "clue" && (liveRoom && !isLiveKeeper ? <div className="panel"><p className="eyebrow">KEEPER&apos;S TURN</p><h1>Listen closely.</h1><p>The Keeper is choosing a clue. The target stays private until the reveal.</p></div> : <div className="panel"><p className="eyebrow">KEEPER ONLY</p><Dial needle={target} target={target} revealed /><p>Think of one clue, share it, then let the group tune the dial.</p><form onSubmit={(event) => { event.preventDefault(); if (!clue.trim()) return; if (liveRoom) void wavelengthSubmitClue(liveRoom.id, spectrum, target, clue).catch((error: Error) => setNotice(error.message)); else setPhase("tune"); }}><input value={clue} onChange={(event) => setClue(event.target.value)} placeholder="Your clue" maxLength={60} /><button>Share clue</button></form></div>)}
    {currentPhase === "tune" && <div className="panel"><p className="clue">“{String(liveState.clue ?? clue)}”</p>{liveRoom && isLiveKeeper ? <p>The group is discussing and setting the dial.</p> : <><p>Talk it through, then lock the group&apos;s dial position.</p><Dial needle={needle} target={target} revealed={false} onChange={setNeedle} /><button onClick={() => { if (liveRoom) void wavelengthSubmitTune(liveRoom.id, needle).catch((error: Error) => setNotice(error.message)); else setPhase("reveal_pending"); }}>Lock in</button></>}</div>}
    {currentPhase === "reveal_pending" && <div className="panel"><p className="eyebrow">DIAL LOCKED</p><h1>Ready for the reveal?</h1><p>{liveRoom && !isLiveKeeper ? "The Keeper is revealing the shared score." : "The Keeper can reveal the shared score now."}</p>{(!liveRoom || isLiveKeeper) && <button onClick={() => { if (liveRoom) void wavelengthRevealRound(liveRoom.id).catch((error: Error) => setNotice(error.message)); else revealLocal(); }}>Reveal score</button>}</div>}
    {currentPhase === "reveal" && <div className="panel"><Dial needle={currentNeedle} target={currentTarget} revealed /><h1>{liveRoom ? `${Number(liveState.points ?? 0)} points` : revealScore ? `${revealScore} points` : "Just outside"}</h1><p>Group score: {currentScore}</p><button onClick={() => { if (liveRoom) startLiveRound(); else resetLocalRound(); }}>Next round</button></div>}
  </section><small className="notice">{notice}</small></main>;
}
