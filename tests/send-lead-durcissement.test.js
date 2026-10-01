// api/send-lead : plus de relais d'e-mails ouvert (destinataire = agent inscrit, plafonds, limite de débit).
const assert = require('assert'), path = require('path');
const handler = require(path.join(__dirname, '..', 'api', 'send-lead.js'));
process.env.RESEND_API_KEY = 'k'; process.env.FALLBACK_LEAD_EMAIL = 'fallback@x.fr';
let sent = null, lookups = 0;
handler.__test.setLookup(async e => { lookups++; return e === 'agent@x.fr'; });
global.fetch = async (u, o) => { sent = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({}) }; };
const run = (body, ip, origin) => new Promise(resolve => { sent = null; const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, b, sent }); }, end() { resolve({ code: this.code, sent }); } };
  handler({ method: 'POST', headers: { origin: origin || 'https://espace.privency.fr', 'x-forwarded-for': ip || '1.1.1.1' }, body }, res); });
(async () => {
  const base = { nom: 'Marie D', email: 'm@d.fr', bien: '5 rue X', type: 'offre', montant: '250000' };
  let r = await run(Object.assign({ agentEmail: 'agent@x.fr' }, base));
  assert(r.code === 200 && r.sent.to[0] === 'agent@x.fr', 'agent inscrit : livré à l\'agent');
  r = await run(Object.assign({ agentEmail: 'victime@gmail.com' }, base));
  assert(r.code === 200 && r.sent.to[0] === 'fallback@x.fr', 'adresse inconnue : jamais livrée à un tiers, boîte de secours : ' + JSON.stringify(r.sent && r.sent.to));
  r = await run(Object.assign({ agentEmail: 'AGENT@x.fr' }, base)); assert.strictEqual(r.sent.to[0], 'AGENT@x.fr', 'casse ignorée pour la vérification');
  process.env.LEAD_EXTRA_RECIPIENTS = 'Ancien@Cabinet.fr, autre@x.fr'; r = await run(Object.assign({ agentEmail: 'ancien@cabinet.fr' }, base)); assert.strictEqual(r.sent.to[0], 'ancien@cabinet.fr', 'liste d\'adresses autorisées en plus (variable Vercel)'); delete process.env.LEAD_EXTRA_RECIPIENTS;
  const n = lookups; await run(Object.assign({ agentEmail: 'agent@x.fr' }, base)); assert.strictEqual(lookups, n, 'vérification mise en cache');
  r = await run(Object.assign({ agentEmail: 'agent@x.fr' }, base, { email: 'pas-un-email' })); assert.strictEqual(r.code, 400, 'e-mail du visiteur invalide refusé');
  r = await run(Object.assign({ agentEmail: 'agent@x.fr' }, base, { bien: 'x\r\nBcc: evil@x.fr' + 'y'.repeat(500), montant: '1\r\n2' }));
  assert(!/[\r\n]/.test(r.sent.subject) && r.sent.subject.length < 300, 'objet sans saut de ligne et plafonné : ' + r.sent.subject.length);
  r = await run(Object.assign({ agentEmail: 'agent@x.fr', type: 'documents_liste', documents: ['DPE'], message: 'm'.repeat(5000) }, { nom: 'A', email: 'a@b.fr', bien: 'x' })); assert(r.sent.html.length < 4000, 'message plafonné');
  { const k = global.fetch; handler.__test.setLookup(async () => { throw new Error('base indisponible'); });
    r = await run(Object.assign({ agentEmail: 'agent@x.fr' }, base)); assert(r.code === 200 && r.sent.to[0] === 'fallback@x.fr', 'base indisponible : boîte de secours, le lead n\'est pas perdu'); global.fetch = k; }
  handler.__test.setLookup(async e => e === 'agent@x.fr');
  r = await run(base, '2.2.2.2', 'https://evil.example'); assert.strictEqual(r.code, 403, 'origine refusée');
  let last; for (let i = 0; i < 35; i++) last = await run(Object.assign({ agentEmail: 'agent@x.fr' }, base), '3.3.3.3'); assert.strictEqual(last.code, 429, 'limite par IP');
  handler.__test.setLookup(async e => e === 'agent@x.fr'); let c429 = 0;
  for (let i = 0; i < 20; i++) { const x = await run(Object.assign({ agentEmail: 'agent@x.fr' }, base), '10.0.0.' + i); if (x.code === 429) c429++; }
  assert(c429 >= 4, 'limite par destinataire (15 / 10 min) même en changeant d\'IP : ' + c429);
  console.log('OK send-lead durcissement'); process.exit(0);
})().catch(e => { console.error('ÉCHEC', e); process.exit(1); });
