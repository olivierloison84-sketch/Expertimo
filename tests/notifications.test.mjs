// Lot 6 : Edge Function « notifications » (alertes agent + point hebdomadaire vendeur) — format et handler, sans réseau.
import assert from 'assert';
import { handle } from '../supabase/functions/notifications/handler.js';
import { buildAlerte, buildDigest, buildResume, esc, clean } from '../supabase/functions/notifications/format.js';
const jwt = role => 'Bearer x.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.y';
const req = (mode, auth = jwt('service_role'), method = 'POST') => new Request('https://x/functions/v1/notifications', { method, headers: { authorization: auth, 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ mode }) : undefined });
function deps({ alertes = [], digests = [], rapport = null, resendOk = true } = {}) {
  const sent = [], rpcs = [];
  return { sent, rpcs, env: { RESEND_API_KEY: 'k', SERVICE_ROLE_KEY: jwt('service_role').slice(7) }, now: () => new Date('2026-10-05T06:00:00Z'),
    db: { rpc: async (fn, args) => { rpcs.push([fn, args]); if (fn === 'notif_alertes_dues') return { data: alertes }; if (fn === 'notif_digests_dues') return { data: digests }; if (fn === 'vendeur_rapport') return { data: rapport }; return { data: null }; } },
    fetch: async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: resendOk }; } };
}
// ── accès
let d = deps(); assert.strictEqual((await handle(req('alertes', jwt('anon')), d)).status, 403, 'clé anon refusée');
assert.strictEqual((await handle(req('alertes', ''), d)).status, 403, 'sans jeton refusé');
{ const dv = deps(); dv.verify = async t => t === 'x.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.OTHER';
  assert.strictEqual((await handle(req('alertes', 'Bearer x.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.OTHER'), dv)).status, 200, 'jeton validé par la base (autre format de clé) accepté');
  assert.strictEqual((await handle(req('alertes', jwt('anon')), dv)).status, 403, 'jeton refusé par la base : 403');
  dv.verify = async () => { throw new Error('x'); }; assert.strictEqual((await handle(req('alertes', jwt('anon')), dv)).status, 403, 'erreur de vérification : 403'); }
assert.strictEqual((await handle(req('alertes', jwt('service_role').replace('.y', '.z')), d)).status, 403, 'jeton forgé (signature différente) refusé');
assert.strictEqual((await handle(req('alertes', jwt('authenticated')), d)).status, 403, 'utilisateur connecté refusé');
assert.strictEqual((await handle(req('x'), d)).status, 400, 'mode invalide');
assert.strictEqual((await handle(req('alertes', jwt('service_role'), 'GET'), d)).status, 405, 'GET refusé');
assert.strictEqual(d.sent.length + d.rpcs.length, 0, 'aucun effet pour un appel refusé');
// ── alertes
const al = [{ agent_user_id: 'u1', agent_email: 'o@x.fr', cle: 'v:1', type: 'offre', client_nom: 'Marie <b>Dupont</b>\r\nBcc: x@y.z', bien: '12 rue des Lilas' },
            { agent_user_id: 'u1', agent_email: 'pas-un-email', cle: 'v:2', type: 'documents', client_nom: 'Paul', bien: 'B' },
            { agent_user_id: 'u1', agent_email: 'o@x.fr', cle: 'v:3', type: 'inconnu', client_nom: 'Z', bien: 'B' }];
