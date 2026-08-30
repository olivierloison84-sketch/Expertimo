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

const TEXT_FIELDS = [
  'quartier', 'chargesDetail', 'fort1', 'fort2', 'fort3',
  'vig1', 'vig2', 'vig3', 'historiqueLibre', 'tension', 'delai', 'description'
];

const SYSTEM_PROMPT = [
  'Tu traduis fidèlement des textes libres de fiches immobilières, du français vers',
  'un anglais professionnel et immobilier, style agence de luxe (destiné à des',
  'agences de luxe et des clients étrangers). Réponds UNIQUEMENT avec un objet JSON',
  'valide, sans texte autour, sans balises markdown ```, rien d\'autre que le JSON.',
  '',
  'Tu reçois un objet JSON avec des champs texte libre (certains peuvent être des',
  'chaînes vides) et deux tableaux : "diags" (objets avec une clé "result") et',
  '"renovations" (objets avec une clé "desc").',
  '',
  'Renvoie un objet JSON avec EXACTEMENT les mêmes clés que celles reçues, dans le',
  'même ordre, avec les tableaux "diags" et "renovations" de la MÊME LONGUEUR et',
  'dans le MÊME ORDRE que ceux reçus — traduis uniquement leur clé "result" /',
  '"desc" respectivement.',
  '',
  'Règles strictes :',
  '- Traduis fidèlement le sens, sans l\'enjoliver ni le résumer, dans un anglais',
  '  immobilier professionnel (le registre d\'une agence de luxe).',
  '- Conserve tels quels les nombres, unités, montants et symboles (€, m², %, DPE,',
  '  dates) — ne les convertis pas et ne les traduis pas.',
  '- Un champ vide ("" ou absent) reste une chaîne vide dans la réponse — ne',
  '  l\'invente jamais.',
  '- Ne renvoie aucune clé supplémentaire, aucun commentaire, aucune explication.'
].join('\n');

function isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && !v.trim());
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const input = req.body || {};

  const payload = {};
  TEXT_FIELDS.forEach(function(f) { payload[f] = typeof input[f] === 'string' ? input[f] : ''; });
  payload.diags = Array.isArray(input.diags)
    ? input.diags.map(function(d) { return { result: (d && typeof d.result === 'string') ? d.result : '' }; })
    : [];
  payload.renovations = Array.isArray(input.renovations)
    ? input.renovations.map(function(r) { return { desc: (r && typeof r.desc === 'string') ? r.desc : '' }; })
    : [];

  // Rien à traduire : ne fait aucun appel inutile à l'API.
  const hasText = TEXT_FIELDS.some(function(f) { return !isBlank(payload[f]); })
    || payload.diags.some(function(d) { return !isBlank(d.result); })
    || payload.renovations.some(function(r) { return !isBlank(r.desc); });

  if (!hasText) {
    return res.status(200).json(payload);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  try {
    const body = {
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: JSON.stringify(payload) }
      ]
    };

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

    if (!response.ok) {
      console.error('[api/translate-fiche] Anthropic error:', data);
      return res.status(response.status).json({ error: (data.error && data.error.message) || 'Erreur API Anthropic' });
    }

    const rawText = data.content && data.content[0] && data.content[0].text;
    if (!rawText) {
      return res.status(502).json({ error: 'Réponse IA vide ou inattendue' });
    }

    const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();

    let translated;
    try {
      translated = JSON.parse(cleaned);
    } catch (e) {
      console.error('[api/translate-fiche] JSON parse failed:', cleaned);
      return res.status(502).json({ error: "L'IA n'a pas renvoyé un JSON valide, réessayez." });
    }

    if (!translated || typeof translated !== 'object' || Array.isArray(translated)) {
      return res.status(502).json({ error: 'Réponse IA invalide (pas un objet)' });
    }

    // Reconstruit un objet garanti conforme (mêmes clés, mêmes longueurs de tableaux
    // que la requête), au cas où le modèle omettrait ou déborderait légèrement.
    const result = {};
    TEXT_FIELDS.forEach(function(f) {
      result[f] = (typeof translated[f] === 'string') ? translated[f] : payload[f];
    });
    result.diags = payload.diags.map(function(d, i) {
      var t = Array.isArray(translated.diags) ? translated.diags[i] : null;
      return { result: (t && typeof t.result === 'string') ? t.result : d.result };
    });
    result.renovations = payload.renovations.map(function(r, i) {
      var t = Array.isArray(translated.renovations) ? translated.renovations[i] : null;
      return { desc: (t && typeof t.desc === 'string') ? t.desc : r.desc };
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[api/translate-fiche] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
