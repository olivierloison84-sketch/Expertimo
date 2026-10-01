const ALLOWED_ORIGIN_PREFIXES = [
  'https://espace.privency.fr',
  'https://app.privency.fr',
  'https://expertimo-phi.vercel.app',
  'https://olivierloison84-sketch.github.io',
  'http://localhost'
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Durcissement : ce point d'entrée est public, il ne doit pas pouvoir servir de relais d'e-mails. ---
// 1) le destinataire doit être l'e-mail d'un agent inscrit (sinon le message va à la boîte de secours) ;
// 2) champs plafonnés et sans saut de ligne dans l'objet ; 3) limite de débit par IP et par destinataire.
const TTL = 10 * 60 * 1000, HITS = new Map(), AGENTS = new Map();
function limite(cle, max) {
  const now = Date.now(), h = (HITS.get(cle) || []).filter(function(t) { return now - t < TTL; });
  h.push(now); HITS.set(cle, h);
  if (HITS.size > 5000) HITS.forEach(function(v, k) { if (!v.length || now - v[v.length - 1] >= TTL) HITS.delete(k); });
  return h.length <= max;
}
function flat(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n); }
let agentLookup = async function(email) {
  const url = process.env.SUPABASE_URL || 'https://hhqcumnatnslfjpsrmgb.supabase.co', key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null; // clé absente : on ne peut pas vérifier -> boîte de secours
  const { createClient } = require('@supabase/supabase-js');
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).from('agent_profiles').select('user_id').ilike('email', email.replace(/[%_\\]/g, '\\$&')).limit(1);
  if (error) throw error;
  return !!(data && data.length);
};
async function agentConnu(email) {
  const k = email.toLowerCase();
  // Adresses autorisées en plus des agents inscrits (anciens agents hors Privency) : variable Vercel LEAD_EXTRA_RECIPIENTS, séparées par des virgules.
  if (String(process.env.LEAD_EXTRA_RECIPIENTS || '').toLowerCase().split(',').map(function(x) { return x.trim(); }).indexOf(k) !== -1) return true;
  const hit = AGENTS.get(k);
  if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.ok;
  let ok = false;
  try { ok = (await agentLookup(k)) === true; } catch (e) { console.error('[api/send-lead] vérification agent:', e && e.message); return false; }
  AGENTS.set(k, { t: Date.now(), ok }); if (AGENTS.size > 500) AGENTS.delete(AGENTS.keys().next().value);
  return ok;
}

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

// Liste de documents demandés : tableau de libellés courts (40 max, 80 caractères chacun), jamais du HTML brut.
function cleanDocs(docs) {
  if (!Array.isArray(docs)) return [];
  var out = [];
  docs.forEach(function(d) {
    var t = String(d == null ? '' : d).trim().slice(0, 80);
    if (t && out.indexOf(t) === -1 && out.length < 40) out.push(t);
  });
  return out;
}

function buildHtml(body, isOffre, docsList) {
  var isList = !isOffre && docsList && docsList.length > 0;
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
        row('Email', body.email),
        isList ? row('Précisions', String(body.message || '').slice(0, 500)) : ''
      ];

  return '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">'
    + '<h2 style="margin:0 0 12px;">' + (isOffre ? 'Nouvelle offre reçue' : (isList ? 'Documents souhaités' : 'Demande de documents')) + '</h2>'
    + '<table style="border-collapse:collapse;margin-bottom:16px;">'
    + row('Bien', body.bien)
    + row('Référence', body.reference)
    + rows.join('')
    + '</table>'
    + (isList
        ? '<p style="margin:0 0 6px;font-weight:600;">' + docsList.length + ' document' + (docsList.length > 1 ? 's' : '') + ' demandé' + (docsList.length > 1 ? 's' : '') + ' :</p>'
          + '<ul style="margin:0 0 16px;padding-left:20px;">' + docsList.map(function(d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>'
        : '')
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

  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnue';
  if (!limite('ip:' + ip, 30)) return res.status(429).json({ ok: false, error: 'trop de demandes' });
  const body = Object.assign({}, raw, {
    nom: flat(raw.nom, 100), email: flat(raw.email, 254), bien: flat(raw.bien, 200), montant: flat(raw.montant, 20),
    agentEmail: flat(raw.agentEmail, 254), type: flat(raw.type, 30),
    financement: flat(raw.financement, 100), apport: flat(raw.apport, 20), delai: flat(raw.delai, 100), prix_affiche: flat(raw.prix_affiche, 30),
    reference: flat(raw.reference, 100), message: String(raw.message == null ? '' : raw.message).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ').trim().slice(0, 1500)
  });
  const nom = body.nom;
  const email = body.email;

  if (!nom || !email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'nom et email requis' });
  }

  // L'ouverture de l'onglet Documents (nom + e-mail) ne génère plus de mail : l'agent ne reçoit que la « liste de documents
  // souhaités » (type documents_liste), qui contient déjà le nom, l'e-mail et les documents choisis.
  if (body.type === 'documents') return res.status(200).json({ ok: true, ignore: true });

  const candidateEmail = body.agentEmail;
  const to = (EMAIL_RE.test(candidateEmail) && await agentConnu(candidateEmail)) ? candidateEmail : process.env.FALLBACK_LEAD_EMAIL;
  if (!limite('to:' + String(to).toLowerCase(), 15)) return res.status(429).json({ ok: false, error: 'trop de demandes' });

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
  const docsList = body.type === 'documents_liste' ? cleanDocs(body.documents) : [];
  if (body.type === 'documents_liste' && !docsList.length) {
    return res.status(400).json({ ok: false, error: 'aucun document sélectionné' });
  }
  const bien = body.bien || '';
  const subject = isOffre
    ? 'Nouvelle offre — ' + bien + ' — ' + (body.montant || '') + ' €'
    : docsList.length
      ? 'Documents souhaités (' + docsList.length + ') — ' + bien + ' — ' + String(body.nom || '').replace(/[\r\n]+/g, ' ').slice(0, 60)
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
        html: buildHtml(body, isOffre, docsList)
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
// Réservé aux tests : remplace la vérification de l'agent (base) et remet les compteurs à zéro.
module.exports.__test = { setLookup: function(f) { agentLookup = f; AGENTS.clear(); HITS.clear(); } };
