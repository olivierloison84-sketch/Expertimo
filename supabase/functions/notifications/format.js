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
  return '<div style="font-family:Arial,sans-serif;font-size:15px;color:#0F1A16;line-height:1.6;max-width:560px;">' + inner + '</div>';
}
function btn(href, label) {
  return '<p style="margin:18px 0;"><a href="' + esc(href) + '" style="display:inline-block;background:#0E9F6E;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;">' + esc(label) + '</a></p>';
}

// Alertes instantanées : seulement ce qui mérite d'interrompre l'agent (voir supabase-notifications-v2.sql et supabase-notifications-participation.sql).
const ALERTE = {
  offre: (c) => ['💶 Une offre vient d’être transmise', c + ' vient de transmettre une offre sur la fiche.', 'Une offre se traite vite : ouvrez Privency pour la consulter et rappelez l’acquéreur.'],
  tres_chaud: (c, d) => ['🔥 ' + c + ' est un acquéreur très chaud', c + ' vient de passer au niveau « très chaud »' + (d ? ' : ' + d + '.' : '.'), 'C’est le bon moment pour l’appeler ou lui envoyer un message : le bouton « Message adapté » de Mes stats vous prépare un texte.'],
  documents: (c) => ['📎 ' + c + ' demande des documents', c + ' vient de demander des documents depuis la fiche.', 'Répondre vite à une demande de documents, c’est garder l’acquéreur dans la dynamique.'],
  retour_visite: (c) => ['🗣️ ' + c + ' a donné son retour de visite', c + ' vient de donner son retour de visite : ouvrez Mes stats pour voir ce qui compte pour lui.', 'Son retour vous indique le meilleur angle pour le rappeler.']
};
const GERER = '<p style="font-size:12px;color:#667085;margin:0;">Vous recevez cette alerte car vous l’avez activée. Pour la désactiver ou la régler : ouvrez Privency, onglet Mes stats, rubrique « Notifications ».</p>';
// Alertes « participation » : l'acquéreur envoie lui-même son match (test crush) ou son carnet de visite.
// Libellés repris de la fiche (onglet « Le test ») et de Mes stats ; un code inconnu n'est jamais affiché.
const CRUSH_Q = ['weekend', 'quotidien', 'interieur', 'travaux', 'rangement', 'quartier', 'energie', 'avenir'];
const CRUSH_FORT = { weekend: ['Pour ses week-ends dehors', 'Un vrai cocon'], quotidien: ['Tout à pied', 'La voiture sans stress'], interieur: ['De la lumière', 'Du calme'],
  travaux: ['Prêt à vivre', 'De quoi personnaliser'], rangement: ['De la place pour ranger', 'Une taille à sa mesure'], quartier: ['Un quartier vivant', 'Un quartier paisible'],
  energie: ['Un logement sobre', ''], avenir: ['Un secteur où s’installer', 'Un bien qui garde ses options'] };
const CRUSH_VERIF = { bruit: 'l’environnement sonore (signalé bruyant)', vis_a_vis: 'le vis-à-vis', expo_nord: 'la luminosité (exposition nord)', rdc: 'la luminosité (rez-de-chaussée)',
  travaux: 'les travaux signalés', stationnement: 'le stationnement', acces_pied: 'les trajets du quotidien (peu de transports et commerces à pied)',
  peu_commerces: 'les commerces à proximité', dpe: 'la performance énergétique (DPE)', mutation: 'les projets du secteur (environnement en mutation)' };
