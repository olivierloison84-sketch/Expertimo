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

// Correspondance code INSEE "nature_juridique" -> libellé lisible, pour les formes
// juridiques les plus courantes chez les indépendants/TPE. Liste non exhaustive —
// à vérifier/compléter au besoin (nomenclature des catégories juridiques INSEE).
// Un code absent de cette table est simplement affiché tel quel (fallback sûr).
const NATURE_JURIDIQUE_LABELS = {
  '1000': 'Entrepreneur individuel',
  '5202': 'Société en nom collectif (SNC)',
  '5498': 'Entreprise unipersonnelle à responsabilité limitée (EURL)',
  '5499': 'Société à responsabilité limitée (SARL)',
  '5710': 'Société par actions simplifiée (SAS)',
  '5720': 'Société par actions simplifiée unipersonnelle (SASU)'
};

function formeJuridiqueLabel(code) {
  if (!code) return '';
  return NATURE_JURIDIQUE_LABELS[code] || code;
}

// Construit une adresse lisible à partir des champs bruts d'un établissement,
// en repli si `adresse` n'est pas déjà fournie formatée par l'API.
function buildAdresse(etab) {
  if (!etab) return '';
  if (etab.adresse) return etab.adresse;
  var parts = [etab.numero_voie, etab.type_voie, etab.libelle_voie].filter(Boolean).join(' ');
  var ville = [etab.code_postal, etab.libelle_commune].filter(Boolean).join(' ');
  return [parts, ville].filter(Boolean).join(', ');
}

// Sélectionne, dans un résultat de recherche, l'établissement correspondant
// EXACTEMENT au SIRET demandé — pas seulement le siège social par défaut
// (une entreprise peut avoir plusieurs établissements).
function findMatchingEtablissement(result, siret) {
  if (result.siege && result.siege.siret === siret) return result.siege;
  if (Array.isArray(result.matching_etablissements)) {
    var found = result.matching_etablissements.find(function(e) { return e.siret === siret; });
    if (found) return found;
  }
  // Repli : le siège social reste la meilleure estimation disponible.
  return result.siege || null;
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawSiret = req.method === 'GET'
    ? (req.query && req.query.siret)
    : (req.body && req.body.siret);

  const siret = (rawSiret || '').toString().replace(/\s/g, '');

  if (!/^\d{14}$/.test(siret)) {
    return res.status(400).json({ error: 'SIRET invalide (14 chiffres attendus)' });
  }

  try {
    const apiRes = await fetch('https://recherche-entreprises.api.gouv.fr/search?q=' + siret + '&limit=1');

    if (apiRes.status === 404) {
      return res.status(404).json({ error: 'Aucune entreprise trouvée pour ce SIRET' });
    }
    if (!apiRes.ok) {
      console.error('[api/siret-lookup] Upstream error:', apiRes.status);
      return res.status(502).json({ error: 'Erreur de l\'API entreprises (' + apiRes.status + ')' });
    }

    const data = await apiRes.json();
    const result = data && Array.isArray(data.results) ? data.results[0] : null;

    if (!result) {
      return res.status(404).json({ error: 'Aucune entreprise trouvée pour ce SIRET' });
    }

    const etab = findMatchingEtablissement(result, siret);

    const payload = {
      denomination: result.nom_raison_sociale || result.nom_complet || '',
      formeJuridique: formeJuridiqueLabel(result.nature_juridique),
      adresse: buildAdresse(etab),
      codePostal: (etab && etab.code_postal) || '',
      ville: (etab && etab.libelle_commune) || '',
      codeNaf: (etab && etab.activite_principale) || result.activite_principale || '',
      tvaIntra: Array.isArray(result.tva) ? (result.tva[0] || '') : (result.tva || '')
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[api/siret-lookup] Error:', err);
    return res.status(500).json({ error: err.message || 'Erreur réseau lors de la recherche SIRET' });
  }
};
