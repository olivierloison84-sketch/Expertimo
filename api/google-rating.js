// Avis Google réels d'un agent (Places API « New »).
//   POST { q: "Nom + ville" }        -> { candidats: [{ place_id, nom, adresse, note, nb }] }
//   POST { place_id: "ChIJ…" }       -> { place_id, nom, adresse, note, nb }   (actualisation)
// Réservé aux agents connectés (JWT Supabase) : évite qu'un tiers consomme le quota Google.
// Variable serveur requise : GOOGLE_PLACES_API_KEY (clé restreinte à « Places API (New) »).
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
const ALLOWED_ORIGIN_PREFIXES = ['https://app.privency.fr', 'https://expertimo-phi.vercel.app', 'https://olivierloison84-sketch.github.io', 'http://localhost'];
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;
const FIELDS_SEARCH = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount';
const FIELDS_DETAIL = 'id,displayName,formattedAddress,rating,userRatingCount';

function shape(p) {
  return {
    place_id: p.id,
    nom: (p.displayName && p.displayName.text) || '',
    adresse: p.formattedAddress || '',
    note: typeof p.rating === 'number' ? p.rating : null,
    nb: typeof p.userRatingCount === 'number' ? p.userRatingCount : 0
  };
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '', referer = req.headers.referer || '';
  if (!ALLOWED_ORIGIN_PREFIXES.some(function(p) { return origin.indexOf(p) === 0 || referer.indexOf(p) === 0; })) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  let allowed = origin;
  if (!allowed) { try { const u = new URL(referer); allowed = u.protocol + '//' + u.host; } catch (e) { allowed = ''; } }
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  const jwt = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
  if (!jwt) return res.status(401).json({ error: 'Authentification requise' });
  if (!process.env.SUPABASE_SECRET_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète' });
  if (!process.env.GOOGLE_PLACES_API_KEY) return res.status(503).json({ error: 'Avis Google non activés côté serveur (clé manquante)' });

  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const { data: ud, error: ue } = await admin.auth.getUser(jwt);
  if (ue || !ud || !ud.user) return res.status(401).json({ error: 'Session invalide ou expirée' });

  const body = req.body || {};
  const headers = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY };
  try {
    if (body.place_id) {
      const id = String(body.place_id);
      if (!PLACE_ID_RE.test(id)) return res.status(400).json({ error: 'place_id invalide' });
      const r = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(id) + '?languageCode=fr', {
        headers: Object.assign({ 'X-Goog-FieldMask': FIELDS_DETAIL }, headers), signal: AbortSignal.timeout(8000)
      });
      if (r.status === 404) return res.status(404).json({ error: 'Fiche Google introuvable' });
      if (!r.ok) { console.error('[api/google-rating] detail', r.status); return res.status(502).json({ error: 'Erreur Google (' + r.status + ')' }); }
      return res.status(200).json(shape(await r.json()));
    }
    const q = String(body.q || '').trim().slice(0, 150);
    if (q.length < 3) return res.status(400).json({ error: 'Recherche trop courte' });
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', headers: Object.assign({ 'X-Goog-FieldMask': FIELDS_SEARCH }, headers),
      body: JSON.stringify({ textQuery: q, languageCode: 'fr', regionCode: 'FR', pageSize: 5 }), signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) { console.error('[api/google-rating] search', r.status); return res.status(502).json({ error: 'Erreur Google (' + r.status + ')' }); }
    const data = await r.json();
    return res.status(200).json({ candidats: (data.places || []).slice(0, 5).map(shape) });
  } catch (e) {
    console.error('[api/google-rating]', e && e.message);
    return res.status(502).json({ error: 'Google injoignable' });
  }
};
