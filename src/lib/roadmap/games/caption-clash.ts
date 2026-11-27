import { createHmac, randomBytes } from "node:crypto";
import type { DisplayCard, GameContext, GameControl, GameDefinition } from "../contract.ts";

const PROMPTS = [
  "A lighthouse just opened a drive-through. What is the first thing on the menu?",
  "Write the notice taped to the door of a museum dedicated to unfinished projects.",
  "A goose has taken over the hotel front desk. What does your room confirmation say?",
  "What does an elevator say when it finally gives its two weeks' notice?",
  "Write a coach's halftime speech for a team that is losing at musical chairs.",
  "The city installed its first talking park bench. What is it tired of hearing?",
  "Name the one class everyone fails at a school for imaginary friends.",
  "Write a five-star review for the world's least helpful magic wand.",
  "A submarine is opening a sidewalk café. What is the house rule?",
  "Your suitcase starts a podcast. What is the title of its first episode?",
  "What is the catch on a coupon for one free moon?",
  "A detective finds a note inside a library book that hasn't been checked out in 40 years. What does it say?",
  "Write the message on a cake for someone who just won an argument with a vending machine.",
  "What does the world's most dramatic weather app say about a light drizzle?",
  "A retired mascot sets up a neighborhood advice booth. What is the first question on the sign?",
  "Write the warning label on a houseplant that insists it can cook.",
  "A time traveler arrives exactly 17 minutes late. What is their excuse?",
  "What would a raccoon list as a professional reference?",
  "Write the closing line of a keynote speech delivered by a lost glove.",
  "A company sells replacement endings for awkward conversations. Name its bestseller.",
  "What is the first commandment of a secret society that meets in a hardware store?",
  "Write the apology printed on the back of a puzzle with an extra piece.",
  "What would you name a racehorse that refuses to hurry?",
  "A planet hires someone to answer its mail. What is the strangest item in the job description?",
  "Write the message left by a neighbor who borrowed your ladder to reach a cloud.",
  "A laundromat introduces a premium service nobody asked for. What is it?",
  "What question would cause a robot to walk out of a job interview?",
  "A kitchen timer starts giving unsolicited advice. What does it say after the first minute?",
  "Write the last line on a receipt from a shop that sells excuses.",
  "A local newspaper hires a crow as its weather reporter. What is tomorrow's headline?",
  "What would a haunted bowling alley put in its birthday party package?",
  "Write the rule added after the first meeting of a club for people who clap too early.",
  "A fortune cookie is having a bad day. What does its slip say?",
  "What is the official excuse for why a ferry missed its own naming ceremony?",
  "Write a dating profile headline for a traffic cone on its day off.",
  "What would the tiny print at the bottom of a ticket to the end of the rainbow say?",
] as const;

const ROUND_OPTIONS = [3, 5, 7] as const;
const MAX_RESPONSE_LENGTH = 180;
const SUBMIT_TIME = 60_000;
const VOTE_TIME = 45_000;

type Phase = "setup" | "submission" | "voting" | "reveal" | "finished";
type CaptionState = {
  phase: Phase;
  round: number;
  rounds: number;
  seed: string;
  promptOrder: number[];
  submissions: Record<string, string | null>;
  votes: Record<string, string | null>;
  scores: Record<string, number>;
  deadline?: number;
};

function rank(seed: string, category: string, value: string | number) {
  return createHmac("sha256", seed).update(`${category}:${value}`).digest("hex");
}

function startRound(state: CaptionState, now: number): CaptionState {
  return {
    ...state,
    phase: "submission",
    round: state.round + 1,
    submissions: {},
    votes: {},
    deadline: now + SUBMIT_TIME,
  };
}

function ballots(state: CaptionState) {
  return Object.entries(state.submissions)
    .flatMap(([authorId, text]) => text === null ? [] : [{
      id: rank(state.seed, `ballot-${state.round}`, authorId),
      authorId,
      text,
    }])
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((ballot, index) => ({ ...ballot, label: `Answer ${String.fromCharCode(65 + index)}` }));
}

function ballotResults(state: CaptionState) {
  const voteTotals = new Map<string, number>();
  for (const vote of Object.values(state.votes)) {
    if (vote !== null) voteTotals.set(vote, (voteTotals.get(vote) ?? 0) + 1);
  }
  const count = Math.max(0, ...voteTotals.values());
  return ballots(state).map((ballot) => {
    const votes = voteTotals.get(ballot.id) ?? 0;
    return { ...ballot, votes, won: count > 0 && votes === count };
  });
}

function reveal(state: CaptionState): CaptionState {
  const scores = { ...state.scores };
  for (const result of ballotResults(state)) {
    if (result.won) scores[result.authorId] += 1;
  }
  return { ...state, phase: "reveal", scores, deadline: undefined };
}

