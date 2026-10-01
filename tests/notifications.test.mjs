// Lot 6 : Edge Function « notifications » (alertes agent + point hebdomadaire vendeur) — format et handler, sans réseau.
import assert from 'assert';
import { handle } from '../supabase/functions/notifications/handler.js';
import { buildAlerte, buildDigest, esc, clean } from '../supabase/functions/notifications/format.js';
const jwt = role => 'Bearer x.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.y';
const req = (mode, auth = jwt('service_role'), method = 'POST') => new Request('https://x/functions/v1/notifications', { method, headers: { authorization: auth, 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ mode }) : undefined });
function deps({ alertes = [], digests = [], rapport = null, resendOk = true } = {}) {
  const sent = [], rpcs = [];
  return { sent, rpcs, env: { RESEND_API_KEY: 'k' }, now: () => new Date('2026-10-05T06:00:00Z'),
    db: { rpc: async (fn, args) => { rpcs.push([fn, args]); if (fn === 'notif_alertes_dues') return { data: alertes }; if (fn === 'notif_digests_dues') return { data: digests }; if (fn === 'vendeur_rapport') return { data: rapport }; return { data: null }; } },
    fetch: async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: resendOk }; } };
}
// ── accès
let d = deps(); assert.strictEqual((await handle(req('alertes', jwt('anon')), d)).status, 403, 'clé anon refusée');
assert.strictEqual((await handle(req('alertes', ''), d)).status, 403, 'sans jeton refusé');
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
for (const type of ['offre', 'documents', 'simulation', 'retour_visite', 'reouverture']) assert(buildAlerte({ type, client_nom: 'Léa', bien: 'B' }).subject.includes('Léa') || type === 'offre', 'alerte ' + type);
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
console.log('OK notifications');
