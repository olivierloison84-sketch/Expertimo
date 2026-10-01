// Mise en forme des emails du lot 6 (alertes agent, point hebdomadaire vendeur). Module sans dépendance : testé sous Node.
export const APP_URL = 'https://app.privency.fr';
const TAB_LABELS = { bien: 'Le bien', marche: 'Ventes comparables', rentabilite: 'Simulateur investisseur', historique: 'Historique du bien', diagnostics: 'Diagnostics', budget: 'Financement et budget', quartier: 'Quartier et carte', documents: 'Documents', assistant: 'Assistant', offre: 'Faire une offre' };

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// En-têtes : jamais de saut de ligne ni de chevrons venant d'une saisie.
export function clean(s, max = 80) { return String(s == null ? '' : s).replace(/[\r\n\t<>"]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
export function validEmail(s) { return typeof s === 'string' && s.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(s); }

function wrap(inner) {
  return '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6;max-width:560px;">' + inner + '</div>';
}
function btn(href, label) {
  return '<p style="margin:18px 0;"><a href="' + esc(href) + '" style="display:inline-block;background:#14171F;color:#C9A227;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;">' + esc(label) + '</a></p>';
}

const ALERTE = {
  offre: (c) => ['💶 Une offre vient d’être transmise', c + ' vient de transmettre une offre sur la fiche.'],
  documents: (c) => ['📎 ' + c + ' demande des documents', c + ' vient de demander des documents depuis la fiche.'],
  simulation: (c) => ['🏦 ' + c + ' simule son financement', c + ' vient de simuler un financement : c’est un acquéreur qui se projette.'],
  retour_visite: (c) => ['🗣️ ' + c + ' a donné son retour de visite', c + ' vient de donner son retour de visite : ouvrez Mes stats pour voir ce qui compte pour lui.'],
  reouverture: (c) => ['👀 ' + c + ' rouvre la fiche', c + ' rouvre la fiche pour la 3e fois (ou plus) en 48 h : le bien lui reste en tête.']
};
export function buildAlerte(a) {
  const f = ALERTE[a.type]; if (!f) return null;
  const who = clean(a.client_nom, 60) || 'Un acquéreur';
  const [title, text] = f(who);
  return {
    subject: clean(title, 120),
    html: wrap('<p style="font-size:16px;font-weight:700;margin:0 0 8px;">' + esc(title) + '</p><p style="margin:0 0 6px;">' + esc(text) + '</p><p style="margin:0;color:#666;">Bien : ' + esc(clean(a.bien, 120) || 'fiche') + '</p>'
      + '<p style="margin:12px 0 0;">C’est le bon moment pour l’appeler.</p>' + btn(APP_URL + '/app.html', 'Ouvrir Privency')
      + '<p style="font-size:12px;color:#888;margin:0;">Vous recevez cette alerte car vous l’avez activée dans Mes stats. Vous pouvez la désactiver au même endroit.</p>')
  };
}

function frDay(jour) {
  try { const p = String(jour).split('-'); const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)); return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long' }).format(d) + ' ' + p[2] + '/' + p[1]; } catch (e) { return ''; }
}
function activiteLigne(a) {
  const when = frDay(a.jour) + (a.moment === 'matin' ? ', matin' : ', après-midi');
  let t;
  if (a.type === 'ouverture') t = 'a ouvert la fiche de votre bien';
  else if (a.type === 'simulation') t = 'a simulé son financement pour ce bien';
  else if (a.type === 'documents') t = 'a demandé des documents' + (a.detail ? ' : ' + a.detail : '');
  else if (a.type === 'question') t = 'a posé une question' + (a.detail ? ' sur le thème « ' + a.detail + ' »' : '');
  else if (a.type === 'retour') t = 'a donné son retour de visite' + (a.detail ? ' : ce qui compte, ' + a.detail : '');
  else if (a.type === 'rubrique' && Object.prototype.hasOwnProperty.call(TAB_LABELS, a.detail)) t = 'a consulté « ' + TAB_LABELS[a.detail] + ' » pendant ' + Math.max(1, Math.round((a.sec || 60) / 60)) + ' min';
  else return null;
  return { when, text: 'Acquéreur ' + String(a.lettre || '').slice(0, 3) + ' ' + t };
}

// rapport = résultat de vendeur_rapport(jeton) ; now = Date (injectée pour les tests)
export function buildDigest(rapport, token, now = new Date()) {
  const ag = rapport.agent || {}, s = rapport.semaine || {}, t = rapport.totaux || {};
  const cutoff = new Date(now.getTime() - 8 * 86400000).toISOString().slice(0, 10);
  const lignes = (rapport.activite || []).filter(a => String(a.jour) >= cutoff).map(activiteLigne).filter(Boolean).slice(0, 6);
  const nom = clean(ag.nom, 60) || 'Votre conseiller';
  const bien = clean(rapport.bien, 120) || 'votre bien';
  const noteRecente = rapport.note && rapport.note_at && (now.getTime() - new Date(rapport.note_at).getTime()) < 8 * 86400000;
  const delta = (s.visites || 0) - (s.visites_prec || 0);
  let h = '<p style="font-size:16px;font-weight:700;margin:0 0 4px;">Le point de la semaine sur votre bien</p><p style="margin:0 0 14px;color:#666;">' + esc(bien) + '</p>';
  h += '<p style="margin:0 0 10px;"><b style="font-size:20px;">' + Number(s.visites || 0) + '</b> ouverture' + ((s.visites || 0) > 1 ? 's' : '') + ' de la fiche cette semaine'
    + (s.visites_prec != null ? ' (' + (delta > 0 ? '+' : '') + delta + ' par rapport à la semaine précédente)' : '') + ', par <b>' + Number(s.acquereurs || 0) + '</b> acquéreur' + ((s.acquereurs || 0) > 1 ? 's' : '') + ' identifié' + ((s.acquereurs || 0) > 1 ? 's' : '') + '.</p>';
  if (lignes.length) h += '<p style="margin:14px 0 6px;font-weight:700;">Ce qui s’est passé</p><ul style="margin:0;padding-left:18px;">' + lignes.map(l => '<li><span style="color:#888;">' + esc(l.when) + ' — </span>' + esc(l.text) + '</li>').join('') + '</ul>';
  else h += '<p style="margin:10px 0;color:#555;">Aucune démarche notable sur la fiche cette semaine.</p>';
  h += '<p style="margin:14px 0 0;color:#555;">Depuis la mise en ligne : ' + Number(t.visites || 0) + ' ouvertures, ' + Number(t.acquereurs || 0) + ' acquéreurs identifiés.</p>';
  if (noteRecente) h += '<p style="margin:14px 0 0;padding:10px 12px;background:#F3E9CC;border-radius:8px;"><b>Le mot de ' + esc(nom) + ' :</b> ' + esc(String(rapport.note).slice(0, 600)) + '</p>';
  h += btn(APP_URL + '/vendeur.html#' + token, 'Voir le compte rendu complet');
  h += '<p style="font-size:12px;color:#888;margin:0;">Vous recevez ce point chaque lundi car votre conseiller, ' + esc(nom) + ', vous l’a proposé. Pour ne plus le recevoir : ouvrez le compte rendu ci-dessus et cliquez sur « Ne plus recevoir ce point par e-mail ». Les acquéreurs sont désignés par une lettre : aucun nom ni coordonnée n’est communiqué.</p>';
  return {
    subject: clean('Le point de la semaine sur votre bien — ' + bien, 140),
    from: clean(nom, 60).replace(/[^\p{L}\p{N} .'’-]/gu, '') + ' via Privency <noreply@privency.fr>',
    reply_to: validEmail(ag.email) ? ag.email : null,
    html: wrap(h)
  };
}
