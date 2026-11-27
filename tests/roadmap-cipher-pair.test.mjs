import assert from "node:assert/strict";
import test from "node:test";
import { game } from "../src/lib/roadmap/games/cipher-pair.ts";

const players = [
  { id: "lead", name: "Jules" },
  { id: "partner", name: "Casey" },
];

function context(actorId = "lead", now = 1000, room = players) {
  return { actorId, now, hostId: "lead", players: room };
}

function control(state, requester = context()) {
  const available = game.view(state, requester).controls;
  assert.equal(available.length, 1);
  return available[0].id;
}

function setup(rounds = "3") {
  const idle = game.create(context());
  return game.act(idle, context(), { id: control(idle), values: { rounds } });
}

function decode(state) {
  const host = game.view(state, context());
  const guest = game.view(state, context("partner"));
  const clues = [host, guest].flatMap((view) => view.privateCards[0].items);
  const key = new Map(clues.map((line) => line.split(" → ")));
  return host.cards[0].items.map((line) =>
    line.split(": ")[1].split(" · ").map((symbol) => key.get(symbol)).join(""),
  ).join(" ");
}

test("starts for exactly two distinct members and lets only the host pick a supported length", () => {
  assert.throws(() => game.create(context("lead", 1000, [players[0]])), /exactly two/);
  assert.throws(() => game.create(context("lead", 1000, [...players, { id: "third", name: "Jamie" }])),
    /exactly two/);
  assert.throws(() => game.create(context("lead", 1000, [players[0], players[0]])), /exactly two/);
  assert.throws(() => game.create(context("partner")), /host/);
  const setupState = game.create(context());
  assert.deepEqual(game.view(setupState, context("partner")).controls, []);
  const id = control(setupState);
  assert.throws(() => game.act(setupState, context("partner"), { id, values: { rounds: "3" } }), /host/);
  assert.throws(() => game.act(setupState, context(), { id, values: { rounds: "4" } }), /3, 5, or 7/);
  assert.equal(game.view(setup("7"), context()).round, "Puzzle 1 of 7");
});

test("private key halves remain complementary and reconnect-safe without exposing the plaintext", () => {
  const state = setup();
  const saved = JSON.parse(JSON.stringify(state));
  const host = game.view(state, context());
  const partner = game.view(state, context("partner"));
  assert.deepEqual(game.view(saved, context("partner")), partner);
  assert.deepEqual(host.cards, partner.cards);
  assert.equal(host.privateCards[0].items.length, 13);
  assert.equal(partner.privateCards[0].items.length, 13);
  assert.equal(new Set([...host.privateCards[0].items, ...partner.privateCards[0].items]).size, 26);
  for (const clue of partner.privateCards[0].items) assert.ok(!JSON.stringify(host).includes(clue));
  for (const clue of host.privateCards[0].items) assert.ok(!JSON.stringify(partner).includes(clue));
  const answer = decode(state);
  assert.match(answer, /^[A-Z]+ [A-Z]+$/);
  assert.equal(host.cards[0].body, `Word lengths: ${answer.split(" ").map((word) => word.length).join(", ")} letters.`);
  assert.ok(!JSON.stringify(host).toUpperCase().includes(answer));
  assert.ok(!JSON.stringify(partner).toUpperCase().includes(answer));
  assert.throws(() => game.view(state, context("intruder")), /players in the room/);
  assert.throws(() => game.act(state, context("intruder"), { id: control(state), values: { answer } }),
    /players in the room/);
});

test("accepts either member's normalized solve and rotates the reader while rejecting stale moves", () => {
  const active = setup();
  const answer = decode(active);
  assert.match(game.view(active, context()).detail, /Jules reads/);
  const request = context("partner", 5000);
  const id = control(active, request);
  const reveal = game.act(active, request, { id, values: { answer: answer.toLowerCase().replace(" ", "-") } });
  const view = game.view(reveal, context());
  assert.equal(view.heading, "Code cracked");
  assert.equal(view.cards[0].body.toUpperCase(), answer);
  assert.deepEqual(view.standings.map(({ score }) => score), [1, 1, 101]);
  assert.deepEqual(game.view(reveal, request).controls, []);
  assert.throws(() => game.act(reveal, request, { id: control(reveal), values: {} }), /host/);
  assert.throws(() => game.act(reveal, request, { id, values: { answer } }), /unavailable/);
  const next = game.act(reveal, context(), { id: control(reveal), values: {} });
  assert.match(game.view(next, context()).detail, /Casey reads/);
  assert.throws(() => game.act(next, request, { id, values: { answer } }), /unavailable/);
});

test("consumes only valid wrong submissions and ends the round after two strikes", () => {
  const state = setup();
  const id = control(state);
  assert.throws(() => game.act(state, context(), { id, values: { answer: "..." } }), /Enter a phrase/);
  assert.throws(() => game.act(state, context(), { id, values: { answer: "a".repeat(81) } }), /Enter a phrase/);
  const missed = game.act(state, context(), { id, values: { answer: "wrong" } });
  assert.match(game.view(missed, context()).detail, /1 strike left/);
  assert.match(game.view(state, context()).detail, /2 strikes left/);
  assert.throws(() => game.act(missed, context(), { id, values: { answer: "wrong" } }), /unavailable/);
  const nextId = control(missed, context("partner"));
  const reveal = game.act(missed, context("partner"), { id: nextId, values: { answer: "another wrong" } });
  const view = game.view(reveal, context());
  assert.equal(view.heading, "No strikes left");
  assert.deepEqual(view.standings.map(({ score }) => score), [0, 0, 0]);
  assert.ok(!JSON.stringify(view).includes("another wrong"));
});

test("rejects submissions on the deadline and lets either player reveal an expired code", () => {
  const state = setup();
  const deadline = game.view(state, context()).deadline;
  const id = control(state);
  const lateGuest = context("partner", deadline);
  const expire = control(state, lateGuest);
  assert.throws(() => game.act(state, lateGuest, { id, values: { answer: "expired" } }), /unavailable/);
  assert.throws(() => game.act(state, context("partner", deadline - 1), { id: expire, values: {} }),
    /unavailable/);
  const result = game.act(state, lateGuest, { id: expire, values: {} });
  assert.equal(game.view(result, lateGuest).heading, "Time ran out");
});

test("plays a full match with fresh puzzles and reports a cooperative streak and time", () => {
  let state = setup();
  const phrases = new Set();
  for (let index = 0; index < 3; index += 1) {
    const answer = decode(state);
    phrases.add(answer);
    const turn = context(players[index % 2].id);
    state = game.act(state, turn, { id: control(state, turn), values: { answer } });
    state = game.act(state, context(), { id: control(state), values: {} });
  }
  const completed = game.view(state, context());
  assert.equal(phrases.size, 3);
  assert.equal(completed.finished, true);
  assert.match(completed.detail, /3 of 3/);
  assert.deepEqual(completed.standings.map(({ score }) => score), [3, 3, 315]);
  assert.deepEqual(completed.controls, []);
  assert.throws(() => game.act(state, context(), { id: "repeat", values: {} }), /unavailable/);
});
