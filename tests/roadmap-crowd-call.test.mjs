import assert from "node:assert/strict";
import { test } from "node:test";
import { game } from "../src/lib/roadmap/games/crowd-call.ts";

const players = Array.from({ length: 13 }, (_, index) => ({ id: `guest-${index}`, name: `Guest ${index}` }));
const context = (actor = 0, size = 3, now = 0) => ({
  players: players.slice(0, size),
  actorId: players[actor].id,
  hostId: players[0].id,
  now,
});
const controlId = (state, label, actor = 0, size = 3) => {
  const control = game.view(state, context(actor, size)).controls.find((entry) => entry.label === label);
  assert.ok(control, `Expected "${label}" control for guest ${actor}`);
  return control.id;
};
const move = (state, label, actor = 0, choice, size = 3) => game.act(state, context(actor, size), {
  id: controlId(state, label, actor, size),
  values: choice === undefined ? {} : { choice },
});

test("completes five distinct rounds and gives a new match a fresh scoreboard", () => {
  let state = game.create(context());
  const prompts = new Set();
  for (let round = 1; round <= 5; round++) {
    const current = game.view(state, context(1));
    assert.equal(current.round, `Round ${round} of 5`);
    assert.equal(current.phase, "Prediction");
    assert.deepEqual(current.privateCards, []);
    const options = current.controls[0].fields[0].options;
    assert.ok(options.length >= 3 && options.length <= 5);
    assert.equal(new Set(options.map(({ label }) => label)).size, options.length);
    prompts.add(current.heading);
    state = move(state, "Lock prediction", 0, "0");
    state = move(state, "Lock prediction", 1, "0");
    state = move(state, "Lock prediction", 2, "1");
    state = move(state, "Open voting");
    state = move(state, "Lock vote", 0, "0");
    state = move(state, "Lock vote", 1, "0");
    state = move(state, "Lock vote", 2, "1");
    state = move(state, "Reveal tally");
    assert.deepEqual(game.view(state, context(1)).standings.map(({ score }) => score), [round * 3, round * 3, 0]);
    state = move(state, round === 5 ? "See final standings" : "Next prompt");
  }
  assert.equal(prompts.size, 5);
  const final = game.view(state, context(2));
  assert.equal(final.finished, true);
  assert.match(final.detail, /Guest 0, Guest 1 tie for first with 15 points/);
  assert.deepEqual(final.controls, []);
  const replay = game.create(context(0, 3, 1000));
  assert.deepEqual(Object.values(replay.scores), [0, 0, 0]);
  assert.notEqual(game.view(replay, context()).heading, [...prompts][0]);
});

test("both private phases expose only the requesting guest's choices, including after a refresh", () => {
  let state = game.create(context());
  const original = structuredClone(state);
  const originalState = state;
  const guestChoices = game.view(state, context(1)).controls[0].fields[0].options;
  state = move(state, "Lock prediction", 1, "2");
  assert.deepEqual(originalState, original);
  assert.deepEqual(game.view(state, context(0)).privateCards, []);
  assert.deepEqual(game.view(state, context(2)).privateCards, []);
  assert.deepEqual(game.view(structuredClone(state), context(1)).privateCards,
    [{ title: "Your prediction", body: guestChoices[2].label }]);
  state = move(state, "Open voting");
  state = move(state, "Lock vote", 1, "1");
  const hostView = JSON.parse(JSON.stringify(game.view(state, context())));
  assert.equal(hostView.cards, undefined);
  assert.equal(hostView.standings, undefined);
  assert.deepEqual(hostView.privateCards, []);
  assert.deepEqual(game.view(structuredClone(state), context(1)).privateCards, [
    { title: "Your prediction", body: guestChoices[2].label },
    { title: "Your vote", body: guestChoices[1].label },
  ]);
  assert.throws(() => game.view(state, context(3)), /Only Crowd Call players/);
});

