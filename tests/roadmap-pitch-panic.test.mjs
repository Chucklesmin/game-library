import assert from "node:assert/strict";
import { test } from "node:test";
import { game } from "../src/lib/roadmap/games/pitch-panic.ts";

function setup(count = 4) {
  const players = Array.from({ length: count }, (_, index) => ({ id: "p" + index, name: "Guest " + index }));
  const context = (actorId = "p0", now = 1_000) => ({ players, actorId, hostId: "p0", now });
  return { context, state: game.create(context()) };
}

function action(state, context, actor, label, values = {}, now) {
  const caller = context(actor, now);
  const control = game.view(state, caller).controls.find((item) => item.label === label);
  assert.ok(control, "Missing control " + label + " for " + actor);
  return game.act(state, caller, { id: control.id, values });
}

function moveFor(state, context, actor, label) {
  const control = game.view(state, context(actor)).controls.find((item) => item.label === label);
  assert.ok(control, "Missing control " + label + " for " + actor);
  return control.id;
}

function openVoting(state, context, drafts = true) {
  for (const team of state.teams) {
    const actor = team.members[(state.round - 1) % team.members.length];
    if (drafts) state = action(state, context, actor, "Save team draft", { pitch: team.id + " prototype" });
    state = action(state, context, actor, drafts ? "Lock team pitch" : "Ready to pitch aloud");
  }
  state = action(state, context, "p0", "Start presentations");
  const order = [];
  while (state.phase === "presentation") {
    const team = state.teams[(state.round - 1 + state.turn) % state.teams.length];
    const actor = team.members[(state.round - 1) % team.members.length];
    order.push(actor);
    state = action(state, context, actor, "Finish presentation");
  }
  return { state, order };
}

const passVotes = { useful: "pass", disaster: "pass", buy: "pass" };

