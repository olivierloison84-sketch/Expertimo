const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGIN_PREFIXES = [
  'https://expertimo-phi.vercel.app',
  'https://olivierloison84-sketch.github.io',
  'http://localhost'
];

const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
const GITHUB_REPO  = 'olivierloison84-sketch/Expertimo';

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

async function fetchGithubMeta(filename) {
  const contentsUrl = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/fiches/' + encodeURIComponent(filename);
  const commitsUrl = 'https://api.github.com/repos/' + GITHUB_REPO
    + '/commits?path=' + encodeURIComponent('fiches/' + filename) + '&per_page=1';

  const [contentsRes, commitsRes] = await Promise.all([
    fetch(contentsUrl, { headers: githubHeaders() }),
    fetch(commitsUrl, { headers: githubHeaders() })
  ]);

  let sha = null, downloadUrl = null, missing = false;
  if (contentsRes.ok) {
    const c = await contentsRes.json();
    sha = c.sha;
    downloadUrl = c.download_url;
  } else {
    missing = true;
  }

  let lastModified = null;
  if (commitsRes.ok) {
    const commits = await commitsRes.json();
    if (Array.isArray(commits) && commits[0] && commits[0].commit) {
      lastModified = commits[0].commit.committer.date;
    }
  }

  return { sha: sha, downloadUrl: downloadUrl, lastModified: lastModified, missing: missing };
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7).trim() : '';
  if (!jwt) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  if (!process.env.SUPABASE_SECRET_KEY || !process.env.GITHUB_TOKEN) {
    console.error('[api/fiches-list] variables serveur manquantes (SUPABASE_SECRET_KEY / GITHUB_TOKEN)');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
  const user = userData && userData.user;
  if (userErr || !user) {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }

  try {
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('agent_fiches')
      .select('filename, label, published_url, updated_at')
      .eq('agent_user_id', user.id)
      .order('updated_at', { ascending: false });

    if (rowsErr) {
      console.error('[api/fiches-list] lookup agent_fiches:', rowsErr);
      return res.status(500).json({ error: 'Erreur chargement des fiches' });
    }

    const fiches = await Promise.all((rows || []).map(async function(row) {
      const meta = await fetchGithubMeta(row.filename);
      return {
        filename: row.filename,
        label: row.label,
        published_url: row.published_url,
        updated_at: row.updated_at,
        sha: meta.sha,
        download_url: meta.downloadUrl,
        last_modified: meta.lastModified,
        missing: meta.missing
      };
    }));

    return res.status(200).json({ fiches: fiches });
  } catch (err) {
    console.error('[api/fiches-list] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
