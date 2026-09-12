const { createClient } = require('@supabase/supabase-js');

// API interne, lecture seule, réservée à un appel serveur à serveur (pas de
// CORS navigateur). Colonnes utilisées ci-dessous confirmées par le code
// existant (api/fiche-publish.js, api/fiches-list.js, api/fiche-delete.js) :
// agent_user_id, filename (clé unique, sert de slug), label, published_url,
// updated_at. Aucune colonne d'adresse structurée, prix, type de bien ou nom
// client n'existe dans agent_fiches — la recherche se fait donc en texte
// libre sur filename/label.

const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';

// Limiteur de requêtes très basique, par instance de fonction serverless
// (best-effort seulement : aucun état partagé entre instances/régions
// Vercel). Sert uniquement de garde-fou si la clé venait à fuiter.
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

function stripAccents(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalize(str) {
  return stripAccents(str).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(str) {
  const n = normalize(str);
  return n ? n.split(' ') : [];
}

function ficheHaystack(row) {
  const base = String(row.filename || '').replace(/\.html$/i, '').replace(/-FINAL$/i, '');
  return tokenize(row.label + ' ' + base);
}

function scoreRow(queryTokens, haystackTokens) {
  if (queryTokens.length === 0) return 0;
  const haystackSet = new Set(haystackTokens);
  let matched = 0;
  for (const t of queryTokens) {
    if (haystackSet.has(t)) matched++;
  }
  return matched / queryTokens.length;
}

function toResult(row, score) {
  return {
    fiche_id: row.filename,
    slug: row.filename,
    url: row.published_url,
    label: row.label,
    agent_user_id: row.agent_user_id,
    updated_at: row.updated_at,
    match_score: Math.round(score * 100) / 100
  };
}

module.exports = async function handler(req, res) {
  // Pas de CORS : appel serveur à serveur uniquement. Un navigateur croisé
  // se heurtera au préflight (aucun header Access-Control-Allow-Origin).
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const key = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7).trim() : '';
  if (!process.env.FICHE_LOOKUP_API_KEY) {
    console.error('[api/fiche-lookup] FICHE_LOOKUP_API_KEY non configurée');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }
  if (!key || key !== process.env.FICHE_LOOKUP_API_KEY) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  if (isRateLimited(clientKey(req))) {
    return res.status(429).json({ error: 'Trop de requêtes, réessayez plus tard' });
  }

  if (!process.env.SUPABASE_SECRET_KEY) {
    console.error('[api/fiche-lookup] SUPABASE_SECRET_KEY non configurée');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const q = req.query || {};
  const numero = String(q.numero || '').trim();
  const voie = String(q.voie || '').trim();
  const codePostal = String(q.code_postal || '').trim();
  const ville = String(q.ville || '').trim();
  // prenom / nom acceptés mais ignorés : agent_fiches ne stocke aucun champ
  // nom/prénom de client.

  const queryTokens = tokenize([numero, voie, codePostal, ville].filter(Boolean).join(' '));
  if (queryTokens.length === 0) {
    return res.status(400).json({ error: 'Au moins un paramètre d\'adresse requis (numero, voie, code_postal, ville)' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  try {
    const { data: rows, error } = await supabaseAdmin
      .from('agent_fiches')
      .select('filename, label, published_url, updated_at, agent_user_id')
      .order('updated_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('[api/fiche-lookup] select agent_fiches:', error);
      return res.status(500).json({ error: 'Erreur de recherche' });
    }

    const scored = (rows || [])
      .map(function(row) {
        return { row: row, score: scoreRow(queryTokens, ficheHaystack(row)) };
      })
      .sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.row.updated_at || 0) - new Date(a.row.updated_at || 0);
      });

    const best = scored[0];
    if (best && best.score >= 0.999) {
      return res.status(200).json({ found: true, ...toResult(best.row, best.score) });
    }

    const suggestions = scored
      .filter(function(s) { return s.score > 0; })
      .slice(0, 5)
      .map(function(s) { return toResult(s.row, s.score); });

    return res.status(200).json({ found: false, suggestions: suggestions });
  } catch (err) {
    console.error('[api/fiche-lookup] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
