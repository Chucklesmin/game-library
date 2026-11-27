import assert from "node:assert/strict";
import test from "node:test";
import { game } from "../src/lib/roadmap/games/alibi.ts";

const players = Array.from({ length: 10 }, (_, index) => ({ id: `player-${index}`, name: `Guest ${index}` }));
const context = (actorId = players[0].id, now = 1_000, roster = players.slice(0, 4)) =>
  ({ players: roster, hostId: roster[0].id, actorId, now });
const initial = () => game.create(context());
const projection = (state, ctx = context()) => game.view(state, ctx);

function action(state, label, ctx = context()) {
  const control = projection(state, ctx).controls.find((entry) => entry.label === label);
  assert.ok(control, `Missing action: ${label}`);
  return control.id;
}
function move(state, label, values = {}, ctx = context()) {
  return game.act(state, ctx, { id: action(state, label, ctx), values });
}
function accuse(state, voter, target) {
  return move(state, target ? "Lock accusation" : "Abstain", target ? { target } : {}, context(voter));
}
function openAccusations(state) {
  state = move(state, "Start alibis");
  for (let index = 0; index < state.players.length; index++) {
    const speaker = state.players[(state.round + index) % state.players.length];
    state = move(state, "Share alibi", { statement: `I checked my station before the shift.` }, context(speaker));
  }
  assert.equal(state.stage, "discussion");
  return move(state, "Open accusations");
}

test("enforces the roster bounds and deals ten different packets with exactly one obsolete shift note", () => {
  assert.throws(() => game.create(context(players[0].id, 0, players.slice(0, 3))), /four to ten/);
  assert.throws(() => game.create(context(players[0].id, 0, [...players, { id: "extra", name: "Extra" }])), /four to ten/);
  assert.throws(() => game.create(context(players[1].id)), /Only the host/);
  const state = game.create(context(players[0].id, 0, players));
  const views = players.map(({ id }) => projection(state, context(id, 0, players)));
  assert.equal(new Set(views.map(({ privateCards }) => privateCards[0].title)).size, 10);
  const notes = views.map(({ privateCards }) => privateCards[0].items[0]);
  assert.deepEqual([...new Set(notes)].map((note) => notes.filter((value) => value === note).length).sort(), [1, 9]);
  const obsolete = notes[state.players.indexOf(state.cases[0].mismatch)];
  for (const [index, view] of views.entries()) {
    assert.equal(JSON.stringify(view).includes(obsolete), state.players[index] === state.cases[0].mismatch);
    assert.ok(!("cases" in view) && !("mismatch" in view));
    assert.deepEqual(projection(JSON.parse(JSON.stringify(state)), context(players[index].id, 0, players)), view);
  }
  assert.throws(() => projection(state, context("outsider", 0, players)), /Only players/);
});

test("keeps all accusations sealed, rejects repeat/self/unknown votes, and scores only correct accusers on a clear catch", () => {
  let state = openAccusations(initial());
  const mismatch = state.cases[0].mismatch;
  const [first, second, third] = state.players.filter((id) => id !== mismatch);
  const lock = action(state, "Lock accusation", context(first));
  assert.throws(() => game.act(state, context(first), { id: lock, values: { target: first } }), /Accuse another player/);
  assert.throws(() => game.act(state, context(first), { id: lock, values: { target: "unknown" } }), /Accuse another player/);
  const prior = structuredClone(state);
  state = accuse(state, first, mismatch);
  assert.deepEqual(prior.accusations, {});
  const guest = projection(state, context(second));
  assert.equal(guest.heading, "Accuse privately");
  assert.match(guest.detail, /1 of 4 decisions locked/);
  assert.ok(!guest.cards.some(({ title }) => /tally|mismatched packet/i.test(title)));
  assert.deepEqual(guest.cards, projection(prior, context(second)).cards);
  assert.throws(() => game.act(state, context(first), { id: lock, values: { target: mismatch } }), /unavailable/);
  state = accuse(state, second, mismatch);
  state = accuse(state, third, mismatch);
  state = accuse(state, mismatch, first);
  assert.equal(state.stage, "reveal");
  assert.equal(state.reveal.caught, true);
  assert.deepEqual([state.scores[first], state.scores[second], state.scores[third], state.scores[mismatch]], [1, 1, 1, 0]);
  const result = projection(state);
  assert.equal(result.privateCards, undefined);
  assert.ok(result.cards.some(({ title }) => title === "Correct briefing"));
  assert.ok(result.cards.some(({ title }) => title === "Accusation tally"));
  assert.ok(result.cards.every((card) => !card.items?.some((item) => item.includes("voted for"))));
});