d = deps({ alertes: al }); let r = await (await handle(req('alertes'), d)).json();
assert(r.ok && r.sent === 1 && r.failed === 2, 'alertes : 1 envoyée, 2 écartées : ' + JSON.stringify(r));
assert(d.sent[0].to[0] === 'o@x.fr' && !/[\r\n]/.test(d.sent[0].subject) && !/<b>/.test(d.sent[0].html) && /Marie/.test(d.sent[0].html), 'sujet sans saut de ligne, HTML échappé : ' + d.sent[0].subject);
assert(d.rpcs.filter(x => x[0] === 'notif_alerte_marque').length === 1 && d.rpcs.find(x => x[0] === 'notif_alerte_marque')[1].p_cle === 'v:1', 'seule l\'alerte envoyée est marquée');
d = deps({ alertes: [al[0]], resendOk: false }); r = await (await handle(req('alertes'), d)).json();
assert(r.sent === 0 && r.failed === 1 && !d.rpcs.some(x => x[0] === 'notif_alerte_marque'), 'échec Resend : non marquée (nouvel essai au prochain passage)');
for (const type of ['offre', 'tres_chaud', 'documents', 'retour_visite']) assert(buildAlerte({ type, client_nom: 'Léa', bien: 'B' }).subject.includes('Léa') || type === 'offre', 'alerte ' + type);
assert.strictEqual(buildAlerte({ type: 'simulation', client_nom: 'Léa' }), null, 'plus d\'alerte pour une simple simulation');
assert.strictEqual(buildAlerte({ type: 'reouverture', client_nom: 'Léa' }), null, 'plus d\'alerte pour une réouverture');
{ const m = buildAlerte({ type: 'tres_chaud', client_nom: 'Léa<b>', bien: 'B', detail: 'est revenu 4 fois sur la fiche, 15 min de lecture' }); assert(/très chaud/.test(m.subject) && /4 fois/.test(m.html) && !/<b>/.test(m.html) && /Notifications/.test(m.html), 'très chaud : détail, HTML échappé, comment désactiver'); }
// ── résumé du lundi
const rr = { agent_user_id: 'u1', agent_email: 'o@x.fr', agent_prenom: 'Olivier', chauds: [{ client: 'Marie <i>D</i>', niveau: 'très chaud', bien: '12 rue des Lilas' }], silences: [{ client: 'Paul', jours: 9, bien: 'B' }], visites: 12, visites_prec: 8, nb_fiches: 2 };
{ const m = buildResume(rr); assert(/Marie/.test(m.html) && !/<i>/.test(m.html) && /9 jours/.test(m.html) && /\+4/.test(m.html) && /1 acquéreur à rappeler/.test(m.subject) && /Notifications/.test(m.html), 'résumé : contenu, échappement, désinscription : ' + m.subject);
  d = deps({ alertes: [] }); d.db.rpc = async (fn, a) => { d.rpcs.push([fn, a]); return fn === 'notif_resume_dus' ? { data: [rr, { ...rr, agent_user_id: 'u2', agent_email: 'mauvais' }] } : { data: null }; };
  r = await (await handle(req('resume'), d)).json(); assert(r.ok && r.sent === 1 && r.failed === 1, 'résumé : 1 envoyé, 1 e-mail invalide écarté'); assert(d.sent[0].to[0] === 'o@x.fr' && d.rpcs.some(x => x[0] === 'notif_resume_marque' && x[1].p_agent === 'u1'), 'résumé marqué après envoi'); }
assert.strictEqual(buildAlerte({ type: 'pirate' }), null, 'type inconnu ignoré');
// ── point hebdomadaire
const rap = { ok: true, bien: 'Maison <script>x</script> Massy', agent: { nom: 'Olivier "Le" Loison\r\n', email: 'o@x.fr' }, note: 'Belle semaine <i>x</i>', note_at: '2026-10-03T10:00:00Z',
  totaux: { visites: 26, acquereurs: 7 }, semaine: { visites: 9, visites_prec: 5, acquereurs: 5 },
  activite: [{ lettre: 'A', type: 'documents', jour: '2026-10-02', moment: 'apres-midi', detail: 'Diagnostic amiante' }, { lettre: 'B', type: 'rubrique', jour: '2026-10-01', moment: 'matin', detail: 'quartier', sec: 130 },
             { lettre: 'B', type: 'rubrique', jour: '2026-10-01', moment: 'matin', detail: 'constructor', sec: 130 }, { lettre: 'C', type: 'question', jour: '2026-08-01', moment: 'matin', detail: 'Prix' }] };