function openVoting(state: CaptionState, now: number): CaptionState {
  if (ballots(state).length < 2) return reveal(state);
  return { ...state, phase: "voting", deadline: now + VOTE_TIME };
}

function playerName(context: GameContext, id: string) {
  return context.players.find((player) => player.id === id)?.name ?? "Player";
}

function standings(state: CaptionState, context: GameContext) {
  return context.players
    .map((player) => ({ label: player.name, score: state.scores[player.id] ?? 0 }))
    .sort((left, right) => right.score - left.score);
}

function isOpen(state: CaptionState, now: number) {
  return state.deadline !== undefined && now < state.deadline;
}

export const game: GameDefinition<CaptionState> = {
  slug: "caption-clash",
  title: "Caption Clash",
  description: "Write a punchline, then vote for the answer that gets the biggest laugh.",
  minimumPlayers: 3,
  maximumPlayers: 10,
  instructions: [
    "The reader rotates each round and can read the prompt aloud. Everyone can write one short answer.",
    "Once the answers are locked, vote for one anonymously. You can only vote for another player's answer.",
    "Every answer tied for the most votes earns its author one point. A round with fewer than two answers or no votes awards zero points.",
  ],

  create(context) {
    if (context.actorId !== context.hostId) throw new Error("Only the host can start a match.");
    if (context.players.length < 3 || context.players.length > 10) {
      throw new Error("Caption Clash needs 3 to 10 players.");
    }
    const seed = randomBytes(32).toString("hex");
    const promptOrder = PROMPTS.map((_, index) => ({ index, order: rank(seed, "prompt", index) }))
      .sort((left, right) => left.order.localeCompare(right.order))
      .map(({ index }) => index);
    return {
      phase: "setup",
      round: 0,
      rounds: 0,
      seed,
      promptOrder,
      submissions: {},
      votes: {},
      scores: Object.fromEntries(context.players.map((player) => [player.id, 0])),
    };
  },

  act(state, context, action) {
    const { actorId, hostId, now } = context;
    if (!Object.hasOwn(state.scores, actorId)) throw new Error("You are not part of this match.");

    if (state.phase === "setup" && action.id === "choose_rounds") {
      if (actorId !== hostId) throw new Error("Only the host can set the number of rounds.");
      const rounds = ROUND_OPTIONS.find((option) => String(option) === action.values.rounds);
      if (!rounds) throw new Error("Choose a 3, 5, or 7 round match.");
      return startRound({ ...state, rounds }, now);
    }

    if (state.phase === "submission" && (action.id === "submit" || action.id === "pass")) {
      if (!isOpen(state, now)) throw new Error("The submission window has closed.");
      if (Object.hasOwn(state.submissions, actorId)) throw new Error("Your answer is already locked.");
      const answer = action.id === "pass" ? null : action.values.answer?.trim();
      if (answer !== null && (!answer || answer.length > MAX_RESPONSE_LENGTH)) {
        throw new Error(`Write an answer of 1 to ${MAX_RESPONSE_LENGTH} characters.`);
      }
      const next = { ...state, submissions: { ...state.submissions, [actorId]: answer ?? null } };
      return Object.keys(next.submissions).length === context.players.length ? openVoting(next, now) : next;
    }

    if (state.phase === "voting" && (action.id === "vote" || action.id === "abstain")) {
      if (!isOpen(state, now)) throw new Error("The voting window has closed.");
      if (Object.hasOwn(state.votes, actorId)) throw new Error("Your ballot is already locked.");
      const vote = action.id === "abstain" ? null : action.values.ballot;
      if (vote !== null && !ballots(state).some((ballot) => ballot.id === vote && ballot.authorId !== actorId)) {
        throw new Error("Choose another player's answer in this round.");
      }
      const next = { ...state, votes: { ...state.votes, [actorId]: vote } };
      return Object.keys(next.votes).length === context.players.length ? reveal(next) : next;
    }

    if ((state.phase === "submission" || state.phase === "voting") && action.id === "close") {
      if (actorId !== hostId) throw new Error("Only the host can close the phase.");
      if (isOpen(state, now)) throw new Error("Wait until the timer ends or everyone locks a decision.");
      return state.phase === "submission" ? openVoting(state, now) : reveal(state);
    }

    if (state.phase === "reveal" && action.id === "advance") {
      if (actorId !== hostId) throw new Error("Only the host can advance the match.");
      return state.round === state.rounds
        ? { ...state, phase: "finished", submissions: {}, votes: {} }
        : startRound(state, now);
    }

    throw new Error("That action is unavailable in this phase.");
  },

  view(state, context) {
    const { actorId, hostId, now } = context;
    const isHost = actorId === hostId;
    const ranking = standings(state, context);
    if (state.phase === "setup") {
      return {
        phase: state.phase,
        heading: "Choose a match length",
        detail: isHost ? "Each round has one prompt and one vote." : "The host is choosing the number of rounds.",
        controls: isHost ? [{
          id: "choose_rounds",
          label: "Start writing",
          fields: [{
            name: "rounds", label: "Rounds", type: "select",
            options: ROUND_OPTIONS.map((rounds) => ({ label: String(rounds), value: String(rounds) })),
          }],
        }] : [],
      };
    }
    if (state.phase === "finished") {
      const winners = ranking.filter((entry) => entry.score === ranking[0]?.score);
      const heading = ranking[0]?.score === 0
        ? "Nobody scored this match"
        : winners.length === 1 ? `${winners[0].label} wins!` : "The match ends in a tie";
      return {
        phase: state.phase,
        heading,
        detail: winners.length > 1 && ranking[0]?.score > 0
          ? winners.map((entry) => entry.label).join(", ")
          : undefined,
        round: `${state.rounds} rounds completed`,
        standings: ranking,
        controls: [],
        finished: true,
      };
    }

    const reader = context.players[(state.round - 1) % context.players.length];
    const prompt = PROMPTS[state.promptOrder[state.round - 1]];
    const round = `Round ${state.round} of ${state.rounds}`;
    const readerDetail = actorId === reader?.id ? "You’re the reader. Read the prompt aloud." : `${reader?.name} is the reader.`;
    const controls: GameControl[] = [];
    const yourAnswer = state.submissions[actorId];
    const privateCards: DisplayCard[] = typeof yourAnswer === "string" ? [{ title: "Your locked answer", body: yourAnswer }] : [];

    if (state.phase === "submission") {
      const locked = Object.hasOwn(state.submissions, actorId);
      if (isOpen(state, now) && !locked) {
        controls.push({
          id: "submit",
          label: "Lock answer",
          fields: [{ name: "answer", label: "Your punchline", type: "textarea", maxLength: MAX_RESPONSE_LENGTH }],
        }, { id: "pass", label: "Pass this round" });
      }
      if (isHost && !isOpen(state, now)) controls.push({ id: "close", label: "Close submissions" });
      const progress = `${Object.keys(state.submissions).length} of ${context.players.length} players have written or passed.`;
      const status = !isOpen(state, now) ? "Time is up." : locked ? "Your decision is locked." : readerDetail;
      return { phase: state.phase, heading: prompt, detail: `${status} ${progress}`, round, deadline: state.deadline, privateCards, controls };
    }

    if (state.phase === "voting") {
      const anonymous = ballots(state);
      const locked = Object.hasOwn(state.votes, actorId);
      const yourVote = anonymous.find((ballot) => ballot.id === state.votes[actorId]);
      if (yourVote) privateCards.push({ title: "Your locked vote", body: yourVote.label });
      if (locked && !yourVote) privateCards.push({ title: "You abstained" });
      if (isOpen(state, now) && !locked) {
        controls.push({
          id: "vote",
          label: "Lock vote",
          fields: [{
            name: "ballot", label: "Pick a favorite", type: "select",
            options: anonymous.filter((ballot) => ballot.authorId !== actorId)
              .map(({ id, label }) => ({ value: id, label })),
          }],
        }, { id: "abstain", label: "Abstain" });
      }
      if (isHost && !isOpen(state, now)) controls.push({ id: "close", label: "Reveal the votes" });
      const progress = `${Object.keys(state.votes).length} of ${context.players.length} players have voted or abstained.`;
      const status = !isOpen(state, now) ? "Time is up." : locked ? "Your ballot is locked." : "Vote for the answer that makes you laugh.";
      return {
        phase: state.phase,
        heading: prompt,
        detail: `${status} ${progress}`,
        round,
        deadline: state.deadline,
        privateCards,
        cards: anonymous.filter((ballot) => ballot.authorId !== actorId)
          .map(({ label, text }) => ({ title: label, body: text })),
        controls,
      };
    }

    const results = ballotResults(state);
    const winnerNames = results.filter((result) => result.won).map((result) => playerName(context, result.authorId));
    if (isHost) {
      controls.push({ id: "advance", label: state.round === state.rounds ? "See final standings" : "Next round" });
    }
    return {
      phase: state.phase,
      heading: winnerNames.length > 0 ? `${winnerNames.join(" and ")} score${winnerNames.length === 1 ? "s" : ""}!` : "No points this round",
      detail: results.length < 2 ? "Two answers are needed to vote." : prompt,
      round,
      cards: results.map(({ label, text, authorId, votes, won }) => ({
        title: `${label} · ${playerName(context, authorId)}`,
        body: text,
        items: [`${votes} ${votes === 1 ? "vote" : "votes"}${won ? " · +1 point" : ""}`],
      })),
      standings: ranking,
      controls,
    };
  },
};
