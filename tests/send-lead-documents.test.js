// api/send-lead : liste de documents souhaités (échappement, plafonds, sujet), sans régression sur offre / demande simple.
const assert = require('assert'), path = require('path');
const handler = require(path.join(__dirname, '..', 'api', 'send-lead.js'));
process.env.RESEND_API_KEY = 'k'; process.env.FALLBACK_LEAD_EMAIL = 'fallback@x.fr';
require(path.join(__dirname, '..', 'api', 'send-lead.js')).__test.setLookup(async e => e === 'agent@x.fr');
let sent = null; global.fetch = async (u, o) => { sent = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({}) }; };
const run = body => new Promise(resolve => { sent = null; require(path.join(__dirname, '..', 'api', 'send-lead.js')).__test.setLookup(async e => e === 'agent@x.fr'); const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b, sent }); }, end() { resolve({ code: this.code, sent }); } };
  handler({ method: 'POST', headers: { origin: 'https://espace.privency.fr' }, body }, res); });
(async () => {
  const base = { nom: 'Marie D', email: 'm@d.fr', bien: '5 rue X', agentEmail: 'agent@x.fr' };
  let r = await run(Object.assign({ type: 'documents_liste', documents: ['PV d\'AG', 'DPE', 'DPE', '<img src=x onerror=alert(1)>', ' ', 'x'.repeat(300)], message: 'Urgent <b>merci</b>' }, base));
  assert.strictEqual(r.code, 200); assert(/Documents souhaités \(3\)/.test(r.sent.subject) || /Documents souhaités \(4\)/.test(r.sent.subject), r.sent.subject);
  assert(!/<img/.test(r.sent.html) && /&lt;img/.test(r.sent.html), 'échappement des libellés');
  assert(!/<b>merci/.test(r.sent.html) && /&lt;b&gt;merci/.test(r.sent.html), 'échappement du message');
  assert((r.sent.html.match(/<li>/g) || []).length === 4, 'dédoublonnage + vides retirés');
  assert(r.sent.to[0] === 'agent@x.fr' && r.sent.reply_to === 'm@d.fr');
  r = await run(Object.assign({ type: 'documents_liste', documents: [] }, base)); assert.strictEqual(r.code, 400, 'liste vide refusée');
  r = await run(Object.assign({ type: 'documents_liste', documents: 'DPE' }, base)); assert.strictEqual(r.code, 400, 'non-tableau refusé');
  r = await run(Object.assign({ type: 'documents_liste', documents: Array.from({ length: 100 }, (_, i) => 'D' + i) }, base)); assert((r.sent.html.match(/<li>/g) || []).length === 40, '40 max');
  r = await run(Object.assign({ type: 'documents_liste', documents: ['DPE'] }, base, { nom: 'Jean\r\nBcc: evil@x.fr' })); assert(!/[\r\n]/.test(r.sent.subject), 'pas de saut de ligne dans le sujet');
  r = await run(Object.assign({ type: 'documents' }, base)); assert(r.code === 200 && r.sent === null, 'ouverture simple de l\'onglet : aucun e-mail (seule la liste est envoyée)');
  r = await run(Object.assign({ type: 'offre', montant: '250000' }, base)); assert(/Nouvelle offre/.test(r.sent.subject), 'offre inchangée');
  console.log('OK send-lead documents'); process.exit(0);
})().catch(e => { console.error('ÉCHEC', e); process.exit(1); });
