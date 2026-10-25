"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MultiplayerLobby } from "@/components/multiplayer-lobby";
import {
  cardsAgainstHumanityNext, cardsAgainstHumanityStart, cardsAgainstHumanitySubmit,
  cardsAgainstHumanityView, cardsAgainstHumanityVote, getCurrentRoomPlayer,
  ensureGuest, listRoomPlayers, subscribeToRoom, subscribeToRoomPlayers,
  type CardsAgainstHumanityView as GameView, type CurrentRoomPlayer, type RoomPlayer,
} from "@/lib/game-room";
import type { RoomSnapshot } from "@/lib/game-library";
import { readableErrorMessage } from "@/lib/error-message.mjs";

export function CardsAgainstHumanityOnline({ displayName }: { displayName: string }) {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [role, setRole] = useState<CurrentRoomPlayer | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [view, setView] = useState<GameView | null>(null);
  const [rounds, setRounds] = useState(5);
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [liveStatus, setLiveStatus] = useState("");
  const [subscriptionEpoch, setSubscriptionEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const lastVisibilitySync = useRef(0);
  const refresh = useCallback(async () => {
    if (!room) return;
    try { setView(await cardsAgainstHumanityView(room.id)); setMessage(""); }
    catch (error) { setMessage(readableErrorMessage(error, "Could not refresh game state.")); }
  }, [room]);

  const refreshRoom = useCallback(async () => {
    if (!room) return;
    setBusy(true);
    try {
      await ensureGuest();
      const [nextView, nextPlayers] = await Promise.all([cardsAgainstHumanityView(room.id), listRoomPlayers(room.id)]);
      setView(nextView);
      setPlayers(nextPlayers);
      setMessage("");
      setLiveStatus("Room refreshed. Reconnecting live updates…");
      setSubscriptionEpoch((epoch) => epoch + 1);
    } catch (error) {
      setMessage(readableErrorMessage(error, "Could not refresh room state."));
      setLiveStatus("Refresh failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [room]);

  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    let initialRefresh = 0;
    let stopRoom: (() => void) | undefined;
    let stopPlayers: (() => void) | undefined;
    const updateLiveStatus = (status: string, error?: Error) => {
      if (status === "SUBSCRIBED") setLiveStatus("Live updates connected.");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveStatus(error ? `Live updates interrupted: ${error.message}` : "Live updates interrupted. Refresh the room to sync.");
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastVisibilitySync.current < 3000) return;
      lastVisibilitySync.current = now;
      void refresh();
      void listRoomPlayers(room.id).then(setPlayers).catch((error: unknown) => setMessage(readableErrorMessage(error, "Could not sync the room roster.")));
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void ensureGuest().then(() => {
      if (cancelled) return;
      void getCurrentRoomPlayer(room.id).then(setRole).catch((error: unknown) => setMessage(readableErrorMessage(error, "Could not load your room role.")));
      void listRoomPlayers(room.id).then(setPlayers).catch((error: unknown) => setMessage(readableErrorMessage(error, "Could not load the room roster.")));
      initialRefresh = window.setTimeout(() => { void refresh(); }, 0);
      stopRoom = subscribeToRoom(room.id, () => { void refresh(); }, updateLiveStatus);
      stopPlayers = subscribeToRoomPlayers(room.id, setPlayers);
    }).catch((error: unknown) => setMessage(readableErrorMessage(error, "Could not reconnect to this room.")));
    return () => {
      cancelled = true;
      window.clearTimeout(initialRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopRoom?.();
      stopPlayers?.();
    };
  }, [room, refresh, refreshRoom, subscriptionEpoch]);

  const act = async (operation: () => Promise<GameView>) => {
    setBusy(true);
    try { setView(await operation()); setAnswer(""); setMessage(""); }
    catch (error) { setMessage(readableErrorMessage(error, "That move could not be saved.")); }
    finally { setBusy(false); }
  };
  const isHost = !!room && room.host_id === role?.userId;
  const scores = view?.scores ?? [];
  const myScore = scores.find((item) => item.userId === role?.userId)?.score ?? 0;

  return <section className="cah-online">
    <div className="cah-online-heading"><p className="eyebrow">PRIVATE ONLINE ROOM</p><h2>Play with your people.</h2><p>Responses stay private until voting opens. Player names stay hidden until the round ends. After a refresh, rejoin with the same room code.</p></div>
    {!room ? <MultiplayerLobby displayName={displayName} gameSlug="cards-against-humanity" gameName="Cards Against Humanity" onRoomChange={setRoom} onRoleChange={setRole} /> : <>
      <div className="cah-room-head"><div><span className="eyebrow">ROOM CODE</span><strong>{room.code}</strong></div><div className="cah-room-actions"><button type="button" disabled={busy} onClick={() => void refreshRoom()}>Refresh room</button><button type="button" onClick={() => { setRoom(null); setView(null); }}>Leave room</button></div></div>
      {liveStatus && <p className="caption-helper" role="status" aria-live="polite">{liveStatus}</p>}
      <div className="cah-online-roster"><span className="eyebrow">PLAYERS · {players.length}/10</span><ul>{players.map((player) => <li key={player.userId}>{player.displayName}{player.userId === room.host_id && <b>HOST</b>}</li>)}</ul></div>
      {(!view || view.phase === "lobby") && <div className="cah-online-action"><label>Rounds<select value={rounds} onChange={(event) => setRounds(Number(event.target.value))}>{[3,5,7].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>{isHost ? <button className="caption-primary" disabled={busy || players.length < 3} onClick={() => void act(() => cardsAgainstHumanityStart(room.id, rounds))}>Start game</button> : <p role="status" aria-live="polite">Waiting for the host to start.</p>}</div>}
      {view?.phase === "submitting" && <div className="cah-online-action"><span className="round-badge" aria-live="polite">Round {view.round}/{view.totalRounds}</span><div className="caption-prompt">{view.prompt}</div>{view.submitted ? <p role="status" aria-live="polite">Your response is locked in. Waiting for the rest of the room.</p> : <form className="caption-response-form" onSubmit={(event) => { event.preventDefault(); void act(() => cardsAgainstHumanitySubmit(room.id, answer)); }}><label htmlFor="cah-online-answer">Your response</label><textarea id="cah-online-answer" maxLength={180} value={answer} onChange={(event) => setAnswer(event.target.value)} required /><button className="caption-primary" disabled={busy || !answer.trim()}>Lock in response</button></form>}</div>}
      {view?.phase === "voting" && <div className="cah-online-action"><span className="round-badge" aria-live="polite">Round {view.round}/{view.totalRounds}</span><div className="caption-prompt">{view.prompt}</div>{view.voted ? <p role="status" aria-live="polite">Your vote is in. Waiting for the rest of the room.</p> : <div className="caption-answer-list">{view.responses.map((item, index) => <button key={item.id} className="caption-answer" disabled={busy} onClick={() => void act(() => cardsAgainstHumanityVote(room.id, item.id))}><span>{String(index + 1).padStart(2,"0")}</span>{item.text}</button>)}</div>}</div>}
      {(view?.phase === "reveal" || view?.phase === "complete") && <div className="cah-online-action"><span className="round-badge" aria-live="polite">{view.phase === "complete" ? "FINAL SCORE" : `ROUND ${view.round} RESULTS`}</span><div className="caption-prompt">{view.prompt}</div><div className="caption-answer-list">{view.responses.map((item) => <article className="caption-winner" key={item.id}><span className="caption-win-label">{item.votes ?? 0} {(item.votes ?? 0) === 1 ? "VOTE" : "VOTES"} · {item.author}</span><p>{item.text}</p></article>)}</div><ol className="caption-scoreboard">{scores.map((player) => <li key={player.userId}><span>{player.name}{player.userId === role?.userId && " · you"}</span><strong>{player.score}</strong></li>)}</ol>{view.phase === "reveal" && isHost && <button className="caption-primary" disabled={busy} onClick={() => void act(() => cardsAgainstHumanityNext(room.id))}>{view.round >= view.totalRounds ? "Finish game" : "Next prompt"}</button>}{view.phase === "reveal" && !isHost && <p role="status" aria-live="polite">Waiting for the host to continue. Your score: {myScore}</p>}{view.phase === "complete" && <p role="status" aria-live="polite">Game complete. Final scores are above.</p>}</div>}
      {message && <p className="caption-notice" role="status">{message}</p>}
    </>}
  </section>;
}
