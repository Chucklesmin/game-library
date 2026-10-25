/** Private pass-and-play hands. Cards remain in a hand until played. */
/** @param {string[]} playerIds @param {{id:string,text:string}[]} cards
 * @returns {{hands:Record<string,{id:string,text:string}[]>,deck:{id:string,text:string}[],discard:{id:string,text:string}[]}} */
export function dealHands(playerIds, cards, handSize = 7, random = Math.random) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  if (deck.length < playerIds.length * handSize) throw new Error("Not enough response cards for these hands.");
  return { hands: Object.fromEntries(playerIds.map(id => [id, deck.splice(0, handSize)])), deck, discard: [] };
}

/** @param {{hands: Record<string,{id:string,text:string}[]>,deck:{id:string,text:string}[],discard:{id:string,text:string}[]}} state */
export function playHandCard(state, playerId, cardId) {
  const hand = state.hands[playerId] ?? [];
  const card = hand.find(item => item.id === cardId);
  if (!card) throw new Error("Choose a card from your own hand.");
  const deck = [...state.deck];
  const discard = [...state.discard, card];
  const remaining = hand.filter(item => item.id !== cardId);
  // Recycle only played cards after the draw pile is exhausted.
  if (!deck.length) deck.push(...discard.splice(0));
  const refill = deck.shift();
  return { card, state: { hands: { ...state.hands, [playerId]: refill ? [...remaining, refill] : remaining }, deck, discard } };
}
