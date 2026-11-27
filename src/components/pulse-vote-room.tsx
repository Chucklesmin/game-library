"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createRoom, ensureGuest, getPulseVoteView, joinPulseVoteRoom, movePulseVote, subscribeToRoom } from "@/lib/game-room";
import {
  PULSE_DEFAULT_ROUNDS, PULSE_MAX_PLAYERS, PULSE_MAX_ROUNDS, PULSE_MIN_PLAYERS, PULSE_VOTE_SLUG,
  type PulseVoteMove, type PulseVoteView,
} from "@/lib/pulse-vote-game";
import { hasSupabase } from "@/lib/supabase";
import { readableErrorMessage } from "@/lib/error-message.mjs";
import styles from "./pulse-vote-room.module.css";

const resumeKey = "game-library:pulse-vote-room";
const voteShare = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 });

function RoundSettings({ label, onStart, disabled }: {
  label: string;
  onStart: (rounds: number) => void;
  disabled: boolean;
}) {
  const [rounds, setRounds] = useState(PULSE_DEFAULT_ROUNDS);
  return <form className={styles.controls} onSubmit={(event) => { event.preventDefault(); onStart(rounds); }}>
    <label>Rounds
      <select value={rounds} onChange={(event) => setRounds(Number(event.target.value))} disabled={disabled}>
        {Array.from({ length: PULSE_MAX_ROUNDS }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
      </select>
    </label>
    <button disabled={disabled}>{label}</button>
  </form>;
}

function Ballot({ view, busy, onVote }: { view: PulseVoteView; busy: boolean; onVote: (choice: number) => void }) {
  const [choice, setChoice] = useState<number | null>(null);
  if (!view.prompt) return null;
  if (view.myChoice !== null) return <p role="status">Vote locked in. You chose <strong>{view.prompt.choices[view.myChoice]}</strong>.</p>;
  return <form className={styles.stack} onSubmit={(event) => { event.preventDefault(); if (choice !== null) onVote(choice); }}>
    <fieldset className={styles.stack} disabled={busy}>
      <legend>Choose one answer</legend>
      {view.prompt.choices.map((answer, index) => <label key={answer} className={styles.choice}>
        <input type="radio" name="pulse-answer" checked={index === choice} onChange={() => setChoice(index)} />
        {answer}
      </label>)}
    </fieldset>
    <button disabled={busy || choice === null}>Lock in vote</button>
  </form>;
}

function RoundResult({ view }: { view: PulseVoteView }) {
  if (!view.result || !view.prompt) return null;
  const { counts, winners } = view.result;
  const total = counts.reduce((sum, count) => sum + count, 0);
  const abstentions = Math.max(0, view.players.length - total);
  const earnedPoint = view.myChoice !== null && winners.includes(view.myChoice);
  return <>
    <p>{total} of {view.players.length} players voted. {abstentions} {abstentions === 1 ? "abstention" : "abstentions"}.</p>
    <p>{total === 0 ? "No votes this round. No points awarded." : <>
      {winners.length > 1 && "Tied answers each score. "}
      {earnedPoint ? "You earned 1 point." : view.myChoice !== null ? "You earned 0 points." : "You sat out this round."}
    </>}</p>
    <ul className={styles.results} aria-label="Vote distribution as a share of votes cast">
      {view.prompt.choices.map((answer, index) => {
        const count = counts[index] ?? 0;
        const share = total > 0 ? count / total : 0;
        const leading = winners.includes(index);
        return <li key={answer} data-leading={leading}>
          <div className={styles.resultLabel}>
            <span>{answer}{leading && <strong>Top answer</strong>}</span>
            <span>{count} {count === 1 ? "vote" : "votes"} · {voteShare.format(share)}</span>
          </div>
          <div className={styles.track} aria-hidden="true"><span style={{ width: `${share * 100}%` }} /></div>
        </li>;
      })}
    </ul>
  </>;
}

export function PulseVoteRoom() {
  const [view, setView] = useState<PulseVoteView | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resuming, setResuming] = useState(hasSupabase);
  const [message, setMessage] = useState("");
  const [syncIssue, setSyncIssue] = useState(false);
  const request = useRef(0);
  const roomId = view?.roomId;

  const refresh = useCallback(async (id: string) => {
    const generation = ++request.current;
    try {
      const next = await getPulseVoteView(id);
      if (generation === request.current) {
        setView(next);
        setSyncIssue(false);
      }
    } catch {
      if (generation === request.current) setSyncIssue(true);
    }
  }, []);

  useEffect(() => {
    if (!hasSupabase) return;
    let active = true;
    void (async () => {
      try {
        const saved = localStorage.getItem(resumeKey);
        if (!saved) return;
        await ensureGuest();
        const next = await getPulseVoteView(saved);
        if (active) setView(next);
      } catch {
        if (active) setMessage("Could not restore your room. Enter its invite code to rejoin.");
      } finally {
        if (active) setResuming(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const sync = () => { if (!document.hidden) void refresh(roomId); };
    const unsubscribe = subscribeToRoom(roomId, sync, (status) => { if (status === "SUBSCRIBED") sync(); });
    const poll = window.setInterval(sync, 2500);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
    };
  }, [roomId, refresh]);

  async function enter(kind: "create" | "join") {
    if (busy || resuming || !name.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const room = kind === "create" ? await createRoom(PULSE_VOTE_SLUG, name) : await joinPulseVoteRoom(code, name);
      const next = await getPulseVoteView(room.id);
      setView(next);
      localStorage.setItem(resumeKey, room.id);
    } catch (error) {
      setMessage(readableErrorMessage(error, "Could not enter the room. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function act(move: PulseVoteMove) {
    if (!view || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await movePulseVote(view, move);
    } catch (error) {
      setMessage(readableErrorMessage(error, "Could not update the match. Try again."));
    } finally {
      await refresh(view.roomId);
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!view) return;
    try {
      await navigator.clipboard.writeText(view.code);
      setMessage("Invite code copied.");
    } catch {
      setMessage(`Share invite code ${view.code}.`);
    }
  }

  function leave() {
    ++request.current;
    localStorage.removeItem(resumeKey);
    setView(null);
    setMessage("");
    setSyncIssue(false);
  }

  function join(event: FormEvent) {
    event.preventDefault();
    void enter("join");
  }

  return <main className="game-shell" data-game-design="pulse-vote" data-game-phase={view?.phase ?? "entry"}>
    <header>
      <Link className="brand" href="/">Game Library</Link>
      <span className="score">{PULSE_MIN_PLAYERS}–{PULSE_MAX_PLAYERS} players</span>
    </header>
    <div className={styles.shell}>
      <div className={styles.heading} data-game-zone="title">
        <span className="game-title-mark" aria-hidden="true" />
        <h1>Pulse Vote</h1>
        <p>Cast one private vote. Match the room’s most popular answer to earn a point.</p>
      </div>
      {!hasSupabase && <p role="status">Online rooms are unavailable in this environment.</p>}
      {hasSupabase && resuming && <p role="status">Looking for your room…</p>}
      {hasSupabase && !resuming && !view && <section className={styles.panel} data-game-zone="entry" aria-label="Create or join a private room">
        <label className={styles.field}>Display name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} autoComplete="nickname" />
        </label>
        <button onClick={() => void enter("create")} disabled={busy || !name.trim()}>Create room</button>
        <form className={styles.controls} onSubmit={join}>
          <label>Invite code
            <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              maxLength={6} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          </label>
          <button disabled={busy || !name.trim() || code.length !== 6}>Join room</button>
        </form>
      </section>}
      {view && <>
        <section className={`${styles.panel} ${styles.room}`} aria-label="Room details">
          <div><span>Invite code</span><strong>{view.code}</strong></div>
          <div className={styles.controls}>
            <button type="button" onClick={() => void copyCode()}>Copy code</button>
            <button type="button" onClick={leave} disabled={busy}>Exit to room setup</button>
          </div>
        </section>
        {view.phase === "lobby" && <section className={styles.panel}>
          <h2>Room lobby</h2>
          <p>Share the code with friends. The match starts with {PULSE_MIN_PLAYERS}–{PULSE_MAX_PLAYERS} players.</p>
          {view.isHost ? <RoundSettings label="Start match" onStart={(value) => void act({ action: "start", value })}
            disabled={busy || view.players.length < PULSE_MIN_PLAYERS} /> : <p>Waiting for the host to start.</p>}
        </section>}
        {(view.phase === "vote" || view.phase === "reveal") && view.prompt && <section className={styles.panel} data-game-zone="board">
          <p className={styles.round} aria-live="polite">Round {view.round} of {view.totalRounds}{view.phase === "reveal" && " · Results"}</p>
          <h2>{view.prompt.question}</h2>
          {view.phase === "vote" && <>
            <Ballot key={view.roundId} view={view} busy={busy} onVote={(value) => void act({ action: "vote", value })} />
            {view.isHost ? <div className={styles.controls}>
              <button className={styles.secondary} data-pulse-close onClick={() => void act({ action: "close" })} disabled={busy}>Close voting</button>
              <small>Close when your group is ready. Missing votes earn no points.</small>
            </div> : <p>The host closes voting for the room.</p>}
          </>}
          {view.phase === "reveal" && <>
            <RoundResult view={view} />
            {view.isHost ? <button onClick={() => void act({ action: "next" })} disabled={busy}>
              {view.round === view.totalRounds ? "Show final standings" : "Next round"}
            </button> : <p>Waiting for the host to continue.</p>}
          </>}
        </section>}
        <section className={styles.panel} data-game-zone="standings" aria-labelledby="pulse-standings">
          <h2 id="pulse-standings">{view.phase === "lobby" ? `Players (${view.players.length}/${PULSE_MAX_PLAYERS})` : view.phase === "complete" ? "Final standings" : "Scoreboard"}</h2>
          <ol className={styles.scores}>
            {view.players.map((player) => <li key={player.id}>
              <span>{view.phase === "complete" && <strong>#{player.rank} </strong>}{player.name}{player.id === view.hostId && <small>Host</small>}</span>
              {view.phase !== "lobby" && <strong>{player.score} {player.score === 1 ? "pt" : "pts"}</strong>}
            </li>)}
          </ol>
          {view.phase === "complete" && (view.isHost ?
            <RoundSettings label="Start fresh match" onStart={(value) => void act({ action: "start", value })} disabled={busy} />
            : <p>The host can start a fresh match with this room.</p>)}
        </section>
      </>}
      {(syncIssue || message) && <p role="status" className={styles.message}>
        {syncIssue ? "Room updates are interrupted. Reconnecting…" : message}
      </p>}
    </div>
  </main>;
}
