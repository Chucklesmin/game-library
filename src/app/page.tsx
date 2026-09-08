"use client";

import { useMemo, useState } from "react";
import { PACKS, type Spectrum } from "@/lib/packs";
import { MultiplayerLobby } from "@/components/multiplayer-lobby";
import type { RoomSnapshot } from "@/lib/game-library";
import { signalRevealRound, signalStartRound, signalSubmitClue, signalSubmitIntercept, signalSubmitTune, type CurrentRoomPlayer } from "@/lib/game-room";

type Phase = "library" | "clue" | "tune" | "intercept" | "reveal";
type Side = "left" | "right";
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const allSpectra = () => PACKS.flatMap((pack) => pack.spectra);
const randomTarget = () => 12 + Math.floor(Math.random() * 77);
const randomSpectrum = () => { const spectra = allSpectra(); return spectra[Math.floor(Math.random() * spectra.length)]; };
const scoreGuess = (needle: number, target: number) => { const distance = Math.abs(needle - target); return distance <= 5 ? 4 : distance <= 12 ? 3 : distance <= 20 ? 2 : 0; };

function pointOnArc(value: number, radius = 156) {
  const angle = Math.PI - (Math.PI * value) / 100;
  return { x: 200 + radius * Math.cos(angle), y: 190 - radius * Math.sin(angle) };
}

