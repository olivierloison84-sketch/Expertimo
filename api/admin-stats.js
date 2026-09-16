const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGIN_PREFIXES = [
  'https://app.privency.fr',
  'https://expertimo-phi.vercel.app',
  'https://olivierloison84-sketch.github.io',
  'http://localhost'
];

const SUPABASE_URL   = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
const ADMIN_USER_ID  = '79e4e432-2232-4d2c-b41d-8c7c907c4dec';
const ADMIN_EMAIL    = 'olivier.loison84@gmail.com';
const MRR_PAR_CLIENT = 69;

function originFromReferer(referer) {
  try {
    const u = new URL(referer);
    return u.protocol + '//' + u.host;
  } catch (e) {
    return '';
  }
}

// Regroupe les lignes agent_fiches par agent_user_id : nombre de fiches,
// date de création de la première et de mise à jour de la dernière.
function groupFiches(rows) {
  const map = new Map();
  (rows || []).forEach(function(row) {
    var entry = map.get(row.agent_user_id);
    if (!entry) {
      entry = { count: 0, premiere_fiche: null, derniere_maj_fiche: null };
      map.set(row.agent_user_id, entry);
    }
    entry.count += 1;
    if (row.created_at && (!entry.premiere_fiche || row.created_at < entry.premiere_fiche)) {
      entry.premiere_fiche = row.created_at;
    }
    if (row.updated_at && (!entry.derniere_maj_fiche || row.updated_at > entry.derniere_maj_fiche)) {
      entry.derniere_maj_fiche = row.updated_at;
    }
  });
  return map;
}

// Regroupe les lignes fiche_views par agent_id : nb vues (fiche_ouverte),
// nb offres (offre_soumise), et date du dernier événement tous types confondus.
function groupViews(rows) {
  const map = new Map();
  (rows || []).forEach(function(row) {
    var entry = map.get(row.agent_id);
    if (!entry) {
      entry = { nb_vues: 0, nb_offres: 0, derniere_activite: null };
      map.set(row.agent_id, entry);
    }
    if (row.evenement === 'fiche_ouverte') entry.nb_vues += 1;
    else if (row.evenement === 'offre_soumise') entry.nb_offres += 1;
    if (row.created_at && (!entry.derniere_activite || row.created_at > entry.derniere_activite)) {
      entry.derniere_activite = row.created_at;
    }
  });
  return map;
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7).trim() : '';
  if (!jwt) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  if (!process.env.SUPABASE_SECRET_KEY) {
    console.error('[api/admin-stats] variable serveur manquante (SUPABASE_SECRET_KEY)');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
  const user = userData && userData.user;
  if (userErr || !user) {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }

  // Garde d'accès : seul le compte admin d'Olivier peut interroger cette route.
  // Volontairement une comparaison stricte sur l'id (pas sur l'email) : c'est
  // l'id du JWT qui fait foi ici, la logique isSelf ci-dessous sert uniquement
  // à isoler ses comptes personnels des statistiques clients, pas à autoriser l'accès.
  if (user.id !== ADMIN_USER_ID) {
    return res.status(403).json({ error: 'Accès non autorisé' });
  }

  try {
    const [agentsRes, profilesRes, fichesRes, viewsRes] = await Promise.all([
      supabaseAdmin.from('agents').select('id, email, subscription_status, stripe_subscription_id, created_at'),
      supabaseAdmin.from('agent_profiles').select('user_id, prenom, nom, reseau, onboarding_seen'),
      supabaseAdmin.from('agent_fiches').select('agent_user_id, created_at, updated_at'),
      supabaseAdmin.from('fiche_views').select('agent_id, evenement, created_at')
    ]);

    if (agentsRes.error) throw agentsRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (fichesRes.error) throw fichesRes.error;
    if (viewsRes.error) throw viewsRes.error;

    const profilesByUser = new Map();
    (profilesRes.data || []).forEach(function(p) { profilesByUser.set(p.user_id, p); });
    const fichesByAgent = groupFiches(fichesRes.data);
    const viewsByAgent = groupViews(viewsRes.data);

    const now = new Date();
    const moisCourant = now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');

    const agentsEnrichis = (agentsRes.data || []).map(function(agent) {
      var profile = profilesByUser.get(agent.id) || null;
      var fiches = fichesByAgent.get(agent.id) || { count: 0, premiere_fiche: null, derniere_maj_fiche: null };
      var views = viewsByAgent.get(agent.id) || { nb_vues: 0, nb_offres: 0, derniere_activite: null };

      var isTest = (agent.email || '').indexOf('+test') !== -1;
      var isSelf = agent.id === ADMIN_USER_ID || agent.email === ADMIN_EMAIL;
      var mrr = (agent.subscription_status === 'active' && !!agent.stripe_subscription_id && !isTest && !isSelf)
        ? MRR_PAR_CLIENT
        : 0;

      return {
        id: agent.id,
        email: agent.email,
        subscription_status: agent.subscription_status,
        stripe_subscription_id: agent.stripe_subscription_id,
        created_at: agent.created_at,
        prenom: profile ? profile.prenom : null,
        nom: profile ? profile.nom : null,
        reseau: profile ? profile.reseau : null,
        profil_complete: !!(profile && (profile.prenom || profile.nom)),
        onboarding_seen: profile ? !!profile.onboarding_seen : false,
        nb_fiches: fiches.count,
        premiere_fiche: fiches.premiere_fiche,
        derniere_maj_fiche: fiches.derniere_maj_fiche,
        nb_vues: views.nb_vues,
        nb_offres: views.nb_offres,
        derniere_activite: views.derniere_activite,
        isTest: isTest,
        isSelf: isSelf,
        mrr: mrr
      };
    });

    const clients = agentsEnrichis.filter(function(a) { return !a.isTest && !a.isSelf; });
    const comptesInternes = agentsEnrichis.filter(function(a) { return a.isTest || a.isSelf; });

    const mrrTotal = clients.reduce(function(sum, a) { return sum + a.mrr; }, 0);
    const nbClientsActifs = clients.filter(function(a) { return a.mrr > 0; }).length;
    const nbNouvellesInscriptionsCeMois = clients.filter(function(a) {
      return !!a.created_at && String(a.created_at).slice(0, 7) === moisCourant;
    }).length;
    const nbFichesTotal = clients.reduce(function(sum, a) { return sum + a.nb_fiches; }, 0);
    const nbVuesTotal = clients.reduce(function(sum, a) { return sum + a.nb_vues; }, 0);
    const nbOffresTotal = clients.reduce(function(sum, a) { return sum + a.nb_offres; }, 0);

    return res.status(200).json({
      totaux: {
        mrr_total: mrrTotal,
        arr_total: mrrTotal * 12,
        nb_clients_actifs: nbClientsActifs,
        nb_nouvelles_inscriptions_ce_mois: nbNouvellesInscriptionsCeMois,
        nb_fiches_total: nbFichesTotal,
        nb_vues_total: nbVuesTotal,
        nb_offres_total: nbOffresTotal
      },
      clients: clients,
      comptes_internes: comptesInternes
    });
  } catch (err) {
    console.error('[api/admin-stats] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
