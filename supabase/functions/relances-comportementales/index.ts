// Relances comportementales quotidiennes (remplace le suivi mensuel
// générique) : appelée une fois par jour par pg_cron via pg_net (voir
// supabase-cron-relances.sql), envoie au plus une relance par agent et par
// exécution, par ordre de priorité : J+3 sans fiche > J+7 profil incomplet
// > inactivité 14 jours > suivi mensuel (agents actifs).
//
// Anciennement un Vercel Cron Job (api/cron/relances-comportementales.js) :
// déplacé ici car le plan Vercel Hobby limite un déploiement à 12 fonctions
// serverless, déjà atteintes sans elle. Le reste de l'app (webhook Stripe,
// api/fiche-publish.js, api/send-lead.js, etc.) continue de tourner sur
// Vercel ; seule cette tâche planifiée est passée côté Supabase.
//
// SMS (Twilio/Brevo) non implémenté faute d'identifiants configurés pour ce
// projet : les relances partent par email via Resend, comme le webhook
// Stripe (api/stripe-webhook.js) et api/send-lead.js côté Vercel.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const J3_MS = 3 * 24 * 60 * 60 * 1000;
const J7_MS = 7 * 24 * 60 * 60 * 1000;
const J14_MS = 14 * 24 * 60 * 60 * 1000;
const J30_MS = 30 * 24 * 60 * 60 * 1000;

interface AgentProfile {
  user_id: string;
  prenom: string | null;
  tel: string | null;
  photo_url: string | null;
  rdv_url: string | null;
  date_derniere_connexion: string | null;
  relance_j3_envoyee: boolean | null;
  relance_j7_envoyee: boolean | null;
  relance_inactivite_envoyee_at: string | null;
  suivi_mensuel_envoye_at: string | null;
}

function profilIncomplet(profile: Partial<AgentProfile>) {
  return !profile || !profile.tel || !profile.photo_url || !profile.rdv_url;
}

// Lit le rôle porté par le JWT déjà validé par la passerelle Supabase (le
// gateway vérifie la signature avant d'invoquer la fonction ; on se contente
// ici de lire la revendication "role" pour restreindre l'appel au
// service_role — la clé anon, elle, est publique côté client (app.html) et
// ne doit jamais pouvoir déclencher ces relances).
function decodeJwtRole(authHeader: string): string | null {
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const payloadPart = token.split('.')[1];
  if (!payloadPart) return null;
  try {
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '='));
    return JSON.parse(json).role || null;
  } catch {
    return null;
  }
}

function bodyToHtml(lines: string[]) {
  return '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6;">'
    + lines.map((l) => '<p style="margin:0 0 10px;">' + l + '</p>').join('')
    + '</div>';
}

