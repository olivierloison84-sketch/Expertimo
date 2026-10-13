// Garde d'abonnement partagée par les routes qui créent ou modifient une fiche.
// 'active' et 'past_due' (paiement échoué, quelques jours de grâce) gardent un
// accès complet ; tout autre statut (ex. 'inactive' après fin d'essai sans carte
// ou résiliation) est en lecture seule : les fiches déjà créées restent visibles.
const STATUTS_ECRITURE = ['active', 'past_due'];

const MESSAGE_LECTURE_SEULE =
  'Votre abonnement n\'est plus actif : votre compte est en lecture seule. Abonnez-vous pour créer, modifier ou publier une fiche.';

// Renvoie { ok: true } si l'agent peut écrire, sinon { ok: false, status, error }
// prêt à être renvoyé tel quel (fail-closed : une erreur de lecture refuse aussi).
async function verifierAbonnementActif(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('subscription_status')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[api/_abonnement] lookup agents:', error);
    return { ok: false, status: 500, error: 'Erreur lors de la vérification de l\'abonnement' };
  }
  if (!data || STATUTS_ECRITURE.indexOf(data.subscription_status) === -1) {
    return { ok: false, status: 403, error: MESSAGE_LECTURE_SEULE, code: 'abonnement_inactif' };
  }
  return { ok: true };
}

module.exports = { verifierAbonnementActif, STATUTS_ECRITURE, MESSAGE_LECTURE_SEULE };
