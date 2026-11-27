import assert from "node:assert/strict";
import { test } from "node:test";
import { game } from "../src/lib/roadmap/games/imposter.ts";

const room = Array.from({ length: 4 }, (_, index) => ({ id: `player-${index}`, name: `Guest ${index + 1}` }));
const host = room[0].id;
const baseline = 1_800_000_000_000;
const context = (actor = host, now = baseline, players = room) => ({ players, actorId: actor, hostId: host, now });
const current = (state, actor, now) => game.view(state, context(actor, now));

function select(state, actor, verb, now) {
  const action = current(state, actor, now).controls.find(({ id }) => id.startsWith(`${verb}.`));
  assert.ok(action, `Missing action ${verb} in ${state.phase}`);
  return action;
}

function move(state, actor, verb, values = {}, now) {
  return game.act(state, context(actor, now), { id: select(state, actor, verb, now).id, values });
}

function moveToVotes(initial) {
  let state = move(initial, host, "start-clues");
  for (let index = 0; index < room.length; index++) {
    const actor = room[(state.round + index) % room.length].id;
    state = move(state, actor, "clue", { clue: `Quiet hint ${index + 1}` });
  }
  assert.equal(state.phase, "discussion");
  return move(state, host, "start-voting");
}

function catchImposter(initial) {
  let state = moveToVotes(initial);
  const imposter = state.roles[state.round];
  const insider = room.find(({ id }) => id !== imposter).id;
  for (const { id } of room) state = move(state, id, "vote", { suspect: id === imposter ? insider : imposter });
  state = move(state, insider, "close-voting");
  assert.equal(state.phase, "last-guess");
  return { state, imposter, insider, word: current(state, insider).privateCards[0].body };
}

test("deals one private category-only role and preserves visibility on reconnect", () => {
  const state = game.create(context());
  const roundTrip = JSON.parse(JSON.stringify(state));
  const imposter = state.roles[0];
  const insiders = room.filter(({ id }) => id !== imposter);
  const word = current(state, insiders[0].id).privateCards[0].body;
  const category = current(state, imposter).cards[0].body;
  assert.ok(category);
  assert.ok(word);
  assert.equal(current(state, imposter).privateCards[0].title, "You are the imposter");
  for (const { id } of insiders) {
    const view = current(roundTrip, id);
    assert.equal(view.privateCards[0].body, word);
    assert.ok(!JSON.stringify(view).includes(imposter));
    assert.equal(view.cards[0].body, category);
  }
  assert.ok(!JSON.stringify(current(roundTrip, imposter)).toLowerCase().includes(word.toLowerCase()));
  assert.throws(() => current(state, "outsider"), /Only players/);
  assert.throws(() => game.create(context(room[1].id)), /Only the host/);
});

test("enforces 4–10 players, distinct terms, and adjacent role rotation", () => {
  assert.throws(() => game.create(context(host, baseline, room.slice(0, 3))), /four to ten/);
  const larger = Array.from({ length: 10 }, (_, index) => ({ id: `player-${index}`, name: `Guest ${index + 1}` }));
  const state = game.create(context(host, baseline, larger));
  assert.equal(state.roles.length, 10);
  assert.ok(state.roles.every((id, index, roles) => index === 0 || roles[index - 1] !== id));
  assert.equal(new Set(state.wordIds).size, 10);
  assert.throws(() => game.create(context(host, baseline, [...larger, { id: "extra", name: "Extra" }])), /four to ten/);
});

test("allows only the active clue player and keeps late or repeated actions out", () => {
  const initial = game.create(context());
  const fixture = { ...initial, roles: [room[3].id, ...initial.roles.slice(1)] };
  const state = move(fixture, host, "start-clues");
  const first = select(state, host, "clue").id;
  const second = room[1].id;
  const order = (gameState, actor, now) => current(gameState, actor, now).cards.find(({ title }) => title === "Clue turn order").items;
  assert.deepEqual(order(state, host), ["Guest 1 · Up now", "Guest 2 · Waiting", "Guest 3 · Waiting", "Guest 4 · Waiting"]);
  assert.deepEqual(order(state, host), order(state, room[3].id));
  assert.throws(() => game.act(state, context(second), { id: first, values: { clue: "something" } }), /unavailable/);
  const word = current(state, host).privateCards[0].body;
  assert.throws(() => game.act(state, context(), { id: first, values: { clue: `Looks like the ${word}!` } }), /secret word/);
  assert.throws(() => game.act(state, context(host, state.deadline), { id: first, values: { clue: "something" } }), /unavailable/);
  const next = move(state, second, "skip-clue", {}, state.deadline);
  assert.equal(next.clues[host], null);
  assert.deepEqual(state.clues, {});
  assert.throws(() => game.act(next, context(), { id: first, values: { clue: "old clue" } }), /unavailable/);
  assert.equal(current(next, second, state.deadline).heading, "Your clue turn");
  const clueAction = select(next, second, "clue", state.deadline);
  const afterClue = game.act(next, context(second, state.deadline), { id: clueAction.id, values: { clue: "Quiet hint" } });
  const refreshed = JSON.parse(JSON.stringify(afterClue));
  const expected = ["Guest 1 · Passed", "Guest 2 · Clue shared", "Guest 3 · Up now", "Guest 4 · Waiting"];
  assert.deepEqual(order(refreshed, room[3].id, state.deadline), expected);
  assert.deepEqual(order(refreshed, second, state.deadline), expected);
});

