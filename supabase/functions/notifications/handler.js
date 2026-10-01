// Logique de l'Edge Function « notifications » (injection de dépendances pour être testée sous Node).
//   mode « alertes » : emails instantanés aux agents (opt-in), appelé toutes les 10 min par pg_cron.
//   mode « digest »  : point hebdomadaire aux vendeurs (accord attesté par l'agent), appelé chaque lundi.
import { buildAlerte, buildDigest, validEmail } from './format.js';

function decodeJwtRole(authHeader) {
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '='))).role || null;
  } catch (e) { return null; }
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

async function resend(deps, payload) {
  const r = await deps.fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + deps.env.RESEND_API_KEY }, body: JSON.stringify(payload)
  });
  return r.ok;
}

export async function handle(req, deps) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  // La passerelle Supabase a déjà vérifié la signature du JWT ; on réserve l'appel au service_role (la clé anon est publique).
  if (decodeJwtRole(req.headers.get('authorization')) !== 'service_role') return json({ error: 'forbidden' }, 403);
  if (!deps.env.RESEND_API_KEY) return json({ error: 'RESEND_API_KEY manquante' }, 500);
  let body = {}; try { body = await req.json(); } catch (e) {}
  const mode = body && body.mode;
  if (mode !== 'alertes' && mode !== 'digest') return json({ error: 'mode invalide' }, 400);
  let sent = 0, failed = 0;

  if (mode === 'alertes') {
    const { data, error } = await deps.db.rpc('notif_alertes_dues');
    if (error) return json({ ok: false, error: 'rpc' }, 500);
    for (const a of data || []) {
      const mail = buildAlerte(a);
      if (!mail || !validEmail(a.agent_email)) { failed++; continue; }
      let ok = false;
      try { ok = await resend(deps, { from: 'Privency <noreply@privency.fr>', to: [a.agent_email], subject: mail.subject, html: mail.html }); } catch (e) {}
      if (ok) { await deps.db.rpc('notif_alerte_marque', { p_agent: a.agent_user_id, p_cle: a.cle }); sent++; } else failed++;
    }
  } else {
    const { data, error } = await deps.db.rpc('notif_digests_dues');
    if (error) return json({ ok: false, error: 'rpc' }, 500);
    for (const l of data || []) {
      if (!validEmail(l.email)) { failed++; continue; }
      const { data: rap } = await deps.db.rpc('vendeur_rapport', { p_token: l.token });
      if (!rap || rap.ok !== true) { failed++; continue; }
      const mail = buildDigest(rap, l.token, deps.now ? deps.now() : new Date());
      let ok = false;
      try {
        const p = { from: mail.from, to: [l.email], subject: mail.subject, html: mail.html };
        if (mail.reply_to) p.reply_to = mail.reply_to;
        ok = await resend(deps, p);
      } catch (e) {}
      if (ok) { await deps.db.rpc('notif_digest_marque', { p_token: l.token }); sent++; } else failed++;
    }
  }
  return json({ ok: true, sent, failed });
}
