import assert from "node:assert/strict";
import { test } from "node:test";
import { game } from "../src/lib/roadmap/games/counterpoint.ts";

const players = [{ id: "one", name: "Ari" }, { id: "two", name: "Bo" }];
const lenses = { "Most practical": "practical", "Most creative": "creative", "Most fair": "fair" };
const context = (seat = 0, now = 1000) => ({ actorId: players[seat].id, hostId: "one", now, players });
const look = (state, seat = 0, now = 1000) => game.view(state, context(seat, now));
const control = (state, seat, label, now = 1000) => {
  const found = look(state, seat, now).controls.find((move) => move.label === label);
  assert.ok(found, `Missing ${label} from ${state.phase} for seat ${seat}`);
  return found;
};
const act = (state, seat, label, values = {}, now = 1000) =>
  game.act(state, context(seat, now), { id: control(state, seat, label, now).id, values });

function debate(state, opener) {
  const follower = 1 - opener;
  state = act(state, opener, "Ready to debate");
  state = act(state, follower, "Ready to debate");
  state = act(state, opener, "Submit argument", { text: "My opening point." });
  state = act(state, follower, "Submit argument", { text: "My opposing point." });
  state = act(state, opener, "Submit rebuttal", { text: "My first reply." });
  return act(state, follower, "Submit rebuttal", { text: "My final reply." });
}

function roundLens(state) {
  const [line] = look(state).cards[0].items;
  return lenses[line.replace("Featured lens: ", "")];
}

test("requires exactly two seats and host initiation", () => {
  assert.deepEqual([game.minimumPlayers, game.maximumPlayers], [2, 2]);
  assert.throws(() => game.create({ ...context(), players: players.slice(0, 1) }), /exactly two/i);
  assert.throws(() => game.create({ ...context(), players: [...players, { id: "three", name: "Cat" }] }), /exactly two/i);
  assert.throws(() => game.create({ ...context(), players: [players[0], players[0]] }), /exactly two/i);
  assert.throws(() => game.create(context(1)), /host/i);
  assert.throws(() => game.create({ ...context(), actorId: "outside", hostId: "outside" }), /these two/i);
});

test("orders speeches, rejects illegal or stale moves and preserves previous state", () => {
  const state = game.create(context());
  assert.equal(look(state).cards.some(({ title }) => title === "Speech progress"), false);
  assert.match(look(state, 0).detail, /you’re arguing for/i);
  assert.match(look(state, 1).detail, /you’re arguing against/i);
  const readyId = control(state, 0, "Ready to debate").id;
  const afterReady = act(state, 0, "Ready to debate");
  assert.deepEqual(state.ready, [false, false]);
  assert.throws(() => game.act(afterReady, context(), { id: readyId, values: {} }), /already ready/i);
  const opened = act(afterReady, 1, "Ready to debate");
  assert.deepEqual(look(opened).cards.find(({ title }) => title === "Speech progress").items, [
    "Ari · Argument: due now · Rebuttal: still due",
    "Bo · Argument: still due · Rebuttal: still due",
  ]);
  const submit = control(opened, 0, "Submit argument");
  assert.equal(look(opened, 1).controls.length, 0);
  const invalid = (value) => game.act(opened, context(), { id: submit.id, values: { text: value } });
  assert.throws(() => invalid("  "), /between/i);
  assert.throws(() => invalid("x".repeat(281)), /between/i);
  assert.throws(() => game.act(opened, context(1), { id: submit.id, values: { text: "Jump the queue." } }), /wait/i);
  const response = act(opened, 0, "Submit argument", { text: "  A readable case.  " });
  assert.equal(response.arguments[0], "A readable case.");
  assert.equal(look(response, 1).cards[1].body, "A readable case.");
  assert.deepEqual(look(response, 1).cards.find(({ title }) => title === "Speech progress").items, [
    "Ari · Argument: submitted · Rebuttal: still due",
    "Bo · Argument: due now · Rebuttal: still due",
  ]);
  assert.throws(() => game.act(response, context(0), { id: submit.id, values: { text: "Repeated" } }), /different step/i);
  assert.throws(() => game.act(response, { ...context(), actorId: "outside" }, { id: submit.id, values: {} }), /these two/i);
  assert.throws(() => game.view(response, { ...context(), actorId: "outside" }), /these two/i);
});

