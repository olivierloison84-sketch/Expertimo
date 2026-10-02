// Olivier répond à la question d'un agent depuis le dashboard : la réponse apparaît dans le chatbot de l'agent.
// Réservé à l'administrateur (id vérifié côté serveur sur le jeton).
const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGIN_PREFIXES = ['https://app.privency.fr', 'https://expertimo-phi.vercel.app', 'http://localhost'];
const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
const ADMIN_USER_ID = '79e4e432-2232-4d2c-b41d-8c7c907c4dec';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!process.env.SUPABASE_SECRET_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète' });

  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const { data: u, error: ue } = await admin.auth.getUser(jwt);
  const user = u && u.user;
  if (ue || !user) return res.status(401).json({ error: 'Session invalide' });
  if (user.id !== ADMIN_USER_ID) return res.status(403).json({ error: 'Accès non autorisé' });

  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  body = body || {};
  const id = String(body.id || '');
  const reponse = String(body.reponse || '').trim().slice(0, 2000);
  if (!UUID.test(id) || reponse.length < 1) return res.status(400).json({ error: 'Requête invalide' });

  const { data, error } = await admin.from('aide_questions')
    .update({ reponse: reponse, repondu_at: new Date().toISOString() })
    .eq('id', id).select('id');
  if (error) { console.error('[api/aide-repondre]', error.message); return res.status(500).json({ error: 'Enregistrement impossible (le script SQL des réponses est-il exécuté ?)' }); }
  if (!data || !data.length) return res.status(404).json({ error: 'Question introuvable' });
  return res.status(200).json({ ok: true });
};