test("stable tied leaders, abstentions, and a zero-ballot round score correctly", () => {
  let state = game.create(context());
  state = move(state, "Lock prediction", 0, "0");
  state = move(state, "Lock prediction", 1, "1");
  state = move(state, "Lock prediction", 2, "1");
  state = move(state, "Open voting");
  state = move(state, "Lock vote", 0, "1");
  state = move(state, "Lock vote", 1, "0");
  state = move(state, "Reveal tally");
  const reveal = game.view(state, context(2));
  assert.match(reveal.detail, /tied for the lead/);
  assert.equal(reveal.cards[0].items.filter((item) => item.includes("Leading answer")).length, 2);
  assert.match(reveal.cards[0].body, /3 predictions · 2 votes/);
  assert.match(reveal.cards[0].body, /Most underestimated: The pinball machine \(\+16\.7 percentage points\)/);
  assert.match(reveal.cards[0].items[0], /1 prediction \(33\.3%\) · 1 vote \(50%\)/);
  assert.match(reveal.cards[0].items[1], /2 predictions \(66\.7%\) · 1 vote \(50%\)/);
  assert.deepEqual(reveal.standings.map(({ score }) => score), [3, 3, 2]);
  assert.deepEqual(reveal.privateCards.at(-1), {
    title: "Your round score", body: "+2", items: ["Prediction · +2", "No vote · +0"],
  });
  const hostReveal = game.view(JSON.parse(JSON.stringify(state)), context());
  assert.deepEqual(hostReveal.privateCards.at(-1), {
    title: "Your round score", body: "+3", items: ["Prediction · +2", "Vote · +1"],
  });
  assert.deepEqual(hostReveal.cards, reveal.cards);
  assert.ok(reveal.privateCards.every(({ title }) => title !== "Your vote"));
  state = move(state, "Next prompt");
  state = move(state, "Lock prediction", 0, "0");
  state = move(state, "Open voting");
  state = move(state, "Reveal tally");
  const empty = game.view(state, context(1));
  assert.match(empty.detail, /nobody earned points/i);
  assert.doesNotMatch(empty.cards[0].body, /Most underestimated/);
  assert.equal(empty.cards[0].items.every((item) => item.endsWith("0 votes")), true);
  assert.deepEqual(empty.standings.map(({ score }) => score), [3, 3, 2]);
  assert.deepEqual(empty.privateCards.at(-1), {
    title: "Your round score", body: "+0", items: ["No prediction · +0", "No vote · +0"],
  });
});

test("shows all equally underestimated choices and skips comparisons without both samples", () => {
  let state = game.create(context());
  state = move(state, "Lock prediction", 0, "0");
  state = move(state, "Open voting");
  state = move(state, "Lock vote", 0, "1");
  state = move(state, "Lock vote", 2, "2");
  state = move(state, "Reveal tally");
  const reveal = game.view(state, context(2));
  assert.match(reveal.cards[0].body, /Most underestimated: The racing cabinet \/ The claw machine \(\+50 percentage points\)/);
  state = move(state, "Next prompt");
  state = move(state, "Open voting");
  state = move(state, "Lock vote", 1, "0");
  state = move(state, "Reveal tally");
  const noPredictions = game.view(state, context());
  assert.equal(noPredictions.cards[0].body, "0 predictions · 1 vote.");
  assert.match(noPredictions.cards[0].items[0], /0 predictions · 1 vote \(100%\)/);
});

test("rejects non-host, outsider, invalid, stale and duplicate moves", () => {
  let state = game.create(context());
  const predict = controlId(state, "Lock prediction");
  const open = controlId(state, "Open voting");
  assert.throws(() => game.act(state, context(1), { id: open, values: {} }), /Only the host/);
  assert.throws(() => game.act(state, context(3), { id: predict, values: { choice: "0" } }), /Only Crowd Call players/);
  for (const choice of ["", "00", "-1", " 1 ", "4", "99"]) {
    assert.throws(() => game.act(state, context(), { id: predict, values: { choice } }), /Pick an answer/);
  }
  state = move(state, "Lock prediction", 0, "0");
  assert.throws(() => game.act(state, context(), { id: predict, values: { choice: "1" } }), /already locked/);
  state = move(state, "Open voting");
  assert.throws(() => game.act(state, context(1), { id: predict, values: { choice: "1" } }), /no longer available/);
  const vote = controlId(state, "Lock vote");
  const close = controlId(state, "Reveal tally");
  assert.throws(() => game.act(state, context(2), { id: close, values: {} }), /Only the host/);
  state = move(state, "Lock vote", 0, "0");
  assert.throws(() => game.act(state, context(), { id: vote, values: { choice: "1" } }), /already locked/);
  state = move(state, "Reveal tally");
  assert.throws(() => game.act(state, context(), { id: close, values: {} }), /no longer available/);
  const next = controlId(state, "Next prompt");
  state = move(state, "Next prompt");
  assert.throws(() => game.act(state, context(), { id: next, values: {} }), /no longer available/);
  assert.throws(() => game.act(state, context(1), { id: predict, values: { choice: "0" } }), /no longer available/);
  assert.throws(() => game.act(game.create(context(0, 3, 1000)), context(),
    { id: predict, values: { choice: "0" } }), /no longer available/);
});

test("supports the 12-player maximum and prevents out-of-range starts", () => {
  assert.throws(() => game.create(context(0, 2)), /3–12 players/);
  assert.throws(() => game.create(context(0, 13)), /3–12 players/);
  assert.throws(() => game.create(context(1, 3)), /Only the host/);
  let state = game.create(context(0, 12));
  for (let actor = 0; actor < 12; actor++) state = move(state, "Lock prediction", actor, "0", 12);
  state = move(state, "Open voting", 0, undefined, 12);
  for (let actor = 0; actor < 12; actor++) state = move(state, "Lock vote", actor, "0", 12);
  state = move(state, "Reveal tally", 0, undefined, 12);
  const reveal = game.view(state, context(11, 12));
  assert.deepEqual(reveal.standings.map(({ score }) => score), Array(12).fill(3));
  assert.match(reveal.cards[0].items[0], /12 votes/);
  assert.doesNotMatch(reveal.cards[0].body, /Most underestimated/);
});
