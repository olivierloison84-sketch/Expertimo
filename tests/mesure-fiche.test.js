// Mesure des fiches : aucun outil tiers, événements fiables (1 par onglet, offre = envoi réel, crédit = simulation), avis Google jamais en dur.
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const files = ['index.html', 'index_en.html'].concat(fs.readdirSync(path.join(root, 'fiches')).filter(f => f.endsWith('.html')).map(f => 'fiches/' + f));
async function load(f, google) {
  const events = [], html = fs.readFileSync(path.join(root, f), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://espace.privency.fr/' + f + '?client=Test', virtualConsole: new VirtualConsole(), beforeParse(w) {
    w.scrollTo = () => {}; w.alert = () => {}; w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} }));
    if (google) w.PRIVENCY_GOOGLE = google;
    w.fetch = async (url, opt) => { if (String(url).includes('/rest/v1/fiche_views')) events.push(JSON.parse(opt.body).evenement); return { ok: true, status: 200, json: async () => ({}) }; };
  } });
  await new Promise(r => setTimeout(r, 50));
  return { w: dom.window, events, html };
}
(async () => {
  for (const f of files) {
    const { w, events, html } = await load(f);
    const d = w.document;
    assert(!/clarity/i.test(html) && !/googletagmanager/.test(html), f + ' : outil tiers présent');
    assert.strictEqual(events.filter(e => e === 'fiche_ouverte').length, 1, f + ' : fiche_ouverte attendue 1 fois');
    ['marche', 'quartier', 'documents'].forEach(id => w.showTab(id, null));
    w.showTab('marche', null);
    ['marche', 'quartier', 'documents'].forEach(id => assert.strictEqual(events.filter(e => e === 'onglet_' + id).length, id === 'marche' ? 2 : 1, f + ' : onglet_' + id));
    const before = events.length;
    ['offer-nom', 'offer-msg', 'bgt-revenu'].forEach(id => { const el = d.getElementById(id); el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
    d.querySelectorAll('.tab').forEach(t => t.dispatchEvent(new w.MouseEvent('click', { bubbles: true })));
    assert.strictEqual(events.length, before, f + ' : un clic dans la page ne doit rien enregistrer');
    assert(!events.includes('offre_soumise') && !events.includes('credit_simule'), f + ' : faux événements');
    try { w.calcBudget(); } catch (e) {}
    assert.strictEqual(events.filter(e => e === 'credit_simule').length, 1, f + ' : credit_simule');
    ['offer-nom', 'offer-email'].forEach(id => { const el = d.getElementById(id); if (el) el.value = ''; });
    try { w.submitOffer(); } catch (e) {}
    assert(!events.includes('offre_soumise'), f + ' : offre incomplète comptée');
    d.getElementById('offer-nom').value = 'Jean Dupont'; d.getElementById('offer-email').value = 'j@d.fr';
    try { w.submitOffer(); } catch (e) {}
    assert.strictEqual(events.filter(e => e === 'offre_soumise').length, 1, f + ' : offre_soumise');
    assert(!d.querySelector('.cons-stars.avis-ok'), f + ' : avis Google affichés sans données');
    assert(/\.cons-stars\{display:none\}/.test(html), f + ' : règle CSS de masquage');
  }
  const g = await load('index.html', { note: 4.86, nb: 37 });
  const el = g.w.document.querySelector('.cons-stars');
  assert(el.classList.contains('avis-ok') && /4,9\/5 · 37 avis Google/.test(el.textContent), 'avis réels : ' + el.textContent);
  const bad = await load('index.html', { note: 9, nb: 0 });
  assert(!bad.w.document.querySelector('.cons-stars.avis-ok'), 'données invalides : masqué');
  console.log('OK mesure-fiche : ' + files.length + ' fiches');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