test("each player sees the same speaking order and progress, including shared alibis and passes", () => {
  let state = move(initial(), "Start alibis");
  const order = (active, actorId) => projection(active, context(actorId)).cards.find(({ title }) => title === "Speaking order").items;
  assert.deepEqual(order(state, players[3].id), ["Guest 0 · Up now", "Guest 1 · Waiting", "Guest 2 · Waiting", "Guest 3 · Waiting"]);
  state = move(state, "Share alibi", { statement: "I checked in before the shift." });
  state = move(state, "Pass this turn", {}, context(players[1].id));
  const refreshed = JSON.parse(JSON.stringify(state));
  const expected = ["Guest 0 · Alibi shared", "Guest 1 · Passed", "Guest 2 · Up now", "Guest 3 · Waiting"];
  for (const { id } of players.slice(0, 4)) assert.deepEqual(order(refreshed, id), expected);
});

test("times out inactive steps, rejects wrong speakers and stale moves, and awards the mismatch when no one votes", () => {
  let state = move(initial(), "Start alibis");
  const [first, second, third] = state.players;
  const initialAlibi = action(state, "Share alibi", context(first));
  assert.throws(() => game.act(state, context(second), { id: initialAlibi, values: { statement: "I was there." } }), /unavailable/);
  assert.throws(() => game.act(state, context(first), { id: initialAlibi, values: { statement: "a".repeat(181) } }), /180/);
  assert.throws(() => game.act(state, context(first), { id: initialAlibi, values: { statement: "  " } }), /Write an alibi/);
  while (state.stage === "alibis") {
    const afterDeadline = context(third, state.deadline);
    assert.ok(!projection(state, afterDeadline).controls.some(({ label }) => label === "Share alibi"));
    state = move(state, "Move past expired turn", {}, afterDeadline);
  }
  assert.throws(() => game.act(state, context(first), { id: initialAlibi, values: { statement: "A late alibi." } }), /earlier/);
  assert.equal(Object.values(state.statements).filter((value) => value === null).length, 4);
  assert.ok(!projection(state, context(third, state.deadline - 1)).controls.length);
  state = move(state, "Open accusations", {}, context(third, state.deadline));
  assert.ok(!projection(state, context(third, state.deadline - 1)).controls.some(({ label }) => label === "Reveal accusations"));
  state = move(state, "Reveal accusations", {}, context(third, state.deadline));
  assert.equal(state.reveal.votes, 0);
  assert.equal(state.scores[state.cases[0].mismatch], 1);
  assert.ok(projection(state).cards.some(({ title }) => title === "No accusations were cast"));
});

test("runs three distinct incidents, rotates reader, scores ties for the mismatch, and ends the match", () => {
  let state = initial();
  const mismatchSchedule = state.cases.map(({ mismatch }) => mismatch);
  assert.equal(new Set(mismatchSchedule).size, 3);
  assert.equal(new Set(state.cases.map(({ scene }) => scene)).size, 3);
  for (let round = 0; round < 3; round++) {
    const reader = state.players[round];
    const briefing = projection(state, context(reader));
    assert.match(briefing.detail, new RegExp(`Guest ${round} reads`));
    const wrongLeader = state.players.find((id) => id !== mismatchSchedule[round]);
    const inner = state.players.filter((id) => id !== mismatchSchedule[round] && id !== wrongLeader);
    state = openAccusations(state);
    state = accuse(state, inner[0], mismatchSchedule[round]);
    state = accuse(state, inner[1], wrongLeader);
    state = accuse(state, wrongLeader, null);
    state = accuse(state, mismatchSchedule[round], null);
    assert.equal(state.stage, "reveal");
    assert.equal(state.reveal.caught, false);
    assert.equal(state.reveal.tally[mismatchSchedule[round]], 1);
    assert.equal(state.reveal.tally[wrongLeader], 1);
    assert.equal(state.scores[mismatchSchedule[round]], 1);
    const next = action(state, round === 2 ? "See final standings" : "Open the next incident", context(reader));
    state = game.act(state, context(reader), { id: next, values: {} });
    assert.throws(() => game.act(state, context(reader), { id: next, values: {} }), /earlier/);
  }
  const complete = projection(state);
  assert.equal(complete.finished, true);
  assert.equal(complete.heading, "Tied for first");
  assert.deepEqual(complete.standings.map(({ score }) => score), [1, 1, 1, 0]);
});
