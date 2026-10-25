"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MultiplayerLobby } from "@/components/multiplayer-lobby";
import {
  cardsAgainstHumanityNext, cardsAgainstHumanityStart, cardsAgainstHumanitySubmit,
  cardsAgainstHumanityConfigure, cardsAgainstHumanityAddBot, cardsAgainstHumanityRemoveBot,
  cardsAgainstHumanitySubmitCard, cardsAgainstHumanityJudgeFallback,
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
  const [pack, setPack] = useState("original");
  const [responseMode, setResponseMode] = useState("write");
  const [scoringMode, setScoringMode] = useState("crowd");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [botProfile, setBotProfile] = useState("dry");
  const [message, setMessage] = useState("");
  const [liveStatus, setLiveStatus] = useState("");
  const [subscriptionEpoch, setSubscriptionEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const activeRoomId = useRef<string | null>(null);
  const lastVisibilitySync = useRef(0);
  const refresh = useCallback(async () => {
    if (!room) return;
    try { const nextView = await cardsAgainstHumanityView(room.id); if (activeRoomId.current !== room.id) return; setView(nextView); setMessage(""); }
    catch (error) { setMessage(readableErrorMessage(error, "Could not refresh game state.")); }
  }, [room]);
  const refreshRoom = useCallback(async () => {
    if (!room) return;
    setBusy(true);
    try {
      await ensureGuest();
      const [nextView, nextPlayers] = await Promise.all([cardsAgainstHumanityView(room.id), listRoomPlayers(room.id)]);
      if (activeRoomId.current !== room.id) return;
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
    activeRoomId.current = room.id;
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
      activeRoomId.current = null;
      window.clearTimeout(initialRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopRoom?.();
      stopPlayers?.();
    };
  }, [room, refresh, refreshRoom, subscriptionEpoch]);
  const act = async (operation: () => Promise<GameView>) => {
    const roomId = room?.id;
    setBusy(true);
    try { const nextView = await operation(); if (activeRoomId.current !== roomId) return; setView(nextView); setAnswer(""); setMessage(""); }
    catch (error) { setMessage(readableErrorMessage(error, "That move could not be saved.")); }
    finally { setBusy(false); }
  };
  const isHost = !!room && room.host_id === role?.userId;
  const scores = view?.scores ?? [];
  const roster = view?.participants ?? players.map(player => ({id: player.userId, name: player.displayName, isBot: false, profile: null}));
  const isJudgeRound = view?.settings?.scoringMode === "judge" && view.judge?.status !== "fallback";
  const winnerIds = view?.judge?.winnerIds ?? [];
  const maxVotes = Math.max(0, ...(view?.responses ?? []).map(item => item.votes ?? 0));
  const myScore = scores.find((item) => item.userId === role?.userId)?.score ?? 0;
  return <section className="cah-online">
    <div className="cah-online-heading"><p className="eyebrow">PRIVATE ONLINE ROOM</p><h2>Bring friends. Or bring bots.</h2><p>Create a room to play with friends or add two AI opponents for solo play. Hands stay private; answers are anonymous until results. Rejoin with the same room code after a refresh.</p></div>
    {!room ? <MultiplayerLobby displayName={displayName} gameSlug="cards-against-humanity" gameName="Cards Against Humanity" onRoomChange={setRoom} onRoleChange={setRole} /> : <>
      <div className="cah-room-head"><div><span className="eyebrow">ROOM CODE</span><strong>{room.code}</strong></div><div className="cah-room-actions"><button type="button" disabled={busy} onClick={() => void refreshRoom()}>Refresh room</button><button type="button" disabled={busy} onClick={() => { setRoom(null); setView(null); setAnswer(""); }}>Leave room</button></div></div>
      {liveStatus && <p className="caption-helper" role="status" aria-live="polite">{liveStatus}</p>}
      <div className="cah-online-roster"><span className="eyebrow">PLAYERS · {roster.length}/10</span><ul>{roster.map(player => <li key={player.id}>{player.name}{player.isBot ? <b>AI · {player.profile}</b> : player.id === room.host_id ? <b>HOST</b> : null}{player.isBot && isHost && (view?.phase === "lobby" || view?.phase === "complete") && <button type="button" disabled={busy} aria-label={`Remove ${player.name}`} onClick={() => void act(() => cardsAgainstHumanityRemoveBot(room.id, player.id))}>Remove</button>}</li>)}</ul></div>
      {(!view || view.phase === "lobby" || view.phase === "complete") && <div className="cah-online-action cah-settings">{view?.phase === "complete" && <h3>Play another game</h3>}
        {isHost ? <>
          <label>Card pack<select value={pack} disabled={busy} onChange={event => {setPack(event.target.value); if(event.target.value === "original") setResponseMode("write");}}><option value="original">Original</option><option value="after-hours">After Hours · 21+</option></select></label>
          {pack === "after-hours" && <label className="cah-consent"><input type="checkbox" checked={adultConfirmed} onChange={event => setAdultConfirmed(event.target.checked)} />Everyone playing is 21+ and wants adult dark humor.</label>}
          <label>Responses<select value={responseMode} disabled={busy} onChange={event => setResponseMode(event.target.value)}><option value="write">Write your own</option>{pack === "after-hours" && <option value="cards">Private hand of 7 cards</option>}</select></label>
          <label>Choose the winner<select value={scoringMode} disabled={busy} onChange={event => setScoringMode(event.target.value)}><option value="crowd">Crowd vote</option><option value="judge">AI judge</option></select></label>
          <label>Rounds<select value={rounds} disabled={busy} onChange={event => setRounds(Number(event.target.value))}>{[3,5,7].map(count => <option key={count} value={count}>{count}</option>)}</select></label>
          <div className="cah-bot-controls"><label>Bot personality<select value={botProfile} disabled={busy} onChange={event => setBotProfile(event.target.value)}><option value="dry">Dry gallows humor</option><option value="chaos">Absurd chaos</option><option value="topical">Topical satire</option><option value="wordplay">Clever wordplay</option></select></label><button disabled={busy || roster.length >= 10} onClick={() => void act(() => cardsAgainstHumanityAddBot(room.id, botProfile))}>Add AI player</button></div>
          <p className="caption-helper">3–10 seats. For solo play, add two bots. AI players take ordinary turns and cannot vote for themselves. AI judging uses a separate nonplaying judge.</p>
          <p className="caption-helper">AI modes send game prompts and response text to NVIDIA. Don’t enter private information. Provider outages may use a disclosed legal fallback.</p>
          <button className="caption-primary" disabled={busy || roster.length < 3 || (pack === "after-hours" && !adultConfirmed)} onClick={() => void act(async () => {await cardsAgainstHumanityConfigure(room.id, pack, responseMode, scoringMode); return cardsAgainstHumanityStart(room.id, rounds);})}>Start game</button>
        </> : <p role="status">Waiting for the host to choose the pack and start.</p>}
      </div>}
      {view && view.phase !== "lobby" && <p className="caption-helper">{view.settings?.packSlug === "after-hours" ? "After Hours · 21+" : "Original"} · {view.settings?.responseMode === "cards" ? "Private card hands" : "Write your own"} · {isJudgeRound ? "AI judge" : "Crowd vote"}</p>}
      {view?.aiStatus && <p className="caption-helper" role="status" aria-live="polite">{view.judge?.status === "fallback" ? "The AI judge was unavailable. This round uses crowd voting." : view.aiStatus.failed ? "AI is unavailable. Recovery options will appear below." : view.aiStatus.pending > 0 ? `Waiting for ${view.aiStatus.pending} AI ${view.aiStatus.pending === 1 ? "turn" : "turns"}…` : ""}{view.aiStatus.fallbackUsed ? " A legal automatic fallback was used because AI was unavailable." : ""}</p>}
      {view?.phase === "submitting" && <div className="cah-online-action"><span className="round-badge" aria-live="polite">Round {view.round}/{view.totalRounds}</span><div className="caption-prompt">{view.prompt}</div>{view.submitted ? <p role="status" aria-live="polite">Your response is locked in. Waiting for the rest of the room.</p> : view.settings?.responseMode === "cards" ? <div className="cah-hand" aria-label="Your private response cards">{!view.hand?.length && <p role="status">Your hand has not loaded. Use Refresh room to recover it.</p>}{(view.hand ?? []).map(card => <button className="caption-answer" key={card.id} disabled={busy} onClick={() => void act(() => cardsAgainstHumanitySubmitCard(room.id, card.id))}>{card.text}</button>)}</div> : <form className="caption-response-form" onSubmit={(event) => { event.preventDefault(); void act(() => cardsAgainstHumanitySubmit(room.id, answer)); }}><label htmlFor="cah-online-answer">Your response</label><textarea id="cah-online-answer" maxLength={180} value={answer} onChange={(event) => setAnswer(event.target.value)} required /><button className="caption-primary" disabled={busy || !answer.trim()}>Lock in response</button></form>}</div>}
      {view?.phase === "voting" && <div className="cah-online-action"><span className="round-badge" aria-live="polite">Round {view.round}/{view.totalRounds}</span><div className="caption-prompt">{view.prompt}</div>{isJudgeRound ? <div role="status" aria-live="polite"><p>{view.judge?.status === "failed" ? "The AI judge is unavailable. The host can switch this round to a crowd vote." : "The AI judge is considering the anonymous responses…"}</p>{isHost && view.judge?.status === "failed" && <button disabled={busy} onClick={() => void act(() => cardsAgainstHumanityJudgeFallback(room.id))}>Use crowd voting for this round</button>}</div> : view.voted ? <p role="status" aria-live="polite">Your vote is in. Waiting for the rest of the room.</p> : <div className="caption-answer-list">{view.responses.map((item, index) => <button key={item.id} className="caption-answer" disabled={busy} onClick={() => void act(() => cardsAgainstHumanityVote(room.id, item.id))}><span>{String(index + 1).padStart(2,"0")}</span>{item.text}</button>)}</div>}</div>}
      {(view?.phase === "reveal" || view?.phase === "complete") && <div className="cah-online-action"><span className="round-badge" aria-live="polite">{view.phase === "complete" ? "FINAL SCORE" : `ROUND ${view.round} RESULTS`}</span><div className="caption-prompt">{view.prompt}</div><div className="caption-answer-list">{view.responses.map((item) => <article className={(winnerIds.length ? winnerIds.includes(item.id) : maxVotes > 0 && item.votes === maxVotes) ? "caption-winner" : "cah-result-card"} key={item.id}><span className="caption-win-label">{(winnerIds.length ? winnerIds.includes(item.id) : maxVotes > 0 && item.votes === maxVotes) ? "WINNER · " : ""}{isJudgeRound ? "AI JUDGED" : `${item.votes ?? 0} ${(item.votes ?? 0) === 1 ? "VOTE" : "VOTES"}`} · {item.author}</span><p>{item.text}</p></article>)}</div>{view.judge?.explanation && <p className="cah-judge-explanation"><strong>AI judge:</strong> {view.judge.explanation}</p>}<ol className="caption-scoreboard">{scores.map((player) => <li key={player.userId}><span>{player.name}{player.userId === role?.userId && " · you"}</span><strong>{player.score}</strong></li>)}</ol>{view.phase === "reveal" && isHost && <button className="caption-primary" disabled={busy} onClick={() => void act(() => cardsAgainstHumanityNext(room.id))}>{view.round >= view.totalRounds ? "Finish game" : "Next prompt"}</button>}{view.phase === "reveal" && !isHost && <p role="status" aria-live="polite">Waiting for the host to continue. Your score: {myScore}</p>}{view.phase === "complete" && <p role="status" aria-live="polite">Game complete. Final scores are above.</p>}</div>}
      {message && <p className="caption-notice" role="status">{message}</p>}
    </>}
  </section>;
}
