// Lot 4 : page vendeur.html (rendu, jeton invalide, lien révoqué, pas d'injection HTML).
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'vendeur.html'), 'utf8');
assert(!/innerHTML/.test(html), 'innerHTML interdit dans vendeur.html');
assert(/name="robots"[^>]*noindex/.test(html) && /referrer[^>]*no-referrer/.test(html), 'noindex / referrer');
const TOK = 'a'.repeat(96);
function run(hash, resp, status) {
  const calls = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://app.privency.fr/vendeur.html' + hash, virtualConsole: new VirtualConsole(), beforeParse(w) {
    w.fetch = async (u, o) => { calls.push({ u: String(u), b: o && o.body }); if (resp instanceof Error) throw resp; return { ok: (status || 200) < 400, status: status || 200, json: async () => resp }; };
  } });
  return new Promise(r => setTimeout(() => r({ d: dom.window.document, calls }), 60));
}
const rapport = {
  ok: true, bien: '<img src=x onerror=window.__xss=1>Maison Rue des Lilas',
  agent: { nom: '<b>Olivier</b>', tel: '06 12 34 56 78', email: 'o@x.fr', photo: '', reseau: 'Expertimo', rdv: 'javascript:alert(1)', couleur: '#123456', accent: '#c9a45c' },
  note: '<script>window.__xss=1</script>Bonne semaine', note_at: '2026-09-28T10:00:00Z', depuis: '2026-09-01T00:00:00Z', genere_le: '2026-09-30T08:00:00Z',
  totaux: { acquereurs: 5, anonymes: 2, visites: 14, minutes: 63, docs: 3, questions: 4, simulations: 1 },
  semaine: { visites: 6, visites_prec: 3, acquereurs: 3, acquereurs_prec: 2 },
  courbe: [1, 0, 2, 3, 1, 2, 3, 2].map((n, i) => ({ semaine: '2026-0' + (i + 1) + '-01', visites: n })),
  onglets: [{ onglet: 'financement', minutes: 20 }, { onglet: 'zzz_inconnu', minutes: 5 }],
  themes: [{ theme: 'Prix et négociation', n: 2 }], docs_top: [{ doc: 'Diagnostic DPE', n: 3 }],
  activite: [{ lettre: 'A', type: 'documents', at: '2026-09-29T16:12:00Z', detail: 'Diagnostic amiante', sec: 0 }, { lettre: 'B', type: 'rubrique', at: '2026-09-29T15:00:00Z', detail: 'quartier', sec: 130 }, { lettre: 'B', type: 'rubrique', at: '2026-09-29T14:00:00Z', detail: 'constructor', sec: 130 }, { lettre: 'A', type: 'question', at: '2026-09-28T10:00:00Z', detail: 'Prix et négociation', sec: 0 }],
  acquereurs: [{ lettre: 'A', niveau: 'tres', visites: 4, minutes: 22, derniere: '2026-09-29T10:00:00Z', onglets: ['financement'], docs: 2, questions: 1, simulation: true }]
};
(async () => {
  let r = await run('#' + TOK, rapport);
  assert(r.calls.length === 1 && /rpc\/vendeur_rapport/.test(r.calls[0].u) && JSON.parse(r.calls[0].b).p_token === TOK, 'appel RPC');
  const t = r.d.body.textContent; if(process.env.DBG) console.log(t.replace(/\s+/g,' ').slice(0,1500));
  assert(/Maison Rue des Lilas/i.test(t) && /Olivier/.test(t) && /Bonne semaine/.test(t), 'contenu affiché');
  assert(!r.d.defaultView.__xss && !r.d.querySelector('img[src="x"]') && !Array.from(r.d.querySelectorAll('b')).some(b => /Olivier/.test(b.textContent)), 'injection HTML');
  assert(!Array.from(r.d.querySelectorAll('a')).some(a => /^javascript:/i.test(a.getAttribute('href') || '')), 'lien javascript:');
  assert(r.d.querySelector('svg'), 'courbe');
  assert(!/Marie|@.*\.fr.*acheteur/.test(t.replace('o@x.fr', '')), 'anonymat');
  assert(!/^\s*$/.test(r.d.getElementById('report').className.includes('hidden') ? '' : 'x'), 'rapport visible');
  assert(/Acquéreur A a demandé des documents : Diagnostic amiante/.test(t) && /mardi 29\/09 à 18 h 12/.test(t), 'fil : documents + heure de Paris : ' + t.slice(t.indexOf('Activité'), t.indexOf('Activité') + 400));
  assert(/Acquéreur B a consulté « Quartier et carte » pendant 2 min/.test(t) && /Acquéreur A a posé une question sur le thème « Prix et négociation »/.test(t), 'fil : rubrique et question');
  assert(!/native code|constructor/.test(t), 'onglet forgé (constructor) non affiché');
  // jetons invalides : aucun appel réseau
  for (const h of ['', '#abc', '#' + 'g'.repeat(96), '#' + 'a'.repeat(200)]) {
    r = await run(h, rapport); assert(r.calls.length === 0, 'appel avec jeton invalide ' + h.slice(0, 8));
    assert(/n'est pas valide/.test(r.d.body.textContent) && r.d.getElementById('report').className.includes('hidden'), 'message jeton invalide');
  }
  r = await run('#' + TOK, { ok: false }); assert(/n'est plus actif/.test(r.d.body.textContent) && r.d.getElementById('report').className.includes('hidden'), 'lien révoqué');
  r = await run('#' + TOK, {}, 500); assert(/momentanément indisponible/.test(r.d.body.textContent), 'erreur serveur');
  r = await run('#' + TOK, new Error('net')); assert(/momentanément indisponible/.test(r.d.body.textContent), 'erreur réseau');
  // données vides
  r = await run('#' + TOK, Object.assign({}, rapport, { courbe: [], onglets: [], themes: [], docs_top: [], acquereurs: [], note: null, totaux: { acquereurs: 0, anonymes: 0, visites: 0, minutes: 0, docs: 0, questions: 0, simulations: 0 }, semaine: { visites: 0, visites_prec: 0, acquereurs: 0, acquereurs_prec: 0 } }));
  assert(!r.d.getElementById('report').className.includes('hidden'), 'rapport vide affiché');
  console.log('OK vendeur.html');
})().catch(e => { console.error(e); process.exit(1); });
