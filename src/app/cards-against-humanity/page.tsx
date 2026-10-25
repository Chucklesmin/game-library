"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { CAH_PROMPTS } from "@/lib/cards-against-humanity-prompts";
import { canAddPlayer, canStartGame, createSubmission, drawPrompt, getVoteChoices, recordVote, scoreRound, validatePlayerName } from "@/lib/cards-against-humanity-rules.mjs";
import { CardsAgainstHumanityOnline } from "@/components/cards-against-humanity-online";

type Player = { id: string; name: string; score: number };
type Submission = { id: string; authorId: string; text: string };
type Phase = "setup" | "submit-ready" | "submit" | "vote-ready" | "vote" | "reveal" | "complete";

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export default function CardsAgainstHumanityPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [roundCount, setRoundCount] = useState(5);
  const [round, setRound] = useState(0);
  const [usedPromptIds, setUsedPromptIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(CAH_PROMPTS[0]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [voteOrder, setVoteOrder] = useState<Player[]>([]);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [response, setResponse] = useState("");
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [playMode, setPlayMode] = useState<"local" | "online">("local");
  const [displayName, setDisplayName] = useState("");

  const isVoting = phase === "vote-ready" || phase === "vote";
  const currentPlayer = isVoting ? voteOrder[playerIndex] : players[playerIndex];
  const tallies = useMemo(() => submissions.reduce<Record<string, number>>((result, submission) => {
    const count = Object.values(votes).filter((submissionId) => submissionId === submission.id).length;
    result[submission.id] = count;
    return result;
  }, {}), [submissions, votes]);
  const highScore = Math.max(0, ...Object.values(tallies));
  const winners = submissions.filter((submission) => tallies[submission.id] === highScore);

  const addPlayer = () => {
    const { name, error } = validatePlayerName(players, playerName);
    if (error) {
      setNotice(error);
      return;
    }
    if (!name || !canAddPlayer(players)) return;
    setPlayers((current) => [...current, { id: crypto.randomUUID(), name, score: 0 }]);
    setPlayerName("");
    setNotice("");
  };

  const beginRound = (nextRound: number, used: string[]) => {
    const nextPrompt = drawPrompt(CAH_PROMPTS, used);
    setPrompt(nextPrompt);
    setUsedPromptIds([...used, nextPrompt.id]);
    setRound(nextRound);
    setSubmissions([]);
    setVotes({});
    setVoteOrder([]);
    setPlayerIndex(0);
    setResponse("");
    setPhase("submit-ready");
  };

  const startGame = () => {
    if (!canStartGame(players)) {
      setNotice("Add at least three players to start.");
      return;
    }
    setPlayers((current) => current.map((player) => ({ ...player, score: 0 })));
    setUsedPromptIds([]);
    beginRound(1, []);
  };

  const submitResponse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentPlayer) return;
    const nextSubmissions = createSubmission(submissions, currentPlayer.id, response, crypto.randomUUID());
    setResponse("");
    if (playerIndex + 1 < players.length) {
      setSubmissions(nextSubmissions);
      setPlayerIndex((index) => index + 1);
      setPhase("submit-ready");
      return;
    }
    setSubmissions(shuffle(nextSubmissions));
    setVoteOrder(shuffle(players));
    setPlayerIndex(0);
    setPhase("vote-ready");
  };

  const castVote = (submissionId: string) => {
    if (!currentPlayer || submissions.find((item) => item.id === submissionId)?.authorId === currentPlayer.id) return;
    const nextVotes = recordVote(votes, currentPlayer.id, submissionId, submissions);
    setVotes(nextVotes);
    if (playerIndex + 1 < voteOrder.length) {
      setPlayerIndex((index) => index + 1);
      setPhase("vote-ready");
      return;
    }
    setPlayers(scoreRound(players, submissions, nextVotes).players);
    setPhase("reveal");
  };

  const nextRound = () => {
    if (round >= roundCount) {
      setPhase("complete");
      return;
    }
    beginRound(round + 1, usedPromptIds);
  };

  const returnHome = () => {
    setPhase("setup");
    setNotice("");
  };

  return <main className="game-shell caption-shell">
    <header>
      <Link className="back-button caption-home" href="/">← Game Library</Link>
      <span className="game-title">Cards Against Humanity</span>
      <span className="score">3–10 players</span>
    </header>

    {phase === "setup" && <section className="game-choice caption-choice">
      <p className="eyebrow">A QUICK-FIRE PARTY CARD GAME</p>
      <h1>Cards Against Humanity</h1>
      <p>Finish a strange prompt, then vote for the response you wish you had written. This Game Library edition uses its own original prompts and response cards.</p>
      <div className="cah-mode-switch" role="group" aria-label="Choose how to play"><button className={playMode === "local" ? "selected" : ""} onClick={() => setPlayMode("local")}>Pass and play</button><button className={playMode === "online" ? "selected" : ""} onClick={() => setPlayMode("online")}>Online room</button></div>
      {playMode === "online" && <label className="cah-name">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0,24))} placeholder="e.g. Jordan" maxLength={24} /></label>}
      {playMode === "online" ? <CardsAgainstHumanityOnline displayName={displayName} /> : <>
      <div className="caption-setup">
        <section className="caption-setup-card">
          <h2>Who’s playing?</h2>
          <form className="caption-add-player" onSubmit={(event) => { event.preventDefault(); addPlayer(); }}>
            <label className="sr-only" htmlFor="caption-player-name">Player name</label>
            <input id="caption-player-name" value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Add a player name" maxLength={24} />
          <button type="submit" disabled={!canAddPlayer(players)}>Add</button>
          </form>
          <ol className="caption-player-list">{players.map((player, index) => <li key={player.id}><span><b>{String(index + 1).padStart(2, "0")}</b>{player.name}</span><button type="button" aria-label={`Remove ${player.name}`} onClick={() => setPlayers((current) => current.filter((item) => item.id !== player.id))}>×</button></li>)}</ol>
          <p className="caption-helper">Add 3–10 players. Pass one device between turns.</p>
        </section>
        <section className="caption-setup-card caption-rounds">
          <h2>Set the table</h2>
          <label htmlFor="caption-round-count">Rounds</label>
          <select id="caption-round-count" value={roundCount} onChange={(event) => setRoundCount(Number(event.target.value))}>
            {[3, 5, 7].map((count) => <option key={count} value={count}>{count} rounds</option>)}
          </select>
          <p className="caption-helper">One point for every response tied for the crowd favorite.</p>
          <button className="caption-primary" onClick={startGame}>Start game</button>
        </section>
      </div>
      {notice && <p className="caption-notice" role="status">{notice}</p>}
      </>}
    </section>}

    {(phase === "submit-ready" || phase === "submit") && <section className="game-board caption-board">
      <div className="round-badge" aria-live="polite">Round {round}/{roundCount}</div>
      {phase === "submit-ready" ? <div className="caption-turn">
        <p className="eyebrow" role="status" aria-live="polite">PRIVATE RESPONSE · {playerIndex + 1} OF {players.length}</p>
        <div className="caption-prompt">{prompt.text}</div>
        <p>Pass the device to <strong>{currentPlayer?.name}</strong>. Keep your answer to yourself.</p>
        <button className="caption-primary" onClick={() => setPhase("submit")}>I’m {currentPlayer?.name} — show my card</button>
        <p className="caption-privacy">Previous responses stay hidden on this screen.</p>
      </div> : <div className="caption-turn">
        <p className="eyebrow">YOUR CARD · {currentPlayer?.name}</p>
        <div className="caption-prompt">{prompt.text}</div>
        <form className="caption-response-form" onSubmit={submitResponse}>
          <label htmlFor="caption-response">Write a short response</label>
          <textarea id="caption-response" autoFocus value={response} onChange={(event) => setResponse(event.target.value.slice(0, 180))} placeholder="Make it count…" maxLength={180} required />
          <span className="caption-counter">{response.length}/180</span>
          <button className="caption-primary" type="submit">Lock in response</button>
        </form>
      </div>}
    </section>}

    {(phase === "vote-ready" || phase === "vote") && <section className="game-board caption-board">
      <div className="round-badge">Round {round}/{roundCount}</div>
      {phase === "vote-ready" ? <div className="caption-turn">
        <p className="eyebrow" role="status" aria-live="polite">BLIND VOTE · {playerIndex + 1} OF {voteOrder.length}</p>
        <div className="caption-prompt">{prompt.text}</div>
        <p>Pass the device to <strong>{currentPlayer?.name}</strong>. Pick your favorite response. Your own card is removed.</p>
        <button className="caption-primary" onClick={() => setPhase("vote")}>I’m {currentPlayer?.name} — show the cards</button>
        <p className="caption-privacy">Names stay hidden until everyone has voted.</p>
      </div> : <div className="caption-vote">
        <p className="eyebrow">CHOOSE ONE · {currentPlayer?.name}</p>
        <div className="caption-prompt caption-prompt-small">{prompt.text}</div>
        <div className="caption-answer-list">{getVoteChoices(submissions, currentPlayer?.id ?? "").map((item, index) => <button className="caption-answer" key={item.id} onClick={() => castVote(item.id)}><span>{String(index + 1).padStart(2, "0")}</span>{item.text}</button>)}</div>
      </div>}
    </section>}

    {(phase === "reveal" || phase === "complete") && <section className="game-board caption-board caption-results">
      <div className="round-badge">{phase === "complete" ? "FINAL SCORE" : `ROUND ${round} RESULTS`}</div>
      <div className="caption-results-inner">
        <p className="eyebrow" role="status" aria-live="polite">{phase === "complete" ? "THAT’S A WRAP" : "THE ROOM HAS SPOKEN"}</p>
        <h1>{phase === "complete" ? "Nice work, troublemakers." : "Crowd favorite."}</h1>
        {phase === "reveal" && <div className="caption-winners">{winners.map((winner) => <article className="caption-winner" key={winner.id}><span className="caption-win-label">{tallies[winner.id]} {tallies[winner.id] === 1 ? "VOTE" : "VOTES"} · {players.find((player) => player.id === winner.authorId)?.name}</span><p>{winner.text}</p></article>)}</div>}
        <ol className="caption-scoreboard">{[...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).map((player, index) => <li key={player.id}><span><b>{String(index + 1).padStart(2, "0")}</b>{player.name}</span><strong>{player.score}</strong></li>)}</ol>
        {phase === "reveal" ? <button className="caption-primary" onClick={nextRound}>{round >= roundCount ? "See final scores" : "Next prompt"}</button> : <button className="caption-primary" onClick={returnHome}>Play again</button>}
      </div>
    </section>}

    {phase === "setup" && playMode === "local" && <p className="caption-footnote">All prompts and responses in this Game Library edition are original.</p>}
  </main>;
}