test("keeps both lens choices sealed until reveal, including restored sessions", () => {
  let state = debate(game.create(context()), 0);
  const featured = roundLens(state);
  const alternatives = Object.values(lenses).filter((lens) => lens !== featured);
  const id = control(state, 0, "Lock choices").id;
  assert.throws(() => game.act(state, context(), {
    id, values: { emphasis: "__proto__", guess: featured },
  }), /available judging lenses/i);
  state = act(state, 0, "Lock choices", { emphasis: featured, guess: alternatives[0] });
  const resumed = JSON.parse(JSON.stringify(state));
  assert.deepEqual(look(resumed, 0), look(state, 0));
  assert.match(JSON.stringify(look(resumed, 0)), /Your locked choices/);
  assert.equal(look(resumed, 1).privateCards, undefined);
  assert.doesNotMatch(JSON.stringify(look(resumed, 1).cards), /declared lens|predicted opponent/i);
  assert.deepEqual(look(resumed, 1).standings.map(({ score }) => score), [0, 0]);
  assert.throws(() => game.act(resumed, context(), {
    id, values: { emphasis: alternatives[1], guess: featured },
  }), /already locked/i);
  state = act(resumed, 1, "Lock choices", { emphasis: alternatives[0], guess: alternatives[1] });
  assert.equal(state.phase, "reveal");
  assert.deepEqual(state.result.points, [2, 0]);
  assert.deepEqual(state.wins, [1, 0]);
  const result = JSON.stringify(look(state, 1));
  assert.match(result, /Declared lens/);
  assert.match(result, /Predicted opponent/);
  assert.match(result, /Ari wins the round/);
});

test("expires preparation, speeches and predictions and permits recovery by either player", () => {
  let state = game.create(context());
  const staleReady = control(state, 1, "Ready to debate").id;
  const deadline = state.deadline;
  assert.throws(() => game.act(state, context(1, deadline), { id: staleReady, values: {} }), /time is up/i);
  const timeout = control(state, 1, "Continue", deadline);
  assert.throws(() => game.act(state, context(1, deadline - 1), { id: timeout.id, values: {} }), /time remains/i);
  state = act(state, 1, "Continue", {}, deadline);
  assert.equal(state.phase, "argument");
  state = act(state, 1, "Continue", {}, state.deadline);
  state = act(state, 1, "Submit argument", { text: "I made my case." }, state.deadline - 1);
  state = act(state, 0, "Pass this turn", {}, state.deadline - 1);
  state = act(state, 1, "Submit rebuttal", { text: "This is my response." }, state.deadline - 1);
  assert.equal(state.phase, "prediction");
  const progress = ["Ari · Argument: passed or timed out · Rebuttal: passed or timed out",
    "Bo · Argument: submitted · Rebuttal: submitted"];
  assert.deepEqual(look(JSON.parse(JSON.stringify(state))).cards.find(({ title }) => title === "Speech progress").items, progress);
  const featured = roundLens(state);
  state = act(state, 0, "Lock choices", { emphasis: featured, guess: featured }, state.deadline - 1);
  state = act(state, 1, "Continue", {}, state.deadline);
  assert.deepEqual(state.result.points, [0, 0]);
  assert.deepEqual(state.wins, [0, 0]);
  assert.match(look(state).detail, /tied/i);
  assert.match(JSON.stringify(look(state).cards), /No prediction submitted/);
});

test("runs five nonrepeating rounds, alternates sides and records a match draw", () => {
  let state = game.create(context());
  const claims = new Set();
  let previousLens;
  for (let round = 1; round <= 5; round++) {
    const opener = (round - 1) % 2;
    assert.match(look(state, opener).detail, /arguing for/i);
    assert.match(look(state, 1 - opener).detail, /arguing against/i);
    claims.add(look(state).cards[0].body);
    const staleReady = control(state, 0, "Ready to debate").id;
    const featured = roundLens(state);
    assert.notEqual(featured, previousLens);
    previousLens = featured;
    state = debate(state, opener);
    state = act(state, 1, "Lock choices", { emphasis: featured, guess: featured });
    state = act(state, 0, "Lock choices", { emphasis: featured, guess: featured });
    assert.deepEqual(state.result.points, [2, 2]);
    if (round < 5) {
      state = act(state, 1, "Next claim");
      assert.throws(() => game.act(state, context(), { id: staleReady, values: {} }), /different step/i);
    }
  }
  assert.equal(claims.size, 5);
  assert.equal(state.phase, "complete");
  assert.equal(look(state).heading, "Match drawn");
  assert.equal(look(state).finished, true);
  assert.throws(() => game.act(state, context(), { id: "unknown", values: {} }), /ended/i);
});

test("three wins end the match without requiring five rounds", () => {
  let state = game.create(context());
  for (let round = 1; round <= 3; round++) {
    const featured = roundLens(state);
    const offLens = Object.values(lenses).find((lens) => lens !== featured);
    state = debate(state, (round - 1) % 2);
    state = act(state, 0, "Lock choices", { emphasis: featured, guess: offLens });
    state = act(state, 1, "Lock choices", { emphasis: offLens, guess: featured });
    assert.deepEqual(state.result.points, [2, 1]);
    if (round < 3) state = act(state, 0, "Next claim");
  }
  assert.equal(state.phase, "complete");
  assert.deepEqual(state.wins, [3, 0]);
  assert.match(look(state, 1).heading, /Ari wins the match/);
});
