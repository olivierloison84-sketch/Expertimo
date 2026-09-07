const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGIN_PREFIXES = [
  'https://expertimo-phi.vercel.app',
  'https://olivierloison84-sketch.github.io',
  'http://localhost'
];

const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
const GITHUB_REPO  = 'olivierloison84-sketch/Expertimo';
const FILENAME_RE  = /^[A-Za-z0-9._-]+\.html$/;

function originFromReferer(referer) {
  try {
    const u = new URL(referer);
    return u.protocol + '//' + u.host;
  } catch (e) {
    return '';
  }
}

function githubHeaders() {
  return {
    'Authorization': 'token ' + process.env.GITHUB_TOKEN,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'expertimo-api'
  };
}

module.exports = async function handler(req, res) {
  const originHeader = req.headers.origin || '';
  const refererHeader = req.headers.referer || '';
  const isAllowed = ALLOWED_ORIGIN_PREFIXES.some(function(prefix) {
    return originHeader.indexOf(prefix) === 0 || refererHeader.indexOf(prefix) === 0;
  });

  if (!isAllowed) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const allowedOrigin = originHeader || originFromReferer(refererHeader);
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7).trim() : '';
  if (!jwt) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  if (!process.env.SUPABASE_SECRET_KEY || !process.env.GITHUB_TOKEN) {
    console.error('[api/fiche-delete] variables serveur manquantes (SUPABASE_SECRET_KEY / GITHUB_TOKEN)');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
  const user = userData && userData.user;
  if (userErr || !user) {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }

  const body = req.body || {};
  const filename = String(body.filename || '').trim();
  if (!filename || !FILENAME_RE.test(filename)) {
    return res.status(400).json({ error: 'filename requis' });
  }

  try {
    const { data: row, error: rowErr } = await supabaseAdmin
      .from('agent_fiches')
      .select('agent_user_id')
      .eq('filename', filename)
      .maybeSingle();

    if (rowErr) {
      console.error('[api/fiche-delete] lookup agent_fiches:', rowErr);
      return res.status(500).json({ error: 'Erreur vérification du propriétaire' });
    }

    if (!row || row.agent_user_id !== user.id) {
      return res.status(403).json({ error: "Cette fiche n'existe pas ou ne vous appartient pas" });
    }

    const apiUrl = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/fiches/' + encodeURIComponent(filename);
    const getRes = await fetch(apiUrl, { headers: githubHeaders() });

    if (getRes.status === 404) {
      // Déjà absent de GitHub — on nettoie quand même l'enregistrement.
      await supabaseAdmin.from('agent_fiches').delete().eq('filename', filename);
      return res.status(200).json({ ok: true });
    }
    if (!getRes.ok) {
      const errData = await getRes.json().catch(function() { return {}; });
      console.error('[api/fiche-delete] GitHub GET error:', getRes.status, errData);
      return res.status(502).json({ error: errData.message || 'Erreur lecture GitHub' });
    }

    const existing = await getRes.json();
    const delRes = await fetch(apiUrl, {
      method: 'DELETE',
      headers: githubHeaders(),
      body: JSON.stringify({ message: 'delete: fiche ' + filename, sha: existing.sha, branch: 'main' })
    });

    if (!delRes.ok) {
      const errData = await delRes.json().catch(function() { return {}; });
      console.error('[api/fiche-delete] GitHub DELETE error:', delRes.status, errData);
      return res.status(502).json({ error: errData.message || 'Erreur suppression GitHub' });
    }

    const { error: delDbErr } = await supabaseAdmin.from('agent_fiches').delete().eq('filename', filename);
    if (delDbErr) {
      console.error('[api/fiche-delete] delete agent_fiches:', delDbErr);
      return res.status(500).json({ error: 'Suppression GitHub réussie mais échec de suppression de l\'enregistrement' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/fiche-delete] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
