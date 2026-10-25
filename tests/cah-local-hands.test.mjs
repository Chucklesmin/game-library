import test from 'node:test';
import assert from 'node:assert/strict';
import { dealHands, playHandCard } from '../src/lib/cah-local-hands.mjs';
const cards = Array.from({length: 30}, (_, i) => ({id: String(i), text: `Card ${i}`}));
test('private hands are disjoint and refill without repeats before exhaustion', () => {
  let state = dealHands(['a','b','c'], cards, 7, () => 0.5);
  assert.equal(new Set(Object.values(state.hands).flat().map(c => c.id)).size,21);
  const played = state.hands.a[0];
  state = playHandCard(state,'a',played.id).state;
  assert.equal(state.hands.a.length,7);
  assert.equal(state.hands.a.some(c => c.id === played.id),false);
  assert.throws(() => playHandCard(state,'a',state.hands.b[0].id), /own hand/);
});
test('dealing requires a sufficient deck and recycle never draws another hand', () => {
  assert.throws(() => dealHands(['a','b','c'],cards.slice(0,5)), /Not enough/);
  let state = dealHands(['a','b','c'],cards.slice(0,21),7,()=>0.5);
  for(let i=0;i<12;i++) state=playHandCard(state,'a',state.hands.a[0].id).state;
  assert.equal(new Set(Object.values(state.hands).flat().map(c=>c.id)).size,21);
});
