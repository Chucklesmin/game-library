import assert from "node:assert/strict";
import test from "node:test";
import { game, makeMap } from "../src/lib/roadmap/games/switchboard.ts";

const players = [{ id: "first", name: "First" }, { id: "second", name: "Second" }];
const context = (actorId = "first") => ({ players, actorId, hostId: "first", now: 0 });
const vectors = { North: [-1, 0], East: [0, 1], South: [1, 0], West: [0, -1] };

function countUnblockedRoutes(map) {
  const destination = map.route.at(-1).join();
  const hazards = new Set(map.hazards.map((cell) => cell.join()));
  function search(cell, visited) {
    if (cell.join() === destination) return 1;
    let remaining = 0;
    for (const vector of Object.values(vectors)) {
      const next = vector.map((offset, index) => cell[index] + offset);
      const key = next.join();
      if (next.some((coordinate) => coordinate < 0 || coordinate > 3) || hazards.has(key) || visited.has(key)) continue;
      remaining += search(next, new Set([...visited, key]));
      if (remaining >= 2) return remaining;
    }
    return remaining;
  }
  return search(map.route[0], new Set([map.route[0].join()]));
}

function availableOptions(state, actorId, position) {
  return game.view(state, context(actorId)).controls.map((control) => ({
    ...control,
    cell: vectors[control.label].map((offset, index) => position[index] + offset),
  }));
}

function followRoute(state) {
  const map = makeMap(state.seed, state.leg);
  const actorId = state.crew[1 - state.leg];
  for (let step = state.position; step < map.route.length - 1; step += 1) {
    const next = availableOptions(state, actorId, map.route[step])
      .find(({ cell }) => cell.join() === map.route[step + 1].join());
    assert.ok(next, "the next safe terminal has a direction control");
    state = game.act(state, context(actorId), { id: next.id, values: {} });
  }
  return state;
}

test("each seeded route is deterministic, traversable and disjoint from hazards", () => {
  for (let seed = 0; seed < 100; seed += 1) {
    const first = makeMap(String(seed), 0);
    const second = makeMap(String(seed), 1);
    assert.deepEqual(first, makeMap(String(seed), 0));
    assert.notDeepEqual(first.route, second.route);
    for (const map of [first, second]) {
      assert.equal(map.route.length, 7);
      assert.equal(new Set(map.route.map((cell) => cell.join())).size, 7);
      assert.equal(map.hazards.length, 3);
      for (let step = 1; step < map.route.length; step += 1) {
        assert.equal(map.route[step].reduce((sum, cell, i) => sum + Math.abs(cell - map.route[step - 1][i]), 0), 1);
      }
      assert.ok(map.hazards.every((hazard) => !map.route.some((cell) => cell.join() === hazard.join())));
      assert.ok(map.budget >= map.route.length - 1);
      assert.ok(countUnblockedRoutes(map) >= 2, 'hazards alone cannot determine the safe route');
    }
  }
});

test("exact duo and role-specific views survive reload without exposing the seed or other role", () => {
  assert.throws(() => game.create({ ...context(), players: players.slice(0, 1) }), /exactly two/);
  assert.throws(() => game.create({ ...context(), players: [...players, { id: "third" }] }), /exactly two/);
  const state = game.create(context());
  const navigator = game.view(state, context());
  const operator = game.view(state, context("second"));
  assert.equal(navigator.privateCards[0].title, "Your safe route");
  assert.equal(operator.privateCards[0].title, "Your hazard monitor");
  assert.equal(navigator.controls.length, 0);
  assert.equal(operator.controls.length, 2);
  assert.ok(!JSON.stringify(operator).includes("Step 1"));
  assert.ok(!JSON.stringify(navigator).includes("Reset at"));
  assert.ok(!JSON.stringify(operator).includes(state.seed));
  assert.deepEqual(game.view(JSON.parse(JSON.stringify(state)), context("second")), operator);
  assert.throws(() => game.view(state, context("outsider")), /Join this crew/);
  assert.throws(() => game.act(state, context(), { id: operator.controls[0].id, values: {} }), /Only they can move/);
  assert.throws(() => game.act(state, context("outsider"), { id: operator.controls[0].id, values: {} }), /Join this crew/);
});

test("off-route warning holds position, a hazard resets, and stale moves fail", () => {
  let state = { ...game.create(context()), seed: "switchboard fixture" };
  const route = makeMap(state.seed, 0).route;
  const hazards = makeMap(state.seed, 0).hazards.map((cell) => cell.join());
  const warning = availableOptions(state, "second", route[0]).find(({ cell }) => cell.join() !== route[1].join());
  const warned = game.act(state, context("second"), { id: warning.id, values: {} });
  assert.equal(warned.signal, "warning");
  assert.equal(warned.position, 0);
  assert.equal(warned.remaining, state.remaining - 1);
  assert.throws(() => game.act(warned, context("second"), { id: warning.id, values: {} }), /unavailable/);
  assert.equal(state.remaining, makeMap(state.seed, 0).budget);
  for (let step = 1; step < route.length - 1; step += 1) {
    const safe = availableOptions(state, "second", route[step - 1]).find(({ cell }) => cell.join() === route[step].join());
    state = game.act(state, context("second"), { id: safe.id, values: {} });
    const hazard = availableOptions(state, "second", route[step]).find(({ cell }) => hazards.includes(cell.join()));
    if (hazard) {
      const reset = game.act(state, context("second"), { id: hazard.id, values: {} });
      assert.equal(reset.signal, "reset");
      assert.equal(reset.position, 0);
      assert.equal(reset.remaining, state.remaining - 1);
      return;
    }
  }
  assert.fail("The fixture should offer at least one reset along the safe path.");
});

test("both legs finish, roles swap, and the score counts only remaining moves on connected routes", () => {
  const initial = game.create(context());
  const first = followRoute(initial);
  assert.equal(first.phase, "route-result");
  assert.equal(first.signal, "arrived");
  assert.equal(first.results.length, 1);
  const second = game.act(first, context("second"), { id: "continue-0", values: {} });
  assert.equal(game.view(second, context("second")).privateCards[0].title, "Your safe route");
  assert.equal(game.view(second, context()).privateCards[0].title, "Your hazard monitor");
  assert.throws(() => game.act(second, context("second"), { id: "continue-0", values: {} }));
  const both = followRoute(second);
  const final = game.act(both, context(), { id: "continue-1", values: {} });
  const view = game.view(final, context());
  assert.equal(view.heading, "Both routes connected");
  assert.equal(view.finished, true);
  assert.deepEqual(view.standings, [{ label: "Routes connected", score: 2 }, { label: "Combined moves saved", score: 12 }]);
  assert.deepEqual(view.controls, []);
});

test("exhausting the budget still allows route two and cannot produce a crew win", () => {
  let state = game.create(context());
  const map = makeMap(state.seed, 0);
  while (state.remaining) {
    const warning = availableOptions(state, "second", map.route[0])
      .find(({ cell }) => cell.join() !== map.route[1].join());
    state = game.act(state, context("second"), { id: warning.id, values: {} });
  }
  assert.equal(game.view(state, context()).heading, "Move budget exhausted.");
  assert.deepEqual(state.results, [{ solved: false, remaining: 0 }]);
  const second = game.act(state, context(), { id: "continue-0", values: {} });
  const final = game.act(followRoute(second), context(), { id: "continue-1", values: {} });
  assert.equal(game.view(final, context()).heading, "Session complete");
  assert.deepEqual(game.view(final, context()).standings.map((entry) => entry.score), [1, 6]);
});
