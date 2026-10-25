/** @typedef {{ id: string, text: string }} CahPrompt */
/** @typedef {{ id: string, name: string, score: number }} CahPlayer */
/** @typedef {{ id: string, authorId: string, text: string }} CahSubmission */

export function normalizePlayerName(value) {
  return typeof value === "string" ? value.trim().slice(0, 24) : "";
}

/** @param {CahPlayer[]} players */
export function canAddPlayer(players) {
  return players.length < 10;
}

/** @param {CahPlayer[]} players */
export function validatePlayerName(players, rawName) {
  const name = normalizePlayerName(rawName);
  if (!name) return { name, error: null };
  if (!canAddPlayer(players)) return { name, error: "This game supports up to ten players." };
  if (players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return { name, error: "Choose a different name so votes can be revealed clearly." };
  }
  return { name, error: null };
}

/** @param {CahPlayer[]} players */
export function canStartGame(players) {
  return players.length >= 3 && players.length <= 10;
}

/** @param {CahPrompt[]} prompts */
export function drawPrompt(prompts, usedPromptIds, random = Math.random) {
  if (!prompts.length) throw new Error("At least one prompt is required.");
  const unused = prompts.filter((prompt) => !usedPromptIds.includes(prompt.id));
  const available = unused.length ? unused : prompts;
  const sample = Math.max(0, Math.min(random(), 1 - Number.EPSILON));
  return available[Math.floor(sample * available.length)];
}

/** @param {CahSubmission[]} submissions */
export function createSubmission(submissions, authorId, rawText, id) {
  const text = typeof rawText === "string" ? rawText.trim().slice(0, 180) : "";
  if (!text) throw new Error("A response cannot be empty.");
  if (submissions.some((submission) => submission.authorId === authorId)) {
    throw new Error("This player has already submitted a response.");
  }
  return [...submissions, { id, authorId, text }];
}

/** @param {CahSubmission[]} submissions */
export function getVoteChoices(submissions, voterId) {
  return submissions.filter((submission) => submission.authorId !== voterId);
}

/** @param {Record<string, string>} votes @param {CahSubmission[]} submissions */
export function recordVote(votes, voterId, submissionId, submissions) {
  if (Object.hasOwn(votes, voterId)) throw new Error("This player has already voted.");
  const submission = submissions.find((item) => item.id === submissionId);
  if (!submission) throw new Error("That response is not in this round.");
  if (submission.authorId === voterId) throw new Error("Players cannot vote for their own response.");
  return { ...votes, [voterId]: submissionId };
}

/** @param {CahSubmission[]} submissions @param {Record<string, string>} votes */
export function tallyVotes(submissions, votes) {
  return Object.fromEntries(submissions.map((submission) => [
    submission.id,
    Object.values(votes).filter((submissionId) => submissionId === submission.id).length,
  ]));
}

/** @param {CahPlayer[]} players @param {CahSubmission[]} submissions @param {Record<string, string>} votes */
export function scoreRound(players, submissions, votes) {
  const tallies = tallyVotes(submissions, votes);
  const highScore = Math.max(0, ...Object.values(tallies));
  const winners = submissions.filter((submission) => highScore > 0 && tallies[submission.id] === highScore);
  const winningAuthors = new Set(winners.map((submission) => submission.authorId));
  return {
    tallies,
    winners,
    players: players.map((player) => winningAuthors.has(player.id) ? { ...player, score: player.score + 1 } : player),
  };
}
