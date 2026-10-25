/** @typedef {{ id: string, text: string }} CahCard */
/** @typedef {{ pack_id: string, content_type: string, payload: unknown }} CahDeckRow */
/** @typedef {{ originalPrompts: CahCard[], afterHoursPrompts: CahCard[], responses: CahCard[] }} CahDeck */

const PACK_SLUGS = ['original', 'after-hours'];

/** @param {unknown} value @returns {CahCard | null} */
function toCard(value) {
  if (!value || typeof value !== 'object') return null;
  const card = /** @type {{id?: unknown, text?: unknown}} */ (value);
  if (typeof card.id !== 'string' || typeof card.text !== 'string' || !card.text.trim()) return null;
  return { id: card.id, text: card.text };
}

/** @param {{id: string, slug: string}[]} packs @param {CahDeckRow[]} rows @returns {CahDeck} */
export function buildCahDeck(packs, rows) {
  const slugByPackId = new Map(packs.map(pack => [pack.id, pack.slug]));
  const deck = { originalPrompts: [], afterHoursPrompts: [], responses: [] };

  for (const row of rows) {
    const card = toCard(row.payload);
    if (!card) continue;
    const slug = slugByPackId.get(row.pack_id);
    if (row.content_type === 'prompt' && slug === 'original') deck.originalPrompts.push(card);
    if (row.content_type === 'prompt' && slug === 'after-hours') deck.afterHoursPrompts.push(card);
    if (row.content_type === 'response' && slug === 'after-hours') deck.responses.push(card);
  }

  if (!PACK_SLUGS.every(slug => packs.some(pack => pack.slug === slug))
    || !deck.originalPrompts.length
    || !deck.afterHoursPrompts.length
    || deck.responses.length < 7) {
    throw new Error('The published Cards Against Humanity deck is incomplete in Supabase.');
  }

  return deck;
}

/** @param {import('@supabase/supabase-js').SupabaseClient | null} client @returns {Promise<CahDeck>} */
export async function loadCahDeck(client) {
  if (!client) throw new Error('Supabase is not configured for this game.');

  const { data: game, error: gameError } = await client.from('games')
    .select('id').eq('slug', 'cards-against-humanity').eq('is_published', true).single();
  if (gameError || !game) throw new Error('Could not load the published Cards Against Humanity game from Supabase.');

  const { data: packs, error: packsError } = await client.from('game_packs')
    .select('id,slug').eq('game_id', game.id).eq('is_published', true).in('slug', PACK_SLUGS);
  if (packsError || !packs?.length) throw new Error('Could not load the published Cards Against Humanity packs from Supabase.');

  const packIds = packs.map(pack => pack.id);
  const { data: rows, error: rowsError } = await client.from('game_content')
    .select('pack_id,content_type,payload').eq('game_id', game.id).eq('is_published', true)
    .in('pack_id', packIds).order('sort_order', { ascending: true });
  if (rowsError || !rows) throw new Error('Could not load the published Cards Against Humanity cards from Supabase.');

  return buildCahDeck(packs, rows);
}
