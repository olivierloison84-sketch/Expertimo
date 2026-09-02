const ALLOWED_ORIGIN_PREFIXES = [
  'https://espace.privency.fr',
  'https://expertimo-phi.vercel.app',
  'https://olivierloison84-sketch.github.io',
  'http://localhost'
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function originFromReferer(referer) {
  try {
    const u = new URL(referer);
    return u.protocol + '//' + u.host;
  } catch (e) {
    return '';
  }
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label, value) {
  if (value === undefined || value === null || value === '') return '';
  return '<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;">' + esc(label) + '</td>'
    + '<td style="padding:4px 0;font-weight:600;">' + esc(value) + '</td></tr>';
}

function buildHtml(body, isOffre) {
  var rows = isOffre
    ? [
        row('Montant proposé', body.montant ? body.montant + ' €' : ''),
        row('Financement', body.financement),
        row('Apport', body.apport ? body.apport + ' €' : ''),
        row('Délai', body.delai),
        row('Prix affiché', body.prix_affiche),
        row('Nom', body.nom),
        row('Email', body.email),
        row('Message', body.message)
      ]
    : [
        row('Nom', body.nom),
        row('Email', body.email)
      ];

  return '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">'
    + '<h2 style="margin:0 0 12px;">' + (isOffre ? 'Nouvelle offre reçue' : 'Demande de documents') + '</h2>'
    + '<table style="border-collapse:collapse;margin-bottom:16px;">'
    + row('Bien', body.bien)
    + row('Référence', body.reference)
    + rows.join('')
    + '</table>'
    + '</div>';
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

  const body = req.body || {};
  const nom = body.nom;
  const email = body.email;

  if (!nom || !email) {
    return res.status(400).json({ ok: false, error: 'nom et email requis' });
  }

  const candidateEmail = String(body.agentEmail || '').trim();
  const to = EMAIL_RE.test(candidateEmail) ? candidateEmail : process.env.FALLBACK_LEAD_EMAIL;

  if (!to) {
    console.error('[api/send-lead] agentEmail invalide et FALLBACK_LEAD_EMAIL non configuré');
    return res.status(500).json({ ok: false, error: 'Aucune adresse destinataire configurée' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[api/send-lead] RESEND_API_KEY not configured on server');
    return res.status(500).json({ ok: false, error: 'RESEND_API_KEY not configured on server' });
  }

  const isOffre = body.type === 'offre';
  const bien = body.bien || '';
  const subject = isOffre
    ? 'Nouvelle offre — ' + bien + ' — ' + (body.montant || '') + ' €'
    : 'Demande de documents — ' + bien;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        from: 'Privency <noreply@privency.fr>',
        to: [to],
        reply_to: email,
        subject: subject,
        html: buildHtml(body, isOffre)
      })
    });

    if (!resendRes.ok) {
      const errData = await resendRes.json().catch(function() { return {}; });
      console.error('[api/send-lead] Resend error:', resendRes.status, errData);
      return res.status(500).json({ ok: false, error: errData.message || 'Erreur envoi email' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/send-lead] Error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
};