async function sendEmail(to: string, subject: string, lines: string[]) {
  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + RESEND_API_KEY
      },
      body: JSON.stringify({
        from: 'Olivier — Privency <bonjour@privency.fr>',
        to: [to],
        subject: subject,
        html: bodyToHtml(lines)
      })
    });
    if (!resendRes.ok) {
      const errData = await resendRes.json().catch(() => ({}));
      console.error('[relances-comportementales] Resend error:', resendRes.status, errData);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[relances-comportementales] sendEmail:', e);
    return false;
  }
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') || '';
  if (decodeJwtRole(authHeader) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!RESEND_API_KEY) {
    console.error('[relances-comportementales] RESEND_API_KEY not configured (supabase secrets set RESEND_API_KEY=...)');
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const [agentsRes, profilesRes, fichesRes] = await Promise.all([
      supabaseAdmin.from('agents').select('id, email, subscription_status, created_at').eq('subscription_status', 'active'),
      supabaseAdmin.from('agent_profiles').select(
        'user_id, prenom, tel, photo_url, rdv_url, date_derniere_connexion, '
        + 'relance_j3_envoyee, relance_j7_envoyee, relance_inactivite_envoyee_at, suivi_mensuel_envoye_at'
      ),
      supabaseAdmin.from('agent_fiches').select('agent_user_id')
    ]);
    if (agentsRes.error) throw agentsRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (fichesRes.error) throw fichesRes.error;

    const profilesByUser = new Map<string, AgentProfile>();
    (profilesRes.data || []).forEach((p: AgentProfile) => profilesByUser.set(p.user_id, p));

    const fichesCountByAgent = new Map<string, number>();
    (fichesRes.data || []).forEach((f: { agent_user_id: string }) => {
      fichesCountByAgent.set(f.agent_user_id, (fichesCountByAgent.get(f.agent_user_id) || 0) + 1);
    });

    const now = Date.now();
    const resultats = { j3: 0, j7: 0, inactivite: 0, mensuel: 0 };

    for (const agent of (agentsRes.data || [])) {
      if (!agent.email || !agent.created_at) continue;

      const profile = profilesByUser.get(agent.id) || ({} as Partial<AgentProfile>);
      const prenom = profile.prenom || '';
      const nbFiches = fichesCountByAgent.get(agent.id) || 0;
      const ageDepuisInscription = now - new Date(agent.created_at).getTime();
      const derniereConnexion = profile.date_derniere_connexion ? new Date(profile.date_derniere_connexion).getTime() : null;

      let envoye = false;

      // J+3 — aucune fiche créée
      if (!envoye && ageDepuisInscription >= J3_MS && nbFiches === 0 && !profile.relance_j3_envoyee) {
        const ok = await sendEmail(agent.email, 'On vous aide à démarrer sur Privency ?', [
          'Bonjour ' + prenom + ', je vois que tu n\'as pas encore créé ta première fiche sur Privency. '
            + 'Besoin d\'un coup de main pour démarrer ? Je suis dispo.',
          'Olivier'
        ]);
        if (ok) {
          await supabaseAdmin.from('agent_profiles').upsert({ user_id: agent.id, relance_j3_envoyee: true });
          resultats.j3++;
          envoye = true;
        }
      }

      // J+7 — fiche créée mais profil incomplet
      if (!envoye && ageDepuisInscription >= J7_MS && nbFiches >= 1 && profilIncomplet(profile) && !profile.relance_j7_envoyee) {
        const ok = await sendEmail(agent.email, 'Une dernière étape pour votre profil Privency', [
          'Salut ' + prenom + ', ta première fiche est en ligne, bravo ! Pense à compléter ton profil pour '
            + 'que les acheteurs te repèrent mieux. Dis-moi si tu veux que je regarde ça avec toi.',
          'Olivier'
        ]);
        if (ok) {
          await supabaseAdmin.from('agent_profiles').upsert({ user_id: agent.id, relance_j7_envoyee: true });
          resultats.j7++;
          envoye = true;
        }
      }

      // Inactivité 14 jours (relance_inactivite_envoyee_at est remis à NULL
      // à chaque connexion — voir app.html markConnexion — pour permettre
      // une nouvelle relance si l'agent redevient inactif plus tard).
      if (!envoye && derniereConnexion && (now - derniereConnexion) >= J14_MS && !profile.relance_inactivite_envoyee_at) {
        const ok = await sendEmail(agent.email, 'Des nouvelles de votre espace Privency', [
          'Hello ' + prenom + ', ça fait un moment qu\'on ne s\'est pas vus sur Privency. Tout va bien de ton côté ? '
            + 'N\'hésite pas si tu as besoin de quoi que ce soit.',
          'Olivier'
        ]);
        if (ok) {
          await supabaseAdmin.from('agent_profiles').upsert({ user_id: agent.id, relance_inactivite_envoyee_at: new Date().toISOString() });
          resultats.inactivite++;
          envoye = true;
        }
      }

      // Suivi mensuel — agents actifs (connectés au cours des 14 derniers
      // jours) n'ayant reçu aucune autre relance ci-dessus.
      const actif = !!derniereConnexion && (now - derniereConnexion) < J14_MS;
      const suiviMensuelDu = !profile.suivi_mensuel_envoye_at || (now - new Date(profile.suivi_mensuel_envoye_at).getTime()) >= J30_MS;
      if (!envoye && actif && suiviMensuelDu && ageDepuisInscription >= J30_MS) {
        const ok = await sendEmail(agent.email, 'Comment se passe votre mois sur Privency ?', [
          'Bonjour ' + prenom + ', petit message pour savoir si tout se passe bien sur ton espace Privency ce mois-ci. '
            + 'N\'hésite pas à me contacter pour toute question ou besoin d\'aide.',
          'Olivier'
        ]);
        if (ok) {
          await supabaseAdmin.from('agent_profiles').upsert({ user_id: agent.id, suivi_mensuel_envoye_at: new Date().toISOString() });
          resultats.mensuel++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, resultats }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[relances-comportementales] Error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
