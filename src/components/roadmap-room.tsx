"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Countdown } from "@/components/countdown";
import { ensureGuest } from "@/lib/game-room";
import { supabase } from "@/lib/supabase";
import type { DisplayCard, GameControl, GameInfo, RoomView } from "@/lib/roadmap/contract";
import { RoadmapDrawing } from "./roadmap-drawing";
import styles from "./roadmap-room.module.css";

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function requestRoom(slug: string, payload?: object, roomId?: string): Promise<RoomView> {
  if (!supabase) throw new Error("Guest sign-in is unavailable.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new RequestError("Your guest session is unavailable.", 401);
  const response = await fetch(`/api/games/${slug}${roomId ? `?room=${roomId}` : ""}`, {
    method: payload ? "POST" : "GET",
    headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new RequestError(result.error || "Could not reach the room.", response.status);
  return result as RoomView;
}

function Cards({ cards, heading }: { cards: DisplayCard[]; heading?: string }) {
  return <section className={styles.cards} aria-label={heading}>
    {heading && <h2 className={styles.groupLabel}>{heading}</h2>}
    {cards.map((card, index) => <article className={styles.card} key={`${card.title}:${index}`}>
      <h2>{card.title}</h2>
      {card.body && <p>{card.body}</p>}
      {card.link?.href.startsWith("https://") && <a href={card.link.href} target="_blank" rel="noopener noreferrer">{card.link.label}</a>}
      {!!card.items?.length && <ul>{card.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>}
    </article>)}
  </section>;
}

function MoveControl({ control, pending, move }: {
  control: GameControl; pending: boolean; move: (id: string, values?: Record<string, string>) => Promise<boolean>;
}) {
  if (!control.fields?.length) {
    return <button type="button" disabled={pending} onClick={() => void move(control.id)}>{control.label}</button>;
  }
  return <form className={styles.actionForm} onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(Array.from(new FormData(form), ([key, value]) => [key, String(value)]));
    if (await move(control.id, values)) form.reset();
  }}>
    {control.fields.map((field) => <label key={field.name}>{field.label}
      {field.type === "textarea" ? <textarea name={field.name} maxLength={field.maxLength} required rows={3} />
        : field.type === "select" ? <select name={field.name} required defaultValue="">
          <option value="" disabled>Choose an option</option>
          {field.options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        : <input name={field.name} maxLength={field.maxLength} required />}
    </label>)}
    <button disabled={pending}>{control.label}</button>
  </form>;
}

export function RoadmapRoom({ game, configured, inviteCode }: { game: GameInfo; configured: boolean; inviteCode: string }) {
  const [name, setName] = useState("");
  const shareCode = inviteCode.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 6);
  const [code, setCode] = useState(shareCode);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState(false);
  const [restoring, setRestoring] = useState(configured);
  const activeRoom = useRef<string | null>(null);
  const requestNumber = useRef(0);
  const appliedNumber = useRef(0);
  const moving = useRef(false);
  const storageKey = `roadmap:room:${game.slug}`;

  const apply = useCallback((next: RoomView, requestId: number) => {
    if (activeRoom.current !== next.id || requestId < appliedNumber.current) return;
    appliedNumber.current = requestId;
    setRoom((current) => current?.id === next.id && current.revision > next.revision ? current : next);
  }, []);

  const refresh = useCallback(async () => {
    const id = activeRoom.current;
    if (!id) return;
    const requestId = ++requestNumber.current;
    try {
      apply(await requestRoom(game.slug, undefined, id), requestId);
    } catch (error) {
      if (activeRoom.current === id) setFailure(error instanceof Error ? error.message : "Could not refresh the room.");
    }
  }, [apply, game.slug]);

  const expire = useCallback(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    async function restore() {
      const id = window.localStorage.getItem(storageKey);
      try {
        if (!id || (shareCode && window.localStorage.getItem(storageKey + ":code") !== shareCode)) return;
        await ensureGuest();
        const next = await requestRoom(game.slug, undefined, id);
        if (cancelled) return;
        activeRoom.current = next.id;
        apply(next, ++requestNumber.current);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof RequestError && error.status === 404) window.localStorage.removeItem(storageKey);
        setFailure(error instanceof Error ? error.message : "Could not restore the room.");
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, [apply, configured, game.slug, shareCode, storageKey]);

  const roomId = room?.id;
  useEffect(() => {
    if (!roomId || !supabase) return;
    const db = supabase;
    const channel = db.channel(`roadmap:${roomId}`).on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "roadmap_room_updates", filter: `id=eq.${roomId}`,
    }, () => { void refresh(); }).subscribe((status) => {
      if (status === "SUBSCRIBED") void refresh();
    });
    const onVisible = () => { if (!document.hidden) void refresh(); };
    const poll = window.setInterval(onVisible, 4000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      void db.removeChannel(channel);
    };
  }, [roomId, refresh]);

  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const operation = submitter?.getAttribute("value") || (code ? "join" : "create");
    setPending(true);
    setFailure("");
    setNotice("");
    try {
      await ensureGuest();
      const next = await requestRoom(game.slug, { operation, name, code });
      activeRoom.current = next.id;
      window.localStorage.setItem(storageKey, next.id);
      window.localStorage.setItem(storageKey + ":code", next.code);
      apply(next, ++requestNumber.current);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not enter the room.");
    } finally {
      setPending(false);
    }
  }

  async function move(action: string, values: Record<string, string> = {}) {
    if (!room || moving.current) return false;
    moving.current = true;
    setPending(true);
    setFailure("");
    const requestId = ++requestNumber.current;
    try {
      const next = await requestRoom(game.slug, { operation: "move", room: room.id, action, values, turn: room.turn });
      apply(next, requestId);
      return true;
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The move could not be saved.");
      void refresh();
      return false;
    } finally {
      moving.current = false;
      setPending(false);
    }
  }

  async function copyInvite() {
    if (!room) return;
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set("code", room.code);
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice("Invite link copied.");
    } catch {
      setNotice(`Share room code ${room.code}.`);
    }
  }

  function exit() {
    activeRoom.current = null;
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(storageKey + ":code");
    setRoom(null);
    setFailure("");
    setNotice("");
  }

  const view = room?.game;
  const playerRange = game.minimumPlayers === game.maximumPlayers ? game.minimumPlayers
    : `${game.minimumPlayers}–${game.maximumPlayers}`;
  return <main className={styles.shell}>
    <header className={styles.header}>
      <Link href="/">← Game Library</Link>
      <span>{playerRange} players</span>
    </header>
    <div className={styles.title}>
      <h1>{game.title}</h1>
      {!view && <p>{game.description}</p>}
    </div>
    {failure && <p role="alert" className={styles.error}>{failure}</p>}
    {!room ? <>
      {restoring ? <p role="status">Reopening your room…</p> : configured ?
        <form onSubmit={enter} className={styles.entry}>
          <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} required autoComplete="nickname" /></label>
          <label>Room code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 6))}
            maxLength={6} spellCheck={false} autoCapitalize="characters" placeholder="Six characters" /></label>
          <div className={styles.actions}>
            {inviteCode ? <><button value="join" disabled={pending || code.length !== 6}>Join room</button>
              <button className={styles.secondary} value="create" disabled={pending}>Create room</button></>
              : <><button value="create" disabled={pending}>Create room</button>
                <button className={styles.secondary} value="join" disabled={pending || code.length !== 6}>Join room</button></>}
          </div>
        </form> : <p role="status">Online rooms are temporarily unavailable.</p>}
      <details className={styles.rules} open><summary>How to play</summary><ol>{game.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol></details>
    </> : <>
      {!view && <section className={styles.lobby} aria-label="Room lobby">
        <div className={styles.roomCode}>
          <div><span>Room code</span><strong>{room.code}</strong></div>
          <button className={styles.secondary} onClick={() => void copyInvite()}>Copy invite link</button>
        </div>
        <ul className={styles.roster} aria-label="Players in room">
          {room.players.map((player) => <li key={player.id}>{player.name}{player.id === room.hostId && <small>Host</small>}</li>)}
        </ul>
        <p role="status">{notice || `${room.players.length} of ${game.maximumPlayers} seats filled.`}</p>
        {room.isHost ? <button disabled={pending || room.players.length < game.minimumPlayers} onClick={() => void move("$start")}>Start game</button>
          : <p>The host starts when everyone is ready.</p>}
      </section>}
      {view && <section className={styles.board}>
        <div className={styles.boardHeading}>
          <div aria-live="polite"><p className={styles.groupLabel}>{view.round}</p><h2>{view.heading}</h2></div>
          {view.deadline && <Countdown deadlineAt={new Date(view.deadline).toISOString()} onExpired={expire} />}
        </div>
        {view.detail && <p>{view.detail}</p>}
        {!!view.privateCards?.length && <Cards cards={view.privateCards} heading={view.privateHeading ?? "Only you can see this"} />}
        {!!view.cards?.length && <Cards cards={view.cards} />}
        {view.drawing && <RoadmapDrawing key={"drawing:" + room.turn} drawing={view.drawing}
          send={(id, data) => move(id, { stroke: data })} pending={pending} />}
        {view.controls.length > 0 && <div className={styles.actions} key={"controls:" + room.turn}>
          {view.controls.map((control) => <MoveControl key={control.id} control={control} pending={pending} move={move} />)}
        </div>}
        {!!view.standings?.length && <section className={styles.standings} aria-label="Standings">
          <h2>Scoreboard</h2>
          <ul>{view.standings.map((entry, index) => <li key={`${entry.label}:${index}`}><span>{entry.label}</span><strong>{entry.score}</strong></li>)}</ul>
        </section>}
        {view.finished && room.isHost && <button disabled={pending} onClick={() => void move("$start")}>Start a fresh match</button>}
      </section>}
      <div className={styles.footer}>
        <button className={styles.secondary} onClick={() => void refresh()}>Refresh room</button>
        <button className={styles.secondary} onClick={exit}>Back to game setup</button>
      </div>
    </>}
  </main>;
}
