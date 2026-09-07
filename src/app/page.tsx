"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PACKS, type Spectrum } from "@/lib/packs";
import { MultiplayerLobby } from "@/components/multiplayer-lobby";
import type { RoomSnapshot } from "@/lib/game-library";
import { signalRevealRound, signalStartRound, signalSubmitClue, signalSubmitIntercept, signalSubmitTune } from "@/lib/game-room";

type Phase = "lobby" | "clue" | "tune" | "intercept" | "reveal";
type Side = "left" | "right";
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const allSpectra = () => PACKS.flatMap((pack) => pack.spectra);
const initialSpectrum = PACKS[0].spectra[0];
const initialTarget = 50;
const randomTarget = () => 12 + Math.floor(Math.random() * 77);
const randomSpectrum = () => { const set = allSpectra(); return set[Math.floor(Math.random() * set.length)]; };
function scoreGuess(needle: number, target: number) { const d = Math.abs(needle - target); return d <= 5 ? 4 : d <= 12 ? 3 : d <= 20 ? 2 : 0; }

function Dial({ needle, target, revealed, onChange, disabled }: { needle: number; target: number; revealed: boolean; onChange?: (value: number) => void; disabled?: boolean }) {
  const marker = (value: number) => ({ transform: `rotate(${-90 + value * 1.8}deg)` });
  return <div className="dial-wrap"><div className="dial" aria-label="Signal dial"><div className="dial-arc" />
    {revealed && <><i className="target-band band-2" style={{ ...marker(target), width: "40%" }} /><i className="target-band band-3" style={{ ...marker(target), width: "24%" }} /><i className="target-band band-4" style={{ ...marker(target), width: "10%" }} /></>}
    <div className="needle" style={marker(needle)}><span /></div><div className="dial-label left">0</div><div className="dial-label right">100</div></div>
    {onChange && <input aria-label="Tune the dial" className="dial-slider" type="range" min="0" max="100" value={needle} disabled={disabled} onChange={(event) => onChange(clamp(Number(event.target.value)))} />}</div>;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("lobby"), [name, setName] = useState(""), [liveRoom, setLiveRoom] = useState<RoomSnapshot | null>(null);
  const [spectrum, setSpectrum] = useState<Spectrum>(initialSpectrum), [target, setTarget] = useState(initialTarget), [needle, setNeedle] = useState(50), [clue, setClue] = useState(""), [intercept, setIntercept] = useState<Side | null>(null);
  const [scores, setScores] = useState({ amber: 0, violet: 0 }), [activeTeam, setActiveTeam] = useState<"amber" | "violet">("amber"), [notice, setNotice] = useState("Create a room or run a quick local round.");
  const liveState = (liveRoom?.game_state ?? {}) as Record<string, unknown>;
  const livePhase = liveState.phase === "reveal_pending" ? "intercept" : liveState.phase;
  const currentPhase = (liveRoom ? livePhase || "lobby" : phase) as Phase;
  const currentSpectrum = (liveRoom && liveState.spectrum ? liveState.spectrum : spectrum) as Spectrum;
  const currentTarget = typeof liveState.target === "number" ? liveState.target : target;
  const currentNeedle = typeof liveState.needle === "number" ? liveState.needle : needle;
  const currentScores = liveRoom ? { amber: liveRoom.amber_score, violet: liveRoom.violet_score } : scores;
  const otherTeam = activeTeam === "amber" ? "violet" : "amber";
  const revealScore = useMemo(() => scoreGuess(needle, target), [needle, target]);
  const opponentCorrect = Boolean(intercept && revealScore !== 4 && ((target < needle && intercept === "left") || (target > needle && intercept === "right")));
  const begin = () => { if (!name.trim()) return setNotice("Add a display name first."); setPhase("clue"); setNotice(`${name.trim()} is the Signal Keeper. The target is private on this device.`); };
  const reveal = () => { setScores((s) => ({ ...s, [activeTeam]: s[activeTeam] + revealScore, [otherTeam]: s[otherTeam] + (opponentCorrect ? 1 : 0) })); setPhase("reveal"); setNotice(revealScore ? `${activeTeam === "amber" ? "Amber" : "Violet"} gains ${revealScore}.` : "No signal locked this round."); };
  const nextTurn = () => { setActiveTeam(otherTeam); setSpectrum(randomSpectrum()); setTarget(randomTarget()); setNeedle(50); setClue(""); setIntercept(null); setPhase("clue"); setNotice("Switch teams and choose a new Signal Keeper."); };
  return <main className="shell"><header className="masthead"><Link className="brand" href="/">signal<span>.</span></Link><div className="tag">A free, original spectrum party game</div><button className="text-button" onClick={() => setPhase("lobby")}>How it works</button></header>
    <section className="game-layout"><aside className="sidebar"><div className="score-card"><p>FIRST TO 12</p><div className={`team amber ${activeTeam === "amber" ? "active" : ""}`}><b>AMBER</b><strong>{currentScores.amber}</strong></div><div className={`team violet ${activeTeam === "violet" ? "active" : ""}`}><b>VIOLET</b><strong>{currentScores.violet}</strong></div></div><div className="pack-card"><p>TONIGHT’S FREQUENCY</p><h3>{PACKS[0].name}</h3><span>{allSpectra().length} original spectra across {PACKS.length} packs</span></div></aside>
      <section className="board"><div className="phase"><span>{currentPhase === "lobby" ? "READY ROOM" : currentPhase.toUpperCase()}</span><i /></div><div className="spectrum"><span>{currentSpectrum.left}</span><div className="spectrum-line"><i /><i /><i /><i /><i /></div><span>{currentSpectrum.right}</span></div>
        {currentPhase === "clue" && <div className="private-panel"><div className="eyebrow">SIGNAL KEEPER ONLY</div><Dial needle={target} target={target} revealed /><p>Think of one clue that belongs on this spectrum. Then hide the target, say the clue, and hand over the device.</p><form onSubmit={(event) => { event.preventDefault(); if (!clue.trim()) return; if (liveRoom) void signalSubmitClue(liveRoom.id, clue).then(() => setNotice("Clue locked for everyone in the room.")).catch((e: Error) => setNotice(e.message)); else { setPhase("tune"); setNotice("Team discussion begins. Signal Keeper stays quiet."); } }}><input value={clue} onChange={(event) => setClue(event.target.value)} placeholder="Your one-clue signal…" maxLength={60} /><button>Lock clue</button></form></div>}
        {currentPhase === "tune" && <div className="play-panel"><div className="clue-bubble">“{String(liveState.clue ?? clue)}”</div><p>Discuss it. Tune the needle to the shared read of the clue.</p><Dial needle={needle} target={target} revealed={false} onChange={setNeedle} /><button onClick={() => { if (liveRoom) void signalSubmitTune(liveRoom.id, needle).then(() => setNotice("Needle locked. Rival team can intercept.")).catch((e: Error) => setNotice(e.message)); else setPhase("intercept"); }}>Finalize tune</button></div>}
        {currentPhase === "intercept" && <div className="play-panel"><div className="clue-bubble">Needle locked at {currentNeedle}</div><p>Rival team: is the true signal to the left or right?</p><div className="split-actions"><button className={intercept === "left" ? "selected" : ""} onClick={() => setIntercept("left")}>← Left</button><button className={intercept === "right" ? "selected" : ""} onClick={() => setIntercept("right")}>Right →</button></div><button disabled={!intercept} onClick={() => { if (liveRoom) void signalSubmitIntercept(liveRoom.id, intercept!).then(() => setNotice("Intercept locked. Host: score the reveal.")).catch((e: Error) => setNotice(e.message)); else reveal(); }}>Lock intercept</button>{liveRoom && liveState.phase === "reveal_pending" && <button onClick={() => void signalRevealRound(liveRoom.id).then(() => setNotice("Signal revealed.")).catch((e: Error) => setNotice(e.message))}>Host: score reveal</button>}</div>}
        {currentPhase === "reveal" && <div className="play-panel reveal"><Dial needle={currentNeedle} target={currentTarget} revealed /><h2>{liveRoom ? `${Number(liveState.activeScore ?? 0)} point signal` : revealScore ? `${revealScore} point${revealScore > 1 ? "s" : ""} for ${activeTeam}` : "Just outside the bands"}</h2><p>{liveRoom ? `Intercept: ${Number(liveState.interceptScore ?? 0)} point.` : opponentCorrect ? "The intercept landed: rival team gains 1." : revealScore === 4 ? "Perfect center blocks the rival intercept." : "No rival intercept point this time."}</p>{liveRoom ? <button onClick={() => { const nextSpectrum = randomSpectrum(), nextTarget = randomTarget(); setSpectrum(nextSpectrum); setTarget(nextTarget); setNeedle(50); setClue(""); setIntercept(null); void signalStartRound(liveRoom.id, nextSpectrum, nextTarget).then(() => setNotice("Next live round is ready for the keeper.")).catch((e: Error) => setNotice(e.message)); }}>Host: next live round</button> : <button onClick={nextTurn}>Start next turn</button>}</div>}
        {currentPhase === "lobby" && <div className="lobby"><div><div className="eyebrow">READ THE ROOM</div><h1>Find the frequency.</h1><p>One player sees a secret position. Everyone else reads their clue, makes a shared call, and tries to tune in.</p><div className="rules"><span><b>1</b> Keeper gives one clue</span><span><b>2</b> Team tunes the dial</span><span><b>3</b> Rivals intercept</span></div></div><form className="start-form" onSubmit={(event) => { event.preventDefault(); if (liveRoom) void signalStartRound(liveRoom.id, spectrum, target).then(() => setNotice("Live round started: only the host sees the target.")).catch((e: Error) => setNotice(e.message)); else begin(); }}><label>Your display name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Jordan" maxLength={24} /></label><button>{liveRoom ? "Start live round" : "Start a local game"}</button>{!liveRoom && <button className="secondary" type="button" onClick={() => { setName(name || "Guest"); begin(); }}>Quick start</button>}</form></div>}</section>
      <aside className="room-card"><div className="eyebrow">PLAY REMOTELY</div><h2>Bring your people.</h2><p>{liveRoom ? `Connected to room ${liveRoom.code}.` : "Create a private room, share its code, then use video or voice however you like."}</p><MultiplayerLobby displayName={name} onRoomChange={setLiveRoom} /><small>{notice}</small><hr /><h3>Original packs</h3><div className="pack-list">{PACKS.map((pack) => <span key={pack.id}>{pack.emoji} {pack.name}</span>)}</div></aside></section><footer>Signal is an independent, non-commercial game. No accounts, purchases, or tracking required for local play.</footer></main>;
}