const COUPS = { lumiere: 'lumière', volumes: 'volumes', cuisine: 'cuisine', salle_bain: 'salle de bains', calme: 'calme', jardin: 'jardin', exterieur: 'extérieur', vue: 'vue', rangements: 'rangements', etat: 'état général', quartier: 'quartier' };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function anonyme(n) { return ['', 'inconnu', 'anonyme'].indexOf(String(n == null ? '' : n).trim().toLowerCase()) !== -1; }
function parseDetail(s) { try { const j = JSON.parse(String(s || '')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch (e) { return {}; } }
function pct(n) { const x = Number(n); return Number.isFinite(x) && x >= 0 && x <= 100 ? Math.round(x) : null; }
function liste(arr) { return arr.length > 1 ? arr.slice(0, -1).join(', ') + ' et ' + arr[arr.length - 1] : (arr[0] || ''); }
function ul(items) { return '<ul style="margin:0 0 6px;padding-left:18px;">' + items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'; }
// Lien vers Mes stats, sur la ligne de l'acquéreur (et son message adapté quand il est identifié).
export function lienStats(client, bienAdresse) {
  const q = ['vue=stats'];
  if (client) q.push('acq=' + encodeURIComponent(String(client).slice(0, 200)));
  if (bienAdresse) q.push('bien=' + encodeURIComponent(String(bienAdresse).slice(0, 300)));
  return APP_URL + '/app.html?' + q.join('&');
}
function buildParticipation(a) {
  const p = parseDetail(a.detail);
  const identifie = !anonyme(a.client_nom);
  // prénom saisi dans le test (pour le carnet, « n » contient les notes)
  const saisi = a.type !== 'crush' ? '' : clean(p.n, 60).replace(/[^\p{L}\p{N} .'’&-]/gu, '').trim();
  const who = saisi || (identifie ? clean(a.client_nom, 60) : '');
  const bien = clean(a.bien, 120) || 'fiche';
  let title, h = '';
  if (a.type === 'crush') {
    const duo = p.m === 'duo', s = pct(p.s), rep = typeof p.a === 'string' ? p.a : '';
    title = duo ? '💘 ' + (who ? who + (who.indexOf('&') !== -1 ? ' ont fait' : ' a fait') : 'Deux acquéreurs ont fait') + ' le test à deux' + (s != null ? ' : ' + s + ' % en commun' : '')
                : '💘 ' + (who || 'Un acquéreur') + ' a envoyé son match' + (s != null ? ' : ' + s + ' %' : '');
    let mode = duo ? 'Test « Crush ou crash ? » fait à deux' : 'Test « Crush ou crash ? » fait seul';
    if (duo) { const s1 = pct(p.s1), s2 = pct(p.s2), acc = Number(p.acc);
      const det = []; if (s1 != null && s2 != null) det.push(s1 + ' % et ' + s2 + ' % chacun'); if (Number.isInteger(acc) && acc >= 0 && acc <= 8) det.push('d’accord sur ' + acc + ' critère' + (acc > 1 ? 's' : '') + ' sur 8');
      if (det.length) mode += ' (' + det.join(', ') + ')'; }
    const forts = (Array.isArray(p.c) ? p.c : []).filter(q => own(CRUSH_FORT, q)).slice(0, 3)
      .map(q => CRUSH_FORT[q][rep.charAt(CRUSH_Q.indexOf(q)) === 'B' ? 1 : 0]).filter(Boolean);
    const verif = (Array.isArray(p.w) ? p.w : []).filter(k => own(CRUSH_VERIF, k)).map(k => CRUSH_VERIF[k]);
    h += '<p style="margin:0 0 10px;">' + esc(mode) + (s != null ? ' : <b>' + s + ' %</b>' + (duo ? ' en commun' : '') : '') + '.</p>';
    h += '<p style="margin:0 0 4px;font-weight:700;">' + (duo ? 'Ce qui les réunit' : 'Ses 3 critères les plus forts') + '</p>' + (forts.length ? ul(forts) : '<p style="margin:0 0 6px;color:#667085;">Aucun critère fort retenu par le test.</p>');
    h += '<p style="margin:8px 0 4px;font-weight:700;">Points à vérifier pendant la visite</p>' + (verif.length ? ul(verif) : '<p style="margin:0 0 6px;color:#667085;">Aucun point particulier signalé par le test.</p>');
  } else {
    title = '📒 ' + (who || 'Un acquéreur') + ' a partagé son carnet de visite';
    const coups = (Array.isArray(p.c) ? p.c : []).filter(k => own(COUPS, k)).map(k => COUPS[k]);
    const notes = typeof p.n === 'string' ? p.n.replace(/\s+/g, ' ').trim().slice(0, 300) : '', ph = Number(p.ph);
    h += '<p style="margin:0 0 10px;">Ce qui a plu pendant la visite : <b>' + esc(coups.length ? liste(coups) : 'non précisé') + '</b>.</p>';
    if (notes) h += '<p style="margin:0 0 10px;">Ses notes : « ' + esc(notes) + ' »</p>';
    if (Number.isInteger(ph) && ph > 0 && ph < 100) h += '<p style="margin:0 0 10px;color:#667085;">' + ph + ' photo' + (ph > 1 ? 's' : '') + ' prise' + (ph > 1 ? 's' : '') + ' pendant la visite (restée' + (ph > 1 ? 's' : '') + ' sur son téléphone).</p>';
  }
  const hint = identifie ? 'Dans Mes stats, le bouton « Message adapté » vous propose un texte qui part de ce que l’acquéreur vous a envoyé : modifiez-le librement avant de l’envoyer.'
                         : 'L’acquéreur a ouvert la fiche sans lien personnalisé : retrouvez son envoi dans Mes stats (ligne « inconnu »).';
  return {
    subject: clean(title, 120),
    html: wrap('<p style="font-size:18px;font-weight:700;margin:0 0 8px;">' + esc(title) + '</p><p style="margin:0 0 12px;color:#667085;">Bien : ' + esc(bien) + '</p>' + h
      + '<p style="margin:12px 0 0;">' + esc(hint) + '</p>' + btn(lienStats(a.client_nom ? String(a.client_nom).trim() : '', a.bien_adresse), identifie ? 'Ouvrir Mes stats et le message adapté' : 'Ouvrir Mes stats') + GERER)
  };
}
export function buildAlerte(a) {
  if (a && (a.type === 'crush' || a.type === 'carnet')) return buildParticipation(a);
  const f = ALERTE[a.type]; if (!f) return null;
  const who = clean(a.client_nom, 60) || 'Un acquéreur';
  const [title, text, hint] = f(who, clean(a.detail, 200));
  return {
    subject: clean(title, 120),
    html: wrap('<p style="font-size:18px;font-weight:700;margin:0 0 8px;">' + esc(title) + '</p><p style="margin:0 0 6px;">' + esc(text) + '</p><p style="margin:0;color:#667085;">Bien : ' + esc(clean(a.bien, 120) || 'fiche') + '</p>'
      + '<p style="margin:12px 0 0;">' + esc(hint) + '</p>' + btn(APP_URL + '/app.html', 'Ouvrir Privency') + GERER)
  };
}

// Résumé du lundi pour l'agent. r = ligne de notif_resume_dus() ; l'objectif : qui rappeler, qui relancer, sans bruit.
export function buildResume(r) {
  const prenom = clean(r.agent_prenom, 40);
  const chauds = Array.isArray(r.chauds) ? r.chauds.slice(0, 5) : [], sil = Array.isArray(r.silences) ? r.silences.slice(0, 5) : [];
  const v = Number(r.visites || 0), vp = Number(r.visites_prec || 0), delta = v - vp;
  let h = '<p style="font-size:18px;font-weight:700;margin:0 0 4px;">Votre semaine sur Privency</p>';
  h += '<p style="margin:0 0 12px;color:#667085;">Bonjour' + (prenom ? ' ' + esc(prenom) : '') + ', voici ce qui compte pour cette semaine.</p>';
  h += '<p style="margin:0 0 10px;"><b>' + v + '</b> ouverture' + (v > 1 ? 's' : '') + ' de vos fiches ces 7 derniers jours' + (vp ? ' (' + (delta > 0 ? '+' : '') + delta + ' par rapport à la semaine précédente)' : '') + '.</p>';
  // Ce que l'acheteur a fait lui-même (offre, documents, test, carnet…) ; jamais les ouvertures ni le partage de la fiche
  const fait = c => { const a = clean(c.actions, 200); return a ? '<br><span style="font-size:13px;">' + esc(a) + '</span>' : ''; };
  if (chauds.length) h += '<p style="margin:14px 0 6px;font-weight:700;">📞 À rappeler cette semaine</p><ul style="margin:0;padding-left:18px;">' + chauds.map(c => '<li><b>' + esc(clean(c.client, 60)) + '</b> — ' + esc(clean(c.niveau, 20)) + ' <span style="color:#667085;">(' + esc(clean(c.bien, 80)) + ')</span>' + fait(c) + '</li>').join('') + '</ul>';
  if (sil.length) h += '<p style="margin:14px 0 6px;font-weight:700;">😶 En silence : à relancer ou à laisser</p><ul style="margin:0;padding-left:18px;">' + sil.map(c => '<li><b>' + esc(clean(c.client, 60)) + '</b> — sans ouverture depuis ' + Number(c.jours || 0) + ' jours <span style="color:#667085;">(' + esc(clean(c.bien, 80)) + ')</span>' + fait(c) + '</li>').join('') + '</ul>';
  h += '<p style="margin:14px 0 0;">Chaque acquéreur a son bouton « Message adapté » dans Mes stats : un texte prêt à envoyer, que vous pouvez modifier.</p>' + btn(APP_URL + '/app.html', 'Ouvrir Mes stats');
  h += '<p style="font-size:12px;color:#667085;margin:0;">Vous recevez ce résumé chaque lundi car vous l’avez activé. Pour l’arrêter : Privency, onglet Mes stats, rubrique « Notifications ».</p>';
  return { subject: 'Votre semaine sur Privency : ' + (chauds.length ? chauds.length + ' acquéreur' + (chauds.length > 1 ? 's' : '') + ' à rappeler' : sil.length ? sil.length + ' à relancer' : v + ' ouverture' + (v > 1 ? 's' : '')), html: wrap(h) };
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
export function buildDigest(rapport, token, now = new Date(), proprio = null) {
  const ag = rapport.agent || {}, s = rapport.semaine || {}, t = rapport.totaux || {};
  const cutoff = new Date(now.getTime() - 8 * 86400000).toISOString().slice(0, 10);
  const lignes = (rapport.activite || []).filter(a => String(a.jour) >= cutoff).map(activiteLigne).filter(Boolean).slice(0, 6);
  const nom = clean(ag.nom, 60) || 'Votre conseiller';
  const bien = clean(rapport.bien, 120) || 'votre bien';
  const noteRecente = rapport.note && rapport.note_at && (now.getTime() - new Date(rapport.note_at).getTime()) < 8 * 86400000;
  const delta = (s.visites || 0) - (s.visites_prec || 0);
  const salut = clean(proprio, 100).replace(/[^\p{L}\p{N} .'’-]/gu, '').trim();   // nom du propriétaire saisi par l'agent ; sans lui, la version habituelle
  let h = (salut ? '<p style="margin:0 0 10px;">Bonjour ' + esc(salut) + ',</p>' : '') + '<p style="font-size:18px;font-weight:700;margin:0 0 4px;">Le point de la semaine sur votre bien</p><p style="margin:0 0 14px;color:#667085;"><a href="' + esc(APP_URL + '/vendeur.html#' + token) + '" style="color:#667085;text-decoration:none;">' + esc(bien) + '</a></p>';
  h += '<p style="margin:0 0 10px;"><b>' + Number(s.visites || 0) + '</b> ouverture' + ((s.visites || 0) > 1 ? 's' : '') + ' de la fiche cette semaine'
    + (s.visites_prec != null ? ' (' + (delta > 0 ? '+' : '') + delta + ' par rapport à la semaine précédente)' : '') + ', par <b>' + Number(s.acquereurs || 0) + '</b> acquéreur' + ((s.acquereurs || 0) > 1 ? 's' : '') + ' identifié' + ((s.acquereurs || 0) > 1 ? 's' : '') + '.</p>';
  if (lignes.length) h += '<p style="margin:14px 0 6px;font-weight:700;">Ce qui s’est passé</p><ul style="margin:0;padding-left:18px;">' + lignes.map(l => '<li><span style="color:#667085;">' + esc(l.when) + ' — </span>' + esc(l.text) + '</li>').join('') + '</ul>';
  else h += '<p style="margin:10px 0;color:#667085;">Aucune démarche notable sur la fiche cette semaine.</p>';
  h += '<p style="margin:14px 0 0;color:#667085;">Depuis la mise en ligne : ' + Number(t.visites || 0) + ' ouvertures, ' + Number(t.acquereurs || 0) + ' acquéreurs identifiés.</p>';
  if (noteRecente) h += '<p style="margin:14px 0 0;padding:10px 12px;background:#E9F9F1;border-radius:8px;"><b>Le mot de ' + esc(nom) + ' :</b> ' + esc(String(rapport.note).slice(0, 600)) + '</p>';
  h += btn(APP_URL + '/vendeur.html#' + token, 'Voir le compte rendu complet');
  h += '<p style="font-size:12px;color:#667085;margin:0;">Vous recevez ce point chaque lundi car votre conseiller, ' + esc(nom) + ', vous l’a proposé. Pour ne plus le recevoir : ouvrez le compte rendu ci-dessus et cliquez sur « Ne plus recevoir ce point par e-mail ». Les acquéreurs sont désignés par une lettre : aucun nom ni coordonnée n’est communiqué.</p>';
  return {
    subject: clean('Le point de la semaine sur votre bien — ' + bien, 140),
    from: clean(nom, 60).replace(/[^\p{L}\p{N} .'’-]/gu, '') + ' via Privency <noreply@privency.fr>',
    reply_to: validEmail(ag.email) ? ag.email : null,
    html: wrap(h)
  };
}
