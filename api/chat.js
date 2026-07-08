const ALLOWED_ORIGIN_PREFIXES = [
  'https://expertimo-phi.vercel.app',
  'https://olivierloison84-sketch.github.io',
  'http://localhost'
];

function originFromReferer(referer) {
  try {
    const u = new URL(referer);
    return u.protocol + '//' + u.host;
  } catch (e) {
    return '';
  }
}

module.exports = async function handler(req, res) {
  // Vérification d'origine — n'accepte que les fiches publiées (ou dev local)
  const originHeader = req.headers.origin || '';
  const refererHeader = req.headers.referer || '';
  const isAllowed = ALLOWED_ORIGIN_PREFIXES.some(function(prefix) {
    return originHeader.indexOf(prefix) === 0 || refererHeader.indexOf(prefix) === 0;
  });

  if (!isAllowed) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const allowedOrigin = originHeader || originFromReferer(refererHeader);

  // CORS — restreint à l'origine autorisée de la requête
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, system } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Plafonds de taille — limite le coût par appel côté API Anthropic
  if (system && system.length > 3000) {
    return res.status(400).json({ error: 'system prompt too long' });
  }
  if (messages.length > 20) {
    return res.status(400).json({ error: 'too many messages' });
  }
  if (messages.some(function(m) { return m && typeof m.content === 'string' && m.content.length > 2000; })) {
    return res.status(400).json({ error: 'message too long' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  try {
    const body = {
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages
    };
    if (system) body.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('[api/chat] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