function Dial({ needle, target, revealed, onChange, disabled }: { needle: number; target: number; revealed: boolean; onChange?: (value: number) => void; disabled?: boolean }) {
  const needlePoint = pointOnArc(needle, 150);
  const targetStart = pointOnArc(clamp(target - 20));
  const targetEnd = pointOnArc(clamp(target + 20));
  const midStart = pointOnArc(clamp(target - 12));
  const midEnd = pointOnArc(clamp(target + 12));
  const centerStart = pointOnArc(clamp(target - 5));
  const centerEnd = pointOnArc(clamp(target + 5));
  return <div className="dial-wrap">
    <svg className="dial" viewBox="0 0 400 210" role="img" aria-label="Wavelength dial">
      <path className="dial-base" d="M44 190 A156 156 0 0 1 356 190" />
      {revealed && <><path className="dial-band outer" d={`M ${targetStart.x} ${targetStart.y} A156 156 0 0 1 ${targetEnd.x} ${targetEnd.y}`} /><path className="dial-band middle" d={`M ${midStart.x} ${midStart.y} A156 156 0 0 1 ${midEnd.x} ${midEnd.y}`} /><path className="dial-band center" d={`M ${centerStart.x} ${centerStart.y} A156 156 0 0 1 ${centerEnd.x} ${centerEnd.y}`} /></>}
      <line className="dial-needle" x1="200" y1="190" x2={needlePoint.x} y2={needlePoint.y} /><circle className="dial-hub" cx="200" cy="190" r="10" /><text x="30" y="207">0</text><text x="355" y="207">100</text>
    </svg>
    {onChange && <input aria-label="Tune the Wavelength dial" className="dial-slider" type="range" min="0" max="100" value={needle} disabled={disabled} onChange={(event) => onChange(clamp(Number(event.target.value)))} />}
  </div>;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("library"), [name, setName] = useState(""), [liveRoom, setLiveRoom] = useState<RoomSnapshot | null>(null), [liveRole, setLiveRole] = useState<CurrentRoomPlayer | null>(null);
  const [spectrum, setSpectrum] = useState<Spectrum>(PACKS[0].spectra[0]), [target, setTarget] = useState(50), [needle, setNeedle] = useState(50), [clue, setClue] = useState(""), [intercept, setIntercept] = useState<Side | null>(null);
  const [scores, setScores] = useState({ amber: 0, violet: 0 }), [activeTeam, setActiveTeam] = useState<"amber" | "violet">("amber"), [notice, setNotice] = useState("Choose a game, then invite your people.");
  const liveState = (liveRoom?.game_state ?? {}) as Record<string, unknown>;
  const livePhase = liveState.phase === "reveal_pending" ? "intercept" : liveState.phase;
  const currentPhase = (liveRoom ? livePhase === "lobby" ? "library" : livePhase || "library" : phase) as Phase;
  const currentSpectrum = (liveRoom && liveState.spectrum ? liveState.spectrum : spectrum) as Spectrum;
  const currentTarget = typeof liveState.target === "number" ? liveState.target : target;
  const currentNeedle = typeof liveState.needle === "number" ? liveState.needle : needle;
  const currentScores = liveRoom ? { amber: liveRoom.amber_score, violet: liveRoom.violet_score } : scores;
  const otherTeam = activeTeam === "amber" ? "violet" : "amber";
  const revealScore = useMemo(() => scoreGuess(needle, target), [needle, target]);
  const opponentCorrect = Boolean(intercept && revealScore !== 4 && ((target < needle && intercept === "left") || (target > needle && intercept === "right")));
  const begin = () => { if (!name.trim()) return setNotice("Add a display name first."); setPhase("clue"); setNotice(`${name.trim()} is the Wavelength Keeper. The target is private on this device.`); };
  const reveal = () => { setScores((score) => ({ ...score, [activeTeam]: score[activeTeam] + revealScore, [otherTeam]: score[otherTeam] + (opponentCorrect ? 1 : 0) })); setPhase("reveal"); };
  const nextTurn = () => { setActiveTeam(otherTeam); setSpectrum(randomSpectrum()); setTarget(randomTarget()); setNeedle(50); setClue(""); setIntercept(null); setPhase("clue"); };

  if (currentPhase === "library") return <main className="library-shell"><header><a className="brand" href="/">Game Library</a><span>Simple games for your people.</span></header><section className="library-hero"><p className="eyebrow">PLAY TOGETHER</p><h1>Pick a game.<br />Start talking.</h1><p className="lede">A small, growing collection of easy-to-learn multiplayer games.</p><article className="game-card"><div><p className="eyebrow">NOW PLAYING</p><h2>Wavelength</h2><p>Give one clue. Find the hidden spot. Get on the same wavelength.</p><span className="game-meta">2–8 players · 15 minutes</span></div><form onSubmit={(event) => { event.preventDefault(); if (liveRoom) void signalStartRound(liveRoom.id, spectrum, target).then(() => setNotice("Live Wavelength round started.")).catch((error: Error) => setNotice(error.message)); else begin(); }}><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Jordan" maxLength={24} /></label>{(!liveRoom || liveRole?.is_keeper) && <button>{liveRoom ? "Start live game" : "Play Wavelength"}</button>}</form></article></section><aside className="join-card"><p className="eyebrow">PLAY REMOTELY</p><MultiplayerLobby displayName={name} onRoomChange={setLiveRoom} onRoleChange={setLiveRole} /><small>{notice}</small></aside><footer>Game Library is free to play. No accounts, purchases, or tracking required for local games.</footer></main>;

  return <main className="game-shell"><header><button className="back-button" onClick={() => { setLiveRoom(null); setPhase("library"); }}>← Game Library</button><span className="game-title">Wavelength</span><span className="score">Amber {currentScores.amber} · Violet {currentScores.violet}</span></header><section className="game-board"><div className="spectrum"><span>{currentSpectrum.left}</span><div /><span>{currentSpectrum.right}</span></div>
    {currentPhase === "clue" && (liveRoom && !liveRole?.is_keeper ? <div className="panel"><p className="eyebrow">KEEPER&apos;S TURN</p><h1>Listen closely.</h1><p>The keeper is choosing a clue. The target stays private until the reveal.</p></div> : <div className="panel"><p className="eyebrow">KEEPER ONLY</p><Dial needle={target} target={target} revealed /><p>Think of one clue, share it, then pass the device.</p><form onSubmit={(event) => { event.preventDefault(); if (!clue.trim()) return; if (liveRoom) void signalSubmitClue(liveRoom.id, clue).then(() => setNotice("Clue locked for the room.")).catch((error: Error) => setNotice(error.message)); else setPhase("tune"); }}><input value={clue} onChange={(event) => setClue(event.target.value)} placeholder="Your clue" maxLength={60} /><button>Lock clue</button></form></div>)}
    {currentPhase === "tune" && <div className="panel"><p className="clue">“{String(liveState.clue ?? clue)}”</p><p>Talk it through, then place the needle together.</p>{(!liveRoom || liveRole?.team === liveRoom.active_team) && <><Dial needle={needle} target={target} revealed={false} onChange={setNeedle} /><button onClick={() => { if (liveRoom) void signalSubmitTune(liveRoom.id, needle).catch((error: Error) => setNotice(error.message)); else setPhase("intercept"); }}>Lock in</button></>}</div>}
    {currentPhase === "intercept" && <div className="panel"><p className="eyebrow">RIVAL TEAM</p><h1>Which side?</h1><p>The needle is at {currentNeedle}. Is the target left or right?</p>{(!liveRoom || liveRole?.team !== liveRoom.active_team) && <><div className="choices"><button className={intercept === "left" ? "selected" : ""} onClick={() => setIntercept("left")}>← Left</button><button className={intercept === "right" ? "selected" : ""} onClick={() => setIntercept("right")}>Right →</button></div><button disabled={!intercept} onClick={() => { if (liveRoom) void signalSubmitIntercept(liveRoom.id, intercept!).catch((error: Error) => setNotice(error.message)); else reveal(); }}>Lock intercept</button></>}{liveRoom && liveState.phase === "reveal_pending" && liveRole?.is_keeper && <button onClick={() => void signalRevealRound(liveRoom.id).catch((error: Error) => setNotice(error.message))}>Reveal score</button>}</div>}
    {currentPhase === "reveal" && <div className="panel"><Dial needle={currentNeedle} target={currentTarget} revealed /><h1>{liveRoom ? `${Number(liveState.activeScore ?? 0)} points` : revealScore ? `${revealScore} points` : "Just outside"}</h1><p>{liveRoom ? `Intercept: ${Number(liveState.interceptScore ?? 0)} point.` : opponentCorrect ? "The intercept landed." : "No intercept point this time."}</p><button onClick={() => { const nextSpectrum = randomSpectrum(), nextTarget = randomTarget(); setSpectrum(nextSpectrum); setTarget(nextTarget); setNeedle(50); setClue(""); setIntercept(null); if (liveRoom) void signalStartRound(liveRoom.id, nextSpectrum, nextTarget).catch((error: Error) => setNotice(error.message)); else nextTurn(); }}>Next round</button></div>}
  </section><small className="notice">{notice}</small></main>;
}