test("keeps votes private, rejects self-votes and scores a tied vote for the imposter", () => {
  const initial = game.create(context());
  const state = moveToVotes(initial);
  const vote = select(state, host, "vote");
  assert.equal(vote.fields[0].options.some(({ value }) => value === host), false);
  assert.throws(() => move(state, host, "vote", { suspect: host }), /another player/);
  const first = move(state, host, "vote", { suspect: room[1].id });
  assert.equal(current(first, host).privateCards.at(-1).body, room[1].name);
  assert.equal(current(first, room[2].id).privateCards.length, 1);
  assert.ok(!current(first, room[2].id).cards.some(({ title }) => title.includes("tally")));
  assert.throws(() => game.act(first, context(), { id: vote.id, values: { suspect: room[2].id } }), /unavailable/);
  const second = move(first, room[1].id, "vote", { suspect: host });
  const revealed = move(second, room[2].id, "close-voting", {}, second.deadline);
  assert.equal(revealed.result.verdict, "tie");
  assert.equal(revealed.scores[initial.roles[0]], 1);
  assert.equal(Object.values(revealed.scores).reduce((sum, score) => sum + score, 0), 1);
});

test("restricts one final guess to the captured imposter and supports correct, wrong and expired guesses", () => {
  const { state, imposter, insider, word } = catchImposter(game.create(context()));
  const guess = select(state, imposter, "guess").id;
  assert.equal(current(state, insider).controls.length, 0);
  assert.throws(() => game.act(state, context(insider), { id: guess, values: { guess: word } }), /unavailable/);
  const stolen = move(state, imposter, "guess", { guess: `The ${word.toUpperCase()}!` });
  const missed = move(state, imposter, "guess", { guess: "Foam telescope" });
  const expired = move(state, insider, "expire-guess", {}, state.deadline);
  assert.equal(stolen.result.verdict, "stolen");
  assert.equal(stolen.scores[imposter], 1);
  assert.equal(missed.result.verdict, "caught");
  assert.equal(missed.scores[insider], 1);
  assert.equal(expired.result.verdict, "guess-expired");
  assert.equal(expired.scores[imposter], 0);
  assert.equal(current(stolen, insider).cards.find(({ title }) => title === "Secret word").body, word);
  assert.throws(() => game.act(stolen, context(imposter), { id: guess, values: { guess: word } }), /unavailable/);
});

test("completes every round, rotates clue lead, and rejects moves from prior rounds and rematches", () => {
  let state = game.create(context());
  const firstMove = select(state, host, "start-clues").id;
  for (let round = 0; round < room.length; round++) {
    const nextClues = move(state, host, "start-clues");
    assert.equal(current(nextClues, room[round].id).heading, "Your clue turn");
    const vote = moveToVotes(state);
    const imposter = state.roles[round];
    let reveal;
    if (round === 0) {
      const voter = room.find(({ id }) => id === imposter).id;
      const wrongCandidate = room.find(({ id }) => id !== imposter).id;
      const miscast = move(vote, voter, "vote", { suspect: wrongCandidate });
      reveal = move(miscast, host, "close-voting", {}, vote.deadline);
      assert.equal(reveal.result.verdict, "miss");
    } else {
      reveal = move(vote, host, "close-voting", {}, vote.deadline);
      assert.equal(reveal.result.verdict, "no-votes");
    }
    state = move(reveal, host, "advance", {}, vote.deadline);
    assert.throws(() => game.act(state, context(), { id: firstMove, values: {} }), /unavailable/);
  }
  assert.equal(current(state, host).finished, true);
  assert.equal(current(state, host).standings.reduce((sum, row) => sum + row.score, 0), room.length);
  const fresh = game.create(context());
  assert.throws(() => game.act(fresh, context(), { id: firstMove, values: {} }), /unavailable/);
  assert.ok(current(fresh, host).standings.every(({ score }) => score === 0));
});
