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

function toBase64UTF8(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

// Publie un fichier via l'API GitHub Contents (GET sha existant puis PUT).
async function publishFile(filename, html, commitMsg) {
  const apiUrl = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/fiches/' + encodeURIComponent(filename);
  const existingRes = await fetch(apiUrl, { headers: githubHeaders() });
  const existing = existingRes.ok ? await existingRes.json() : null;

  const body = { message: commitMsg, content: toBase64UTF8(html), branch: 'main' };
  if (existing && existing.sha) body.sha = existing.sha;

  const putRes = await fetch(apiUrl, { method: 'PUT', headers: githubHeaders(), body: JSON.stringify(body) });
  const data = await putRes.json();
  return { ok: putRes.ok, status: putRes.status, data: data };
}

function enFilenameFor(filename) {
  return /-FINAL\.html$/.test(filename)
    ? filename.replace(/-FINAL\.html$/, '-EN-FINAL.html')
    : filename.replace(/\.html$/, '-EN.html');
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
    console.error('[api/fiche-publish] variables serveur manquantes (SUPABASE_SECRET_KEY / GITHUB_TOKEN)');
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
  const html = body.html;
  const htmlEn = body.htmlEn;
  const slug = String(body.slug || '').trim();
  const label = String(body.label || '').trim();

  if (!filename || !FILENAME_RE.test(filename) || !html || typeof html !== 'string') {
    return res.status(400).json({ error: 'filename et html requis' });
  }

  try {
    const { data: existingRow, error: existingErr } = await supabaseAdmin
      .from('agent_fiches')
      .select('agent_user_id')
      .eq('filename', filename)
      .maybeSingle();

    if (existingErr) {
      console.error('[api/fiche-publish] lookup agent_fiches:', existingErr);
      return res.status(500).json({ error: 'Erreur vérification du propriétaire' });
    }

    if (existingRow && existingRow.agent_user_id !== user.id) {
      return res.status(403).json({ error: 'Cette fiche appartient à un autre agent' });
    }

    const commitMsg = 'feat: fiche acquereur ' + (slug || filename.replace(/\.html$/, ''));
    const frResult = await publishFile(filename, html, commitMsg);
    if (!frResult.ok) {
      console.error('[api/fiche-publish] GitHub publish error:', frResult.status, frResult.data);
      return res.status(502).json({ error: (frResult.data && frResult.data.message) || 'Erreur publication GitHub' });
    }

    if (htmlEn && typeof htmlEn === 'string') {
      const enResult = await publishFile(enFilenameFor(filename), htmlEn, commitMsg + ' (EN)');
      if (!enResult.ok) {
        console.error('[api/fiche-publish] GitHub publish (EN) error:', enResult.status, enResult.data);
      }
    }

    const pageUrl = 'https://espace.privency.fr/fiches/' + filename;
    const { error: upsertErr } = await supabaseAdmin.from('agent_fiches').upsert({
      agent_user_id: user.id,
      filename: filename,
      label: label || filename,
      published_url: pageUrl,
      updated_at: new Date().toISOString()
    }, { onConflict: 'filename' });

    if (upsertErr) {
      console.error('[api/fiche-publish] upsert agent_fiches:', upsertErr);
      return res.status(500).json({ error: 'Publication GitHub réussie mais échec d\'enregistrement' });
    }

    return res.status(200).json({ ok: true, url: pageUrl });
  } catch (err) {
    console.error('[api/fiche-publish] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