const tok = 'a'.repeat(96);
d = deps({ digests: [{ token: tok, email: 'vendeur@x.fr' }, { token: 'b'.repeat(96), email: 'mauvais' }, { token: 'c'.repeat(96), email: 'ok@x.fr' }], rapport: rap });
const dr = d.db.rpc; d.db.rpc = async (fn, a) => (fn === 'vendeur_rapport' && a.p_token.startsWith('c')) ? { data: { ok: false } } : dr(fn, a);
r = await (await handle(req('digest'), d)).json();
assert(r.ok && r.sent === 1 && r.failed === 2, 'digest : 1 envoyé, email invalide et lien révoqué écartés : ' + JSON.stringify(r));
const m = d.sent[0]; assert(m.to[0] === 'vendeur@x.fr' && m.reply_to === 'o@x.fr' && !/[\r\n<>"]/.test(m.subject) && /^[^<>\r\n"]+ via Privency <noreply@privency\.fr>$/.test(m.from), 'en-têtes propres : ' + m.from + ' | ' + m.subject);
assert(/vendeur\.html#a{96}/.test(m.html) && /Ne plus recevoir ce point par e-mail/.test(m.html), 'lien du compte rendu et désinscription');
assert(/vendredi 02\/10, après-midi/.test(m.html) && /Diagnostic amiante/.test(m.html) && /Quartier et carte/.test(m.html) && /\+4/.test(m.html), 'contenu : jour + demi-journée, documents, rubrique, évolution : ' + m.html.replace(/<[^>]+>/g, ' ').slice(0, 500));
assert(!/constructor|native code|2026-08|<script|<i>/.test(m.html) && /Belle semaine &lt;i&gt;/.test(m.html), 'onglet forgé, vieille activité exclus ; HTML échappé');
assert(!/\d{1,2} h \d\d|\d\d:\d\d/.test(m.html.replace(/#a+/, '')), 'aucune heure exacte');
assert(d.rpcs.filter(x => x[0] === 'notif_digest_marque').length === 1, 'marqué une seule fois');
assert(!/Belle semaine/.test(buildDigest({ ...rap, note_at: '2026-09-01T00:00:00Z' }, tok, new Date('2026-10-05T06:00:00Z')).html), 'mot de l\'agent périmé non repris');
assert(/Aucune démarche notable/.test(buildDigest({ ...rap, activite: [] }, tok, new Date('2026-10-05T06:00:00Z')).html), 'semaine calme : message honnête');
assert.strictEqual(esc(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;'); assert.strictEqual(clean('a\r\nb<c>'), 'a b c');
{ const withName = buildDigest(rap, tok, new Date('2026-10-05T06:00:00Z'), 'Graziella <b>H</b>'), without = buildDigest(rap, tok, new Date('2026-10-05T06:00:00Z'));
  assert(/Bonjour Graziella b H b,/.test(withName.html) && !/<b>H/.test(withName.html), 'point du lundi personnalisé, caractères spéciaux retirés du nom');
  assert(!/Bonjour/.test(without.html), 'sans nom : version habituelle');
  d = deps({ digests: [{ token: tok, email: 'v@x.fr' }], rapport: rap }); const dr2 = d.db.rpc; d.db.rpc = async (fn, a) => fn === 'vendeur_proprio' ? { data: 'Graziella Horrelbecke' } : dr2(fn, a);
  await handle(req('digest'), d); assert(/Bonjour Graziella Horrelbecke,/.test(d.sent[0].html), 'handler : nom du propriétaire repris'); }
console.log('OK notifications');
// ── alertes « participation » : match du test crush, carnet de visite
{
  const { lienStats } = await import('../supabase/functions/notifications/format.js');
  const solo = buildAlerte({ type: 'crush', client_nom: 'Olivier Loison', bien: '42 Bd du Docteur Cathelin', bien_adresse: '42 Boulevard · Expertimo',
    detail: JSON.stringify({ v: 1, m: 'solo', s: 89, c: ['quotidien', 'interieur', 'travaux'], w: ['dpe'], a: 'AAAABBAA', n: 'Olivier' }) });
  const txt = solo.html.replace(/<[^>]+>/g, ' ');
  assert(/Olivier a envoyé son match : 89 %/.test(solo.subject), 'crush solo : sujet ' + solo.subject);
  assert(/fait seul/.test(txt) && /Tout à pied/.test(txt) && /De la lumière/.test(txt) && /Prêt à vivre/.test(txt) && /performance énergétique \(DPE\)/.test(txt) && /42 Bd du Docteur Cathelin/.test(txt), 'crush solo : critères forts et point à vérifier : ' + txt);
  assert(solo.html.includes(lienStats('Olivier Loison', '42 Boulevard · Expertimo').replace(/&/g, '&amp;')) && /acq=Olivier%20Loison/.test(solo.html) && /Message adapté/.test(txt) && /Notifications/.test(txt), 'crush solo : lien Mes stats + message adapté');
  const duo = buildAlerte({ type: 'crush', client_nom: 'Olivier Loison', bien: 'B', detail: JSON.stringify({ v: 1, m: 'duo', s: 97, s1: 96, s2: 98, acc: 7, c: ['weekend', 'quotidien', 'interieur'], w: [], a: 'BBABABBA', a2: 'BBAAABBA', n: 'Chacha & Chachou' }) });
  const dt = duo.html.replace(/<[^>]+>/g, ' ');
  assert(/Chacha &amp; Chachou ont fait le test à deux : 97 % en commun/.test(esc(duo.subject)) && /96 % et 98 % chacun/.test(dt) && /7 critères sur 8/.test(dt) && /Un vrai cocon/.test(dt) && /La voiture sans stress/.test(dt) && /Aucun point particulier/.test(dt), 'crush duo : ' + duo.subject + ' | ' + dt);
  const anon = buildAlerte({ type: 'crush', client_nom: 'inconnu', bien: 'B', bien_adresse: 'Adr', detail: JSON.stringify({ m: 'solo', s: 93, c: ['quotidien'], w: [], a: 'BBABABBB' }) });
  assert(/^💘 Un acquéreur a envoyé son match : 93 %$/.test(anon.subject) && /sans lien personnalisé/.test(anon.html) && !/Ouvrir Mes stats et le message adapté/.test(anon.html) && /acq=inconnu/.test(anon.html) && /La voiture sans stress/.test(anon.html), 'crush anonyme : ' + anon.subject);
  const pir = buildAlerte({ type: 'crush', client_nom: 'X', bien: 'B', detail: JSON.stringify({ m: 'solo', s: 'abc', c: ['constructor', '<b>x</b>'], w: ['__proto__', 'toString'], n: '<img src=x>\r\nBcc: a@b.c' }) });
  assert(!/<img|<b>x|constructor|__proto__|toString|\r|\n/.test(pir.subject + pir.html.replace(/<(p|ul|li|a|b|div|\/[a-z]+)( [^>]*)?>/g, '')) && /a envoyé son match$/.test(pir.subject), 'crush : données forgées ignorées ou échappées : ' + pir.subject);
  assert(buildAlerte({ type: 'crush', client_nom: 'Léa', bien: 'B', detail: '{pas du json' }).subject === '💘 Léa a envoyé son match', 'crush : JSON invalide toléré');
  const car = buildAlerte({ type: 'carnet', client_nom: 'Léa', bien: 'B', detail: JSON.stringify({ c: ['lumiere', 'volumes', 'inconnu_x'], ph: 3, n: 'Belle cuisine <b>ouverte</b>' }) });
  const ct = car.html.replace(/<[^>]+>/g, ' ');
  assert(/Léa a partagé son carnet de visite/.test(car.subject) && /lumière et volumes/.test(ct) && /Belle cuisine &lt;b&gt;ouverte/.test(car.html) && /3 photos prises/.test(ct) && !/inconnu_x/.test(ct), 'carnet : ' + car.subject + ' | ' + ct);
  for (const t of ['visite', 'critere', 'fiche_partagee', 'ouverture_partage', 'partage', 'mot_vendeur']) assert.strictEqual(buildAlerte({ type: t, client_nom: 'Léa', detail: '{}' }), null, 'aucune alerte pour ' + t);
  for (const m of [solo, duo, anon, car]) assert(!/partag(é|e) la fiche|lien partagé|ouverture via/i.test(m.subject + m.html), 'jamais de mention du partage de la fiche');
  // le handler transmet bien_adresse et marque l'alerte envoyée
  const dd = deps({ alertes: [{ agent_user_id: 'u1', agent_email: 'o@x.fr', cle: 'part:/fiches/a.html|olivier loison|1', type: 'crush', client_nom: 'Olivier Loison', bien: 'B', bien_adresse: 'Adr B', detail: '{"m":"solo","s":80}' }] });
  const rr2 = await (await handle(req('alertes'), dd)).json();
  assert(rr2.sent === 1 && /bien=Adr%20B/.test(dd.sent[0].html) && dd.rpcs.some(x => x[0] === 'notif_alerte_marque' && x[1].p_cle === 'part:/fiches/a.html|olivier loison|1'), 'handler : alerte crush envoyée et marquée');
}
console.log('OK alertes participation');
// ── résumé du lundi : ce que l'acheteur a fait lui-même
{
  const m = buildResume({ agent_prenom: 'O', chauds: [{ client: 'Léa', niveau: 'très chaud', bien: 'B', actions: 'a fait Crush ou crash ?, a partagé son carnet' }, { client: 'Tom', niveau: 'intéressé', bien: 'B' }],
    silences: [{ client: 'Pia', jours: 9, bien: 'B', actions: '<b>x</b>' }], visites: 3, visites_prec: 1 });
  assert(/Léa<\/b> — très chaud .*<br><span style="font-size:13px;">a fait Crush ou crash \?, a partagé son carnet<\/span>/.test(m.html), 'résumé : actions de l\'acheteur');
  assert(/Tom<\/b> — intéressé <span[^>]*>\(B\)<\/span><\/li>/.test(m.html), 'résumé : rien d\'ajouté sans action');
  assert(!/<b>x<\/b>/.test(m.html) && !/partag(é|e) la fiche|ouverture via/i.test(m.html), 'résumé : échappé, jamais le partage de la fiche');
}
console.log('OK résumé du lundi : participation');
