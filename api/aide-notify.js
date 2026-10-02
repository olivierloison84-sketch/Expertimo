// E-mail immédiat à Olivier quand un agent envoie une question (chatbot) ou une idée (boîte à idées).
// L'agent a déjà inséré sa ligne (RLS) ; ici on vérifie son jeton, on relit la ligne avec la clé serveur
// (elle doit lui appartenir) puis on envoie le mail via Resend. Best-effort : n'échoue jamais côté agent.
const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGIN_PREFIXES = ['https://app.privency.fr', 'https://expertimo-phi.vercel.app', 'http://localhost'];
const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
const DEST = 'olivier.loison84@gmail.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LBL = { idee: '💡 Idée', bug: '🐞 Problème', remarque: '💬 Remarque' };

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (!ALLOWED_ORIGIN_PREFIXES.some(function (p) { return origin.indexOf(p) === 0; })) return res.status(403).json({ error: 'Origin not allowed' });
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  const jwt = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
  if (!jwt) return res.status(401).json({ error: 'Authentification requise' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const kind = body.kind, id = body.id;
  if ((kind !== 'question' && kind !== 'idee') || !UUID.test(String(id))) return res.status(400).json({ error: 'Requête invalide' });
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète' });

  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const { data: u, error: ue } = await admin.auth.getUser(jwt);
  const user = u && u.user;
  if (ue || !user) return res.status(401).json({ error: 'Session invalide' });

  const table = kind === 'question' ? 'aide_questions' : 'agent_idees';
  const { data: row } = await admin.from(table).select('*').eq('id', id).maybeSingle();
  if (!row || row.agent_user_id !== user.id) return res.status(404).json({ error: 'Introuvable' });

  const { data: prof } = await admin.from('agent_profiles').select('prenom, nom').eq('user_id', user.id).maybeSingle();
  const qui = ((prof && ((prof.prenom || '') + ' ' + (prof.nom || '')).trim()) || '') || user.email;
  const texte = kind === 'question' ? row.question : row.message;
  const sujet = kind === 'question' ? '❓ Question d\'un agent : ' : (LBL[row.categorie] || '💡 Idée') + ' d\'un agent : ';

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RESEND_API_KEY },
      body: JSON.stringify({
        from: 'Privency <bonjour@privency.fr>',
        to: [DEST],
        subject: sujet + qui,
        html: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p><b>' + esc(qui) + '</b> (' + esc(user.email) + ')</p><p style="white-space:pre-wrap;border-left:3px solid #0E9F6E;padding-left:12px">' + esc(texte) + '</p></div>'
      })
    });
    if (!r.ok) console.error('[api/aide-notify] Resend', r.status);
  } catch (e) { console.error('[api/aide-notify]', e.message); }
  return res.status(200).json({ ok: true });
};
