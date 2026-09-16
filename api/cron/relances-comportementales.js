const { createClient } = require('@supabase/supabase-js');

// Suivi comportemental (remplace le suivi mensuel générique) : ce endpoint
// est appelé quotidiennement par un Vercel Cron Job (voir vercel.json) et
// envoie au plus une relance par agent et par exécution, par ordre de
// priorité : J+3 sans fiche > J+7 profil incomplet > inactivité 14 jours >
// suivi mensuel (agents actifs).
//
// SMS (Twilio/Brevo) non implémenté ici faute d'identifiants configurés
// dans ce dépôt : les relances partent par email via Resend, déjà utilisé
// par api/send-lead.js et api/stripe-webhook.js.

const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';

const J3_MS  = 3  * 24 * 60 * 60 * 1000;
const J7_MS  = 7  * 24 * 60 * 60 * 1000;
const J14_MS = 14 * 24 * 60 * 60 * 1000;
const J30_MS = 30 * 24 * 60 * 60 * 1000;

function profilIncomplet(profile) {
  return !profile || !profile.tel || !profile.photo_url || !profile.rdv_url;
}

function bodyToHtml(lines) {
  return '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6;">'
    + lines.map(function(l) { return '<p style="margin:0 0 10px;">' + l + '</p>'; }).join('')
    + '</div>';
}

async function sendEmail(apiKey, to, subject, lines) {
  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        from: 'Olivier — Privency <bonjour@privency.fr>',
        to: [to],
        subject: subject,
        html: bodyToHtml(lines)
      })
    });
    if (!resendRes.ok) {
      const errData = await resendRes.json().catch(function() { return {}; });
      console.error('[api/cron/relances-comportementales] Resend error:', resendRes.status, errData);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[api/cron/relances-comportementales] sendEmail:', e);
    return false;
  }
}

module.exports = async function handler(req, res) {
  const authHeader = req.headers.authorization || '';
  if (!process.env.CRON_SECRET || authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.SUPABASE_SECRET_KEY) {
    console.error('[api/cron/relances-comportementales] variable serveur manquante (SUPABASE_SECRET_KEY)');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('[api/cron/relances-comportementales] RESEND_API_KEY not configured on server');
    return res.status(500).json({ error: 'RESEND_API_KEY not configured on server' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

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

    const profilesByUser = new Map();
    (profilesRes.data || []).forEach(function(p) { profilesByUser.set(p.user_id, p); });

    const fichesCountByAgent = new Map();
    (fichesRes.data || []).forEach(function(f) {
      fichesCountByAgent.set(f.agent_user_id, (fichesCountByAgent.get(f.agent_user_id) || 0) + 1);
    });

    const now = Date.now();
    const resultats = { j3: 0, j7: 0, inactivite: 0, mensuel: 0 };

    for (const agent of (agentsRes.data || [])) {
      if (!agent.email || !agent.created_at) continue;

      const profile = profilesByUser.get(agent.id) || {};
      const prenom = profile.prenom || '';
      const nbFiches = fichesCountByAgent.get(agent.id) || 0;
      const ageDepuisInscription = now - new Date(agent.created_at).getTime();
      const derniereConnexion = profile.date_derniere_connexion ? new Date(profile.date_derniere_connexion).getTime() : null;

      let envoye = false;

      // J+3 — aucune fiche créée
      if (!envoye && ageDepuisInscription >= J3_MS && nbFiches === 0 && !profile.relance_j3_envoyee) {
        const ok = await sendEmail(resendApiKey, agent.email, 'On vous aide à démarrer sur Privency ?', [
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
        const ok = await sendEmail(resendApiKey, agent.email, 'Une dernière étape pour votre profil Privency', [
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
        const ok = await sendEmail(resendApiKey, agent.email, 'Des nouvelles de votre espace Privency', [
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
        const ok = await sendEmail(resendApiKey, agent.email, 'Comment se passe votre mois sur Privency ?', [
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

    return res.status(200).json({ ok: true, resultats: resultats });
  } catch (err) {
    console.error('[api/cron/relances-comportementales] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