test("Pitch Panic balances every supported roster and deals unique independent original cards", () => {
  for (let count = 4; count <= 12; count++) {
    const { state, context } = setup(count);
    assert.equal(state.teams.length, count >= 6 ? 3 : 2);
    assert.equal(new Set(state.teams.flatMap((team) => team.members)).size, count);
    const sizes = state.teams.map((team) => team.members.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    assert.equal(state.constraints.length, 3 * state.teams.length);
    for (let dimension = 0; dimension < 3; dimension++) {
      assert.equal(new Set(state.constraints.map((cards) => cards[dimension])).size, state.constraints.length);
    }
    assert.throws(() => game.create(context("p1")), /host/);
  }
  const { context } = setup();
  for (const count of [3, 13]) {
    const players = Array.from({ length: count }, (_, index) => ({ id: "p" + index, name: "Guest " + index }));
    assert.throws(() => game.create({ ...context(), players }), /4–12/);
  }
});

test("only teammates see a private draft and kit, and a save survives reconnect", () => {
  const { state, context } = setup(5);
  const saved = action(state, context, "p2", "Save team draft", { pitch: "Pocket-sized library for umbrellas" });
  assert.equal(state.pitches[0].draft, "");
  assert.equal(saved.pitches[0].draft, "Pocket-sized library for umbrellas");
  const recovered = JSON.parse(JSON.stringify(saved));
  const host = game.view(recovered, context());
  const partner = game.view(recovered, context("p2"));
  assert.deepEqual(host.privateCards, partner.privateCards);
  assert.equal(host.privateCards[0].body, "Pocket-sized library for umbrellas");
  assert.match(host.privateCards[0].items.join(), /Guest 0, Guest 2, Guest 4/);
  const rival = game.view(recovered, context("p1"));
  assert.ok(!JSON.stringify(rival).includes(host.privateCards[0].body));
  for (const constraint of saved.constraints[0]) assert.ok(!JSON.stringify(rival).includes(constraint));
  assert.throws(() => game.view(recovered, context("outsider")), /room players/);
  assert.throws(() => game.act(recovered, context("outsider"), { id: "anything", values: {} }), /room players/);

  const stealLock = moveFor(saved, context, "p0", "Lock team pitch");
  assert.throws(() => game.act(saved, context("p2"), { id: stealLock, values: {} }), /unavailable/);
  const locked = action(saved, context, "p0", "Lock team pitch");
  const draft = moveFor(saved, context, "p2", "Save team draft");
  assert.throws(() => game.act(locked, context("p2"), { id: draft, values: { pitch: "Overwrite" } }), /unavailable/);
  assert.throws(() => action(saved, context, "p0", "Save team draft", { pitch: "A".repeat(181) }), /180/);
});

test("a complete match rotates pitchers and team order, seals ballots, and shows the final scores", () => {
  const fixture = setup(6);
  let state = fixture.state;
  const { context } = fixture;
  const rotation = [];
  let lastBallot;
  for (let round = 1; round <= 3; round++) {
    const roundStart = state;
    ({ state, order: rotation[round - 1] } = openVoting(state, context, round !== 2));
    assert.equal(state.phase, "voting");
    assert.equal(game.view(state, context()).cards.length, 3);
    const ballot = moveFor(state, context, "p0", "Lock badge ballot");
    if (lastBallot) assert.throws(() => game.act(state, context(), { id: lastBallot, values: passVotes }), /unavailable/);
    lastBallot = ballot;
    const available = game.view(state, context()).controls.find(({ id }) => id === ballot);
    assert.deepEqual(available.fields[0].options.map(({ value }) => value), ["loop", "bolt", "pass"]);
    assert.throws(() => game.act(state, context(), { id: ballot, values: { ...passVotes, useful: "spark" } }), /another team/);
    const opponentBefore = game.view(state, context("p1"));
    state = action(state, context, "p0", "Lock badge ballot", { ...passVotes, useful: "loop" });
    assert.deepEqual(game.view(state, context("p1")), opponentBefore);
    assert.match(game.view(state, context()).detail, /locked/);
    assert.throws(() => game.act(state, context(), { id: ballot, values: passVotes }), /unavailable/);
    for (const actor of ["p1", "p2", "p3", "p4", "p5"]) {
      state = action(state, context, actor, "Lock badge ballot", passVotes);
    }
    state = action(state, context, "p0", "Reveal badges");
    assert.equal(game.view(state, context()).cards[0].body, "Loop Labs");
    assert.equal(game.view(state, context()).cards[1].body, "No award");
    assert.equal(roundStart.phase, "planning");
    state = action(state, context, "p0", round === 3 ? "See final standings" : "Deal next constraints");
  }
  assert.deepEqual(rotation, [["p0", "p1", "p2"], ["p4", "p5", "p3"], ["p2", "p0", "p1"]]);
  const final = game.view(state, context("p4"));
  assert.ok(final.finished);
  assert.equal(final.standings[0].score, 3);
  assert.match(final.detail, /Loop Labs wins/);
  assert.deepEqual(final.controls, []);
});

test("unequal teams normalize opposing turnout and tied leaders each earn one point", () => {
  const { state: initial, context } = setup(5);
  let { state } = openVoting(initial, context);
  for (const actor of ["p0", "p1", "p2", "p3", "p4"]) {
    const own = state.teams.find(({ members }) => members.includes(actor));
    const rival = own.id === "spark" ? "loop" : "spark";
    state = action(state, context, actor, "Lock badge ballot", { ...passVotes, useful: rival, buy: actor === "p3" ? rival : "pass" });
  }
  state = action(state, context, "p0", "Reveal badges");
  const { cards, standings } = game.view(state, context("p1"));
  assert.match(cards[0].body, /Spark Studio and Loop Labs/);
  assert.deepEqual(cards[0].items, ["Spark Studio · 2 of 2", "Loop Labs · 3 of 3"]);
  assert.equal(cards[2].body, "Spark Studio");
  assert.deepEqual(standings, [{ label: "Spark Studio", score: 2 }, { label: "Loop Labs", score: 1 }]);
});

test("timers end missing turns, retain a saved pitch, and prevent stale votes and scoring", () => {
  const { state: initial, context } = setup();
  const saved = action(initial, context, "p0", "Save team draft", { pitch: "A timed draft" });
  const oldDraft = moveFor(saved, context, "p1", "Save team draft");
  assert.throws(() => game.act(saved, context("p1", saved.deadline), { id: oldDraft, values: { pitch: "Too late" } }), /unavailable/);
  let state = action(saved, context, "p3", "Start presentations", {}, saved.deadline);
  assert.equal(game.view(state, context("p0")).cards[0].body, "A timed draft");
  const previousFinish = moveFor(state, context, "p0", "Finish presentation");
  assert.throws(() => game.act(state, context("p1"), { id: previousFinish, values: {} }), /unavailable/);
  state = action(state, context, "p2", "End presentation timer", {}, state.deadline);
  assert.throws(() => game.act(state, context("p0"), { id: previousFinish, values: {} }), /unavailable/);
  state = action(state, context, "p1", "End presentation timer", {}, state.deadline);
  const viewForSpark = game.view(state, context());
  assert.deepEqual(viewForSpark.cards.map(({ title }) => title), ["Spark Studio"]);
  assert.ok(!viewForSpark.controls.some(({ label }) => label === "Lock badge ballot"));
  const beforeDeadline = context("p1", state.deadline - 1);
  const vote = game.view(state, beforeDeadline).controls.find(({ label }) => label === "Lock badge ballot").id;
  assert.throws(() => game.act(state, context("p1", state.deadline), { id: vote, values: passVotes }), /unavailable/);
  const closing = game.view(state, context("p3", state.deadline)).controls.find(({ label }) => label === "Reveal badges").id;
  state = action(state, context, "p3", "Reveal badges", {}, state.deadline);
  assert.ok(game.view(state, context()).cards.every(({ body }) => body === "No award"));
  assert.throws(() => game.act(state, context(), { id: closing, values: {} }), /unavailable/);
});
