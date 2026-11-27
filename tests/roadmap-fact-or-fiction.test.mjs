import assert from "node:assert/strict";
import test from "node:test";
import { factPack, game } from "../src/lib/roadmap/games/fact-or-fiction.ts";

const players = [
  { id: "host", name: "Alex" },
  { id: "player-b", name: "Blair" },
  { id: "player-c", name: "Casey" },
  { id: "player-d", name: "Devon" },
  { id: "player-e", name: "Ellis" },
];
const context = (actorId = "host", now = 1_000, roster = players) => ({
  players: roster, actorId, hostId: "host", now,
});
const control = (state, ctx, label) => game.view(state, ctx).controls.find((move) => move.label === label);
const move = (state, ctx, label, values = {}) => {
  const offered = control(state, ctx, label);
  assert.ok(offered, label);
  return game.act(state, ctx, { id: offered.id, values });
};
const answer = (state, correct, confidence = "steady") => ({
  verdict: (factPack[state.deck[state.round]].truth === correct) ? "fact" : "fiction",
  confidence,
});

test("the fact pack is balanced, attributable and well-covered by category", () => {
  assert.equal(factPack.length, 16);
  assert.equal(factPack.filter(({ truth }) => truth).length, 8);
  assert.equal(new Set(factPack.map(({ id }) => id)).size, factPack.length);
  assert.equal(new Set(factPack.map(({ statement }) => statement)).size, factPack.length);
  assert.equal(new Set(factPack.map(({ category }) => category)).size, 7);
  for (const fact of factPack) {
    assert.equal(fact.rating, "General");
    assert.ok(fact.explanation.length > 25);
    assert.match(fact.source.label, /\S/);
    assert.equal(new URL(fact.source.href).protocol, "https:");
    assert.match(fact.source.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("five-round match covers all confidence outcomes, ties, and reader rotation", () => {
  let state = game.create(context());
  const categories = new Set();
  for (let round = 0; round < 5; round++) {
    const fact = factPack[state.deck[round]];
    categories.add(fact.category);
    assert.equal(state.playerIds[state.reader], players[round].id);
    for (const [index, player] of players.entries()) {
      const verdict = answer(state, index <= 2, index === 0 || index === 4 ? "bold" : "steady");
      state = move(state, context(player.id, 1_000 + 15_000 * round), "Lock verdict", verdict);
    }
    const shown = game.view(state, context());
    assert.equal(shown.phase, round < 4 ? "reveal" : "complete");
    assert.ok(shown.cards.some((card) => card.link?.href === fact.source.href));
    assert.deepEqual(shown.privateCards, [{
      title: "Your round score", body: "+3 points. Correct verdict with Bold confidence.",
    }]);
    assert.equal(game.view(state, context("player-b")).privateCards[0].body,
      "+1 point. Correct verdict with Steady confidence.");
    assert.equal(game.view(state, context("player-d")).privateCards[0].body,
      "0 points. Incorrect verdict with Steady confidence.");
    assert.deepEqual(shown.standings.map(({ score }) => score), [3, 1, 1, 0, -2].map((score) => score * (round + 1)));
    if (round < 4) state = move(state, context("host", 5_000 + 15_000 * round), "Next statement");
  }
  assert.equal(categories.size, 5);
  assert.match(game.view(state, context()).detail, /^Alex wins\.$/);

  const duo = players.slice(0, 2);
  state = game.create(context("host", 1_000, duo));
  for (let round = 0; round < 5; round++) {
    state = move(state, context("host", 1_000, duo), "Lock verdict", answer(state, true));
    state = move(state, context("player-b", 1_000, duo), "Lock verdict", answer(state, true));
    if (round < 4) state = move(state, context("host", 1_000, duo), "Next statement");
  }
  assert.equal(game.view(state, context("host", 1_000, duo)).detail, "Alex, Blair share first place.");
});

test("only the author sees a locked ballot before deadline or a completed vote", () => {
  const initial = game.create(context());
  const fact = factPack[initial.deck[0]];
  const expected = answer(initial, true, "bold");
  const locked = move(initial, context(), "Lock verdict", expected);
  assert.deepEqual(initial.ballots, {});
  const persisted = JSON.parse(JSON.stringify(locked));
  for (const player of players) {
    const shown = game.view(persisted, context(player.id));
    const serialized = JSON.stringify(shown);
    assert.equal(serialized.includes(fact.explanation), false);
    assert.equal(serialized.includes(fact.source.href), false);
    assert.equal(serialized.includes("Your locked verdict"), player.id === "host");
    assert.equal(serialized.includes("Your round score"), false);
    assert.equal(serialized.includes("playerIds"), false);
    assert.deepEqual(shown.standings.map(({ score }) => score), [0, 0, 0, 0, 0]);
  }
  assert.deepEqual(game.view(locked, context()), game.view(persisted, context()));
});

test("deadline reveals partial or empty ballots once and awards zero for abstention", () => {
  const initial = game.create(context());
  const locked = move(initial, context(), "Lock verdict", answer(initial, false, "bold"));
  assert.equal(control(locked, context("player-b", initial.deadline - 1), "Reveal the answer"), undefined);
  const late = context("player-b", initial.deadline);
  const command = control(locked, late, "Reveal the answer");
  assert.throws(() => game.act(locked, context("player-b", initial.deadline - 1), { id: command.id, values: {} }), /timer/);
  assert.throws(() => game.act(locked, late, { id: control(initial, context(), "Lock verdict").id, values: answer(locked, true) }), /closed/);
  const revealed = move(locked, late, "Reveal the answer");
  const restored = JSON.parse(JSON.stringify(revealed));
  assert.deepEqual(game.view(restored, late).standings.map(({ score }) => score), [0, 0, 0, 0, -2]);
  assert.equal(game.view(restored, late).privateCards[0].body, "0 points. You left this statement unanswered.");
  assert.equal(game.view(restored, context()).privateCards[0].body,
    "-2 points. Incorrect verdict with Bold confidence.");
  assert.throws(() => game.act(revealed, late, { id: command.id, values: {} }), /unavailable/);
  const next = move(revealed, context("host", initial.deadline), "Next statement");
  const skipped = move(next, context("player-c", next.deadline), "Reveal the answer");
  assert.deepEqual(skipped.scores, next.scores);
});

test("authorization, roster bounds, invalid selections and stale commands are rejected", () => {
  const ten = [...players, ...Array.from({ length: 5 }, (_, index) => ({ id: `extra-${index}`, name: `Extra ${index}` }))];
  assert.equal(game.create(context("host", 1_000, ten)).playerIds.length, 10);
  assert.throws(() => game.create(context("host", 1_000, players.slice(0, 1))), /2–10/);
  assert.throws(() => game.create(context("host", 1_000, [...ten, { id: "surplus", name: "Surplus" }])), /2–10/);
  assert.throws(() => game.create(context("player-b")), /host/);
  const state = game.create(context());
  const id = control(state, context(), "Lock verdict").id;
  assert.throws(() => game.view(state, context("stranger")), /Only a player/);
  assert.throws(() => game.act(state, context("stranger"), { id, values: answer(state, true) }), /Only a player/);
  assert.throws(() => game.act(state, context(), { id, values: { verdict: "fact", confidence: "max" } }), /confidence/);
  const locked = game.act(state, context(), { id, values: answer(state, true) });
  assert.throws(() => game.act(locked, context(), { id, values: answer(state, false) }), /already locked/);
  const due = context("host", state.deadline);
  const revealed = move(locked, due, "Reveal the answer");
  const next = control(revealed, due, "Next statement");
  assert.throws(() => game.act(revealed, context("player-b"), { id: next.id, values: {} }), /host/);
  const following = move(revealed, due, "Next statement");
  assert.throws(() => game.act(following, due, { id, values: answer(following, true) }), /unavailable/);
  assert.throws(() => game.act(game.create(context()), context(), { id, values: answer(state, true) }), /unavailable/);
});
