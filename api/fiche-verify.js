const { createClient } = require('@supabase/supabase-js');

// API interne, lecture seule, réservée à un appel serveur à serveur (pas de
// CORS navigateur). Colonnes confirmées par le code existant
// (api/fiche-publish.js, api/fiches-list.js, api/fiche-delete.js) :
// agent_user_id, filename (clé unique, sert de slug), label, published_url,
// updated_at. Il n'existe aucune colonne de statut actif/inactif : une fiche
// supprimée (api/fiche-delete.js) voit sa ligne entièrement retirée de
// agent_fiches, donc l'existence de la ligne équivaut à "active".

const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateLimitHits = new Map();

function isRateLimited(key) {
  const now = Date.now();
  const hits = (rateLimitHits.get(key) || []).filter(function(t) { return now - t < RATE_LIMIT_WINDOW_MS; });
  hits.push(now);
  rateLimitHits.set(key, hits);
  return hits.length > RATE_LIMIT_MAX;
}

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

const FILENAME_RE = /^[A-Za-z0-9._-]+\.html$/;

module.exports = async function handler(req, res) {
  // Pas de CORS : appel serveur à serveur uniquement. Un navigateur croisé
  // se heurtera au préflight (aucun header Access-Control-Allow-Origin).
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const key = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7).trim() : '';
  if (!process.env.FICHE_LOOKUP_API_KEY) {
    console.error('[api/fiche-verify] FICHE_LOOKUP_API_KEY non configurée');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }
  if (!key || key !== process.env.FICHE_LOOKUP_API_KEY) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  if (isRateLimited(clientKey(req))) {
    return res.status(429).json({ error: 'Trop de requêtes, réessayez plus tard' });
  }

  if (!process.env.SUPABASE_SECRET_KEY) {
    console.error('[api/fiche-verify] SUPABASE_SECRET_KEY non configurée');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const slug = String((req.query && req.query.slug) || '').trim();
  if (!slug || !FILENAME_RE.test(slug)) {
    return res.status(400).json({ error: 'slug requis (nom de fichier .html)' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  try {
    const { data: row, error } = await supabaseAdmin
      .from('agent_fiches')
      .select('filename, label, published_url, updated_at, agent_user_id')
      .eq('filename', slug)
      .maybeSingle();

    if (error) {
      console.error('[api/fiche-verify] select agent_fiches:', error);
      return res.status(500).json({ error: 'Erreur de vérification' });
    }

    if (!row) {
      return res.status(200).json({ valid: false });
    }

    return res.status(200).json({
      valid: true,
      active: true,
      fiche_id: row.filename,
      slug: row.filename,
      url: row.published_url,
      label: row.label,
      agent_user_id: row.agent_user_id,
      updated_at: row.updated_at
    });
  } catch (err) {
    console.error('[api/fiche-verify] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
