"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PACKS, type Spectrum } from "@/lib/packs";
import { MultiplayerLobby } from "@/components/multiplayer-lobby";
import type { RoomSnapshot } from "@/lib/game-library";

type Phase = "lobby" | "clue" | "tune" | "intercept" | "reveal";
type Side = "left" | "right";
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const allSpectra = () => PACKS.flatMap((pack) => pack.spectra);
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
  const [spectrum, setSpectrum] = useState<Spectrum>(() => randomSpectrum()), [target, setTarget] = useState(randomTarget()), [needle, setNeedle] = useState(50), [clue, setClue] = useState(""), [intercept, setIntercept] = useState<Side | null>(null);
  const [scores, setScores] = useState({ amber: 0, violet: 0 }), [activeTeam, setActiveTeam] = useState<"amber" | "violet">("amber"), [notice, setNotice] = useState("Create a room or run a quick local round.");
  const otherTeam = activeTeam === "amber" ? "violet" : "amber";
  const revealScore = useMemo(() => scoreGuess(needle, target), [needle, target]);
  const opponentCorrect = Boolean(intercept && revealScore !== 4 && ((target < needle && intercept === "left") || (target > needle && intercept === "right")));
  const begin = () => { if (!name.trim()) return setNotice("Add a display name first."); setPhase("clue"); setNotice(`${name.trim()} is the Signal Keeper. The target is private on this device.`); };
  const reveal = () => { setScores((s) => ({ ...s, [activeTeam]: s[activeTeam] + revealScore, [otherTeam]: s[otherTeam] + (opponentCorrect ? 1 : 0) })); setPhase("reveal"); setNotice(revealScore ? `${activeTeam === "amber" ? "Amber" : "Violet"} gains ${revealScore}.` : "No signal locked this round."); };
  const nextTurn = () => { setActiveTeam(otherTeam); setSpectrum(randomSpectrum()); setTarget(randomTarget()); setNeedle(50); setClue(""); setIntercept(null); setPhase("clue"); setNotice("Switch teams and choose a new Signal Keeper."); };
  return <main className="shell"><header className="masthead"><Link className="brand" href="/">signal<span>.</span></Link><div className="tag">A free, original spectrum party game</div><button className="text-button" onClick={() => setPhase("lobby")}>How it works</button></header>
    <section className="game-layout"><aside className="sidebar"><div className="score-card"><p>FIRST TO 12</p><div className={`team amber ${activeTeam === "amber" ? "active" : ""}`}><b>AMBER</b><strong>{scores.amber}</strong></div><div className={`team violet ${activeTeam === "violet" ? "active" : ""}`}><b>VIOLET</b><strong>{scores.violet}</strong></div></div><div className="pack-card"><p>TONIGHT’S FREQUENCY</p><h3>{PACKS[0].name}</h3><span>{allSpectra().length} original spectra across {PACKS.length} packs</span></div></aside>
      <section className="board"><div className="phase"><span>{phase === "lobby" ? "READY ROOM" : phase.toUpperCase()}</span><i /></div><div className="spectrum"><span>{spectrum.left}</span><div className="spectrum-line"><i /><i /><i /><i /><i /></div><span>{spectrum.right}</span></div>
        {phase === "clue" && <div className="private-panel"><div className="eyebrow">SIGNAL KEEPER ONLY</div><Dial needle={target} target={target} revealed /><p>Think of one clue that belongs on this spectrum. Then hide the target, say the clue, and hand over the device.</p><form onSubmit={(event) => { event.preventDefault(); if (clue.trim()) { setPhase("tune"); setNotice("Team discussion begins. Signal Keeper stays quiet."); } }}><input value={clue} onChange={(event) => setClue(event.target.value)} placeholder="Your one-clue signal…" maxLength={60} /><button>Lock clue</button></form></div>}
        {phase === "tune" && <div className="play-panel"><div className="clue-bubble">“{clue}”</div><p>Discuss it. Tune the needle to the shared read of the clue.</p><Dial needle={needle} target={target} revealed={false} onChange={setNeedle} /><button onClick={() => setPhase("intercept")}>Finalize tune</button></div>}
        {phase === "intercept" && <div className="play-panel"><div className="clue-bubble">Needle locked at {needle}</div><p>Rival team: is the true signal to the left or right?</p><div className="split-actions"><button className={intercept === "left" ? "selected" : ""} onClick={() => setIntercept("left")}>← Left</button><button className={intercept === "right" ? "selected" : ""} onClick={() => setIntercept("right")}>Right →</button></div><button disabled={!intercept} onClick={reveal}>Reveal the signal</button></div>}
        {phase === "reveal" && <div className="play-panel reveal"><Dial needle={needle} target={target} revealed /><h2>{revealScore ? `${revealScore} point${revealScore > 1 ? "s" : ""} for ${activeTeam}` : "Just outside the bands"}</h2><p>{opponentCorrect ? "The intercept landed: rival team gains 1." : revealScore === 4 ? "Perfect center blocks the rival intercept." : "No rival intercept point this time."}</p><button onClick={nextTurn}>Start next turn</button></div>}
        {phase === "lobby" && <div className="lobby"><div><div className="eyebrow">READ THE ROOM</div><h1>Find the frequency.</h1><p>One player sees a secret position. Everyone else reads their clue, makes a shared call, and tries to tune in.</p><div className="rules"><span><b>1</b> Keeper gives one clue</span><span><b>2</b> Team tunes the dial</span><span><b>3</b> Rivals intercept</span></div></div><form className="start-form" onSubmit={(event) => { event.preventDefault(); begin(); }}><label>Your display name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Jordan" maxLength={24} /></label><button>Start a local game</button><button className="secondary" type="button" onClick={() => { setName(name || "Guest"); begin(); }}>Quick start</button></form></div>}</section>
      <aside className="room-card"><div className="eyebrow">PLAY REMOTELY</div><h2>Bring your people.</h2><p>{liveRoom ? `Connected to room ${liveRoom.code}.` : "Create a private room, share its code, then use video or voice however you like."}</p><MultiplayerLobby displayName={name} onRoomChange={setLiveRoom} /><small>{notice}</small><hr /><h3>Original packs</h3><div className="pack-list">{PACKS.map((pack) => <span key={pack.id}>{pack.emoji} {pack.name}</span>)}</div></aside></section><footer>Signal is an independent, non-commercial game. No accounts, purchases, or tracking required for local play.</footer></main>;
}
