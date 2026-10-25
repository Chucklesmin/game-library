import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canAddPlayer,
  canStartGame,
  createSubmission,
  drawPrompt,
  getVoteChoices,
  normalizePlayerName,
  recordVote,
  scoreRound,
  validatePlayerName,
} from "../src/lib/cards-against-humanity-rules.mjs";
import { isInvalidGuestSessionError } from "../src/lib/guest-session.mjs";
import { readableErrorMessage } from "../src/lib/error-message.mjs";

const players = [
  { id: "a", name: "Alex", score: 0 },
  { id: "b", name: "Blair", score: 0 },
  { id: "c", name: "Casey", score: 0 },
];
const submissions = [
  { id: "answer-a", authorId: "a", text: "A tiny parade" },
  { id: "answer-b", authorId: "b", text: "An extremely polite raccoon" },
  { id: "answer-c", authorId: "c", text: "The moon's day off" },
];

test("player names are trimmed, limited, and unique without regard to case", () => {
  assert.equal(normalizePlayerName("  Alex  "), "Alex");
  assert.equal(normalizePlayerName("x".repeat(30)).length, 24);
  assert.deepEqual(validatePlayerName(players, " alex "), {
    name: "alex",
    error: "Choose a different name so votes can be revealed clearly.",
  });
  assert.equal(validatePlayerName(players, "   ").error, null);
});

test("local setup enforces the three-player minimum and ten-player maximum", () => {
  assert.equal(canStartGame(players.slice(0, 2)), false);
  assert.equal(canStartGame(players), true);
  assert.equal(canStartGame([...players, ...Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, name: `Player ${index}`, score: 0 }))]), false);
  assert.equal(canAddPlayer(players), true);
  assert.equal(canAddPlayer([...players, ...Array.from({ length: 7 }, (_, index) => ({ id: `p${index}`, name: `Player ${index}`, score: 0 }))]), false);
});

test("prompt selection avoids used prompts until every prompt has been played", () => {
  const prompts = [{ id: "1", text: "one" }, { id: "2", text: "two" }, { id: "3", text: "three" }];
  assert.equal(drawPrompt(prompts, ["1"], () => 0).id, "2");
  assert.equal(drawPrompt(prompts, ["1", "2", "3"], () => 0).id, "1");
  assert.throws(() => drawPrompt([], [], () => 0), /At least one prompt/);
});

test("submissions trim whitespace, enforce length, and reject empty or duplicate responses", () => {
  assert.deepEqual(createSubmission([], "a", "  funny answer  ", "new-answer"), [
    { id: "new-answer", authorId: "a", text: "funny answer" },
  ]);
  assert.equal(createSubmission([], "a", "x".repeat(190), "long-answer")[0].text.length, 180);
  assert.throws(() => createSubmission([], "a", "   ", "empty"), /cannot be empty/);
  assert.throws(() => createSubmission(submissions, "a", "second answer", "duplicate"), /already submitted/);
});

test("blind vote choices exclude a player's own response", () => {
  assert.deepEqual(getVoteChoices(submissions, "b").map((item) => item.id), ["answer-a", "answer-c"]);
});

test("votes reject self-votes, missing responses, and a second vote", () => {
  assert.throws(() => recordVote({}, "a", "answer-a", submissions), /own response/);
  assert.throws(() => recordVote({}, "a", "missing", submissions), /not in this round/);
  const firstVote = recordVote({}, "a", "answer-b", submissions);
  assert.deepEqual(firstVote, { a: "answer-b" });
  assert.throws(() => recordVote(firstVote, "a", "answer-c", submissions), /already voted/);
});

test("each tied winning author earns a point while other scores stay unchanged", () => {
  const votes = { a: "answer-b", b: "answer-c", c: "answer-a" };
  const result = scoreRound(players, submissions, votes);
  assert.deepEqual(result.winners.map((item) => item.id), ["answer-a", "answer-b", "answer-c"]);
  assert.deepEqual(result.players.map((player) => player.score), [1, 1, 1]);
  assert.deepEqual(result.tallies, { "answer-a": 1, "answer-b": 1, "answer-c": 1 });
});

test("only the majority winning author receives a point", () => {
  const result = scoreRound(players, submissions, { a: "answer-b", b: "answer-a", c: "answer-b" });
  assert.deepEqual(result.winners.map((item) => item.id), ["answer-b"]);
  assert.deepEqual(result.players.map((player) => player.score), [0, 1, 0]);
});

test("the original prompt deck matches the locally seeded database pack", () => {
  const promptsFile = readFileSync(new URL("../src/lib/cards-against-humanity-prompts.ts", import.meta.url), "utf8");
  const migrationFile = readFileSync(new URL("../supabase/migrations/20261025010830_cards_against_humanity_multiplayer.sql", import.meta.url), "utf8");
  const appPrompts = [...promptsFile.matchAll(/text: "([^"]+)"/g)].map((match) => match[1]);
  const databasePrompts = [...migrationFile.matchAll(/\('cah-\d+',\$\$(.*?)\$\$\)/gs)].map((match) => match[1]);
  assert.equal(appPrompts.length, 36);
  assert.equal(databasePrompts.length, 36);
  assert.deepEqual(databasePrompts, appPrompts);
});

test("stale guest sessions are recognized without treating network failures as stale", () => {
  assert.equal(isInvalidGuestSessionError({ status: 404, message: "User not found" }), true);
  assert.equal(isInvalidGuestSessionError({ message: "invalid JWT" }), true);
  assert.equal(isInvalidGuestSessionError({ status: 500, message: "connection unavailable" }), false);
  assert.equal(isInvalidGuestSessionError(null), false);
});

test("room errors preserve structured server messages and provide safe fallbacks", () => {
  assert.equal(readableErrorMessage({ message: 'foreign key constraint failed' }, "Could not join room."), "foreign key constraint failed");
  assert.equal(readableErrorMessage(new Error("Room is full"), "Could not join room."), "Room is full");
  assert.equal(readableErrorMessage({ code: "PGRST" }, "Could not join room."), "Could not join room.");
  assert.match(readableErrorMessage(new TypeError("Failed to fetch"), "Could not join room."), /check your connection.*refresh the room/i);
});\n