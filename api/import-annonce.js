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

const SYSTEM_PROMPT = [
  'Tu extrais des informations immobilières à partir du texte brut d\'une annonce',
  '(Le Bon Coin, SeLoger, etc.) collé par un agent immobilier. Réponds UNIQUEMENT',
  'avec un objet JSON valide, sans texte autour, sans balises markdown ```, rien',
  'd\'autre que le JSON.',
  '',
  'Schéma exact attendu (toutes les clés sont optionnelles) :',
  '{',
  '  "type": "appart" | "maison" | "terrain",',
  '  "adresse": string,',
  '  "quartier": string,',
  '  "surface": number,',
  '  "surfCarrez": number,',
  '  "prix": number,',
  '  "chargesCopro": number,',
  '  "taxeFonciere": number,',
  '  "pieces": number,',
  '  "etage": string,',
  '  "annee": number,',
  '  "dpe": "A" | "B" | "C" | "D" | "E" | "F" | "G",',
  '  "gesLettre": "A" | "B" | "C" | "D" | "E" | "F" | "G",',
  '  "fort1": string,',
  '  "fort2": string,',
  '  "fort3": string',
  '}',
  '',
  'Règles strictes :',
  '- N\'inclus une clé QUE si tu as trouvé une information fiable et explicite dans',
  '  le texte fourni. Omets purement et simplement (ou mets null) toute clé pour',
  '  laquelle tu n\'as rien trouvé — n\'invente et ne devine JAMAIS une valeur.',
  '- "prix", "chargesCopro", "taxeFonciere", "surface", "surfCarrez", "pieces",',
  '  "annee" sont des nombres (pas de texte, pas d\'unité, pas d\'espaces).',
  '- "fort1"/"fort2"/"fort3" : jusqu\'à 3 points forts concrets et courts',
  '  explicitement mentionnés dans l\'annonce (ex. "Terrasse 20m² exposée sud",',
  '  "Proche RER B", "Aucun vis-à-vis"). Ne remplis que ceux que tu identifies',
  '  clairement, laisse les autres de côté.',
  '- Ne remplis JAMAIS de champs qui ne figurent normalement pas dans une annonce',
  '  publique (scores 0-10, tension locative, taux de crédit, vigilances,',
  '  questions de découverte, informations sur le propriétaire, etc.) — ces',
  '  champs n\'existent pas dans le schéma ci-dessus, ne les ajoute pas.'
].join('\n');

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

  const { text } = req.body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text requis' });
  }
  if (text.length > 8000) {
    return res.status(400).json({ error: 'texte trop long (8000 caractères max)' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  try {
    const body = {
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: text.trim() }
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
      console.error('[api/import-annonce] Anthropic error:', data);
      return res.status(response.status).json({ error: (data.error && data.error.message) || 'Erreur API Anthropic' });
    }

    const rawText = data.content && data.content[0] && data.content[0].text;
    if (!rawText) {
      return res.status(502).json({ error: 'Réponse IA vide ou inattendue' });
    }

    // Défense minimale au cas où le modèle entourerait le JSON de ```
    const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch (e) {
      console.error('[api/import-annonce] JSON parse failed:', cleaned);
      return res.status(502).json({ error: "L'IA n'a pas renvoyé un JSON valide, réessayez." });
    }

    if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) {
      return res.status(502).json({ error: "Réponse IA invalide (pas un objet)" });
    }

    return res.status(200).json(extracted);
  } catch (err) {
    console.error('[api/import-annonce] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
