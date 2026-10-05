const ALLOWED_ORIGIN_PREFIXES = [
  'https://app.privency.fr',
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
  '  "chargesCoproPeriode": "mensuel" | "annuel",',
  '  "taxeFonciere": number,',
  '  "pieces": number,',
  '  "chambres": number,',
  '  "sdb": number,',
  '  "wc": number,',
  '  "etage": string,',
  '  "etagesTotal": number,',
  '  "ascenseur": "oui" | "non",',
  '  "annee": number,',
  '  "parkingInt": number,',
  '  "parkingExt": number,',
  '  "parkingBox": number,',
  '  "dpe": "A" | "B" | "C" | "D" | "E" | "F" | "G",',
  '  "gesLettre": "A" | "B" | "C" | "D" | "E" | "F" | "G",',
  '  "fort1": string,',
  '  "fort2": string,',
  '  "fort3": string,',
  '  "vig1": string,',
  '  "vig2": string,',
  '  "vig3": string,',
  '  "historiqueLibre": string',
  '}',
  '',
  'Règles strictes :',
  '- N\'inclus une clé QUE si tu as trouvé une information fiable et explicite dans',
  '  le texte fourni. Omets purement et simplement (ou mets null) toute clé pour',
  '  laquelle tu n\'as rien trouvé — n\'invente et ne devine JAMAIS une valeur.',
  '- "prix", "chargesCopro", "taxeFonciere", "surface", "surfCarrez", "pieces",',
  '  "chambres", "sdb", "wc", "etagesTotal", "annee", "parkingInt", "parkingExt",',
  '  "parkingBox" sont des nombres JSON (pas de texte, pas d\'unité, pas',
  '  d\'espaces, pas de symbole €). Ex. "Taxe foncière : 1 250 €/an" →',
  '  "taxeFonciere": 1250.',
  '- "chargesCopro" : le montant TEL QU\'ÉCRIT dans l\'annonce, sans conversion.',
  '  "chargesCoproPeriode" : "annuel" si l\'annonce indique un montant par an',
  '  (ex. "charges annuelles", "/an"), "mensuel" si par mois (ex. "/mois").',
  '  Si la période n\'est pas claire, omets "chargesCopro" ET',
  '  "chargesCoproPeriode".',
  '- "chambres" : nombre de chambres. "sdb" : nombre de salles de bains (ou',
  '  salles d\'eau si l\'annonce ne distingue pas). "wc" : nombre de WC.',
  '- Nombres en lettres ou avec un article : ils comptent comme des nombres',
  '  EXPLICITES (ce n\'est pas deviner). Ex. "une salle de bains" → "sdb": 1 ;',
  '  "une salle d\'eau" → "sdb": 1 ; "deux salles de bains" → "sdb": 2 ;',
  '  "un WC" ou "WC indépendant" → "wc": 1 ; "deux WC" → "wc": 2 ;',
  '  "quatre chambres" → "chambres": 4 ; "deux places de parking en',
  '  sous-sol" → "parkingInt": 2. Une pièce mentionnée une seule fois, au',
  '  singulier, vaut 1. S\'applique à "chambres", "sdb", "wc", "etagesTotal",',
  '  "parkingInt", "parkingExt" et "parkingBox". Si la pièce n\'est pas',
  '  mentionnée du tout (ex. aucun WC cité), omets la clé. Pour le parking,',
  '  la règle sur l\'emplacement ci-dessous reste prioritaire.',
  '- Avant de répondre, relis le texte et vérifie une par une : chambres,',
  '  salles de bains / salles d\'eau, WC, ascenseur, parkings. Si une de ces',
  '  pièces est citée dans le texte, même en fin de phrase ou dans une',
  '  énumération ("côté nuit, vous disposez de quatre chambres, dont une de',
  '  plus de 12 m², ainsi que d\'une salle de bains"), la clé correspondante',
  '  doit être renseignée.',
  '- "etagesTotal" : nombre d\'étages de l\'immeuble (ex. "3e étage sur 5" →',
  '  "etage": "3", "etagesTotal": 5).',
  '- "ascenseur" : "oui" si l\'annonce mentionne un ascenseur, "non" si elle',
  '  indique explicitement l\'absence d\'ascenseur. Si l\'annonce n\'en parle',
  '  pas, omets la clé.',
  '- Parking : sous-sol, garage, parking intérieur → "parkingInt" ; parking',
  '  extérieur, place extérieure, stationnement extérieur → "parkingExt" ; box',
  '  fermé → "parkingBox". Valeur = nombre de places. Si l\'annonce dit',
  '  seulement "1 place de parking" sans préciser où, omets les trois clés.',
  '- "fort1"/"fort2"/"fort3" : jusqu\'à 3 points forts concrets et courts',
  '  explicitement mentionnés dans l\'annonce (ex. "Terrasse 20m² exposée sud",',
  '  "Proche RER B", "Aucun vis-à-vis"). Ne remplis que ceux que tu identifies',
  '  clairement, laisse les autres de côté.',
  '- "vig1"/"vig2"/"vig3" : jusqu\'à 3 points de vigilance, UNIQUEMENT à partir',
  '  de faits objectifs écrits dans l\'annonce, formulés de façon neutre et',
  '  courte (ex. "DPE classé F", "Travaux de rénovation à prévoir",',
  '  "4e étage sans ascenseur", "Charges de copropriété élevées",',
  '  "Procédure en cours dans la copropriété"). Aucune supposition ni',
  '  interprétation. S\'il n\'y a rien d\'objectif, omets ces clés.',
  '- "historiqueLibre" : les informations utiles de l\'annonce qui n\'ont pas',
  '  de clé dédiée (copropriété, exposition, vue, chauffage, équipements,',
  '  rénovations, état général, prestations). Une information par ligne',
  '  (séparées par \\n), phrases courtes, 12 lignes maximum. Ne répète pas le',
  '  prix, la surface, le nombre de pièces ni les informations déjà placées',
  '  dans les autres clés.',
  '- Le texte collé contient souvent des restes de page web (boutons, menus,',
  '  liens, libellés techniques comme "Demander le plan", "Voir plus",',
  '  "selection_property_house-icon"). Ignore-les complètement.',
  '- Ne remplis JAMAIS de champs qui ne figurent normalement pas dans une annonce',
  '  publique (scores 0-10, tension locative, taux de crédit, questions de',
  '  découverte, informations sur le propriétaire, etc.) — ces champs',
  '  n\'existent pas dans le schéma ci-dessus, ne les ajoute pas.'
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
      max_tokens: 1500,
      temperature: 0,
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
