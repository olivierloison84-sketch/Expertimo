// Sélecteur de langue d'une fiche : ?lang=pt, mémorisation (localStorage « privency_lang »), repli FR,
// et régression sur une ancienne fiche bilingue FR/EN. Usage : node tests/lang-switch.check.js [fiche-test.html]
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const TEST = process.argv[2] || path.join(process.env.TEMP, 'live', 'TEST-fiche-ok.html');
const OLD = path.join(__dirname, '..', 'fiches', 'linas-91310-FINAL.html');   // fiche réelle bilingue FR/EN (lecture seule)
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) bad++; };
async function open(file, query, store) {
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true, url: 'https://espace.privency.fr/fiches/x.html' + (query || ''), beforeParse(w) {
    w.scrollTo = () => {}; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
    w.fetch = async () => ({ ok: false, json: async () => ({}), text: async () => '' });
    Object.keys(store || {}).forEach(k => w.localStorage.setItem(k, store[k]));
  } });
  await new Promise(r => setTimeout(r, 600));
  return dom;
}
const txt = (w, sel) => { const e = w.document.querySelector(sel); return e ? e.textContent.trim() : null; };
(async () => {
  // 1. ?lang=pt sur la fiche multilingue
  let dom = await open(TEST, '?lang=pt'); let w = dom.window;
  ok(w._currentLang === 'pt', '?lang=pt → langue courante = ' + w._currentLang);
  ok(w.localStorage.getItem('privency_lang') === 'pt', 'langue mémorisée dans privency_lang = ' + w.localStorage.getItem('privency_lang'));
  const h1 = txt(w, '.htitle span') || ''; ok(/Centro da cidade/.test(h1), 'quartier affiché en PT : « ' + h1 + ' »');
  ok(/Apartamento/.test(w.document.querySelector('.hsub').textContent), 'description en PT : « ' + w.document.querySelector('.hsub').textContent + ' »');
  const btns = [...w.document.querySelectorAll('[onclick*="applyLang"], .lang-btn, .lang-switch button')].map(b => b.textContent.trim()).filter(Boolean);
  ok(['FR', 'EN', 'PT', 'ES'].every(l => btns.some(b => b.toUpperCase().includes(l))), 'sélecteur de langue FR/EN/PT/ES visible : ' + btns.join(' '));
  dom.window.close();
  // 2. mémorisation : pas de paramètre, langue mémorisée = es
  dom = await open(TEST, '', { privency_lang: 'es' }); w = dom.window;
  ok(w._currentLang === 'es', 'sans paramètre, la langue mémorisée (es) est reprise : ' + w._currentLang);
  ok(/Centro de la ciudad/.test(txt(w, '.htitle span') || ''), 'quartier en ES : « ' + txt(w, '.htitle span') + ' »');
  dom.window.close();
  // 3. le paramètre l'emporte sur la mémorisation
  dom = await open(TEST, '?lang=en', { privency_lang: 'es' }); w = dom.window;
  ok(w._currentLang === 'en', '?lang=en prioritaire sur la langue mémorisée : ' + w._currentLang); dom.window.close();
  // 4. langue inconnue → français
  dom = await open(TEST, '?lang=xx'); w = dom.window;
  ok(w._currentLang === 'fr', '?lang=xx → repli français : ' + w._currentLang); dom.window.close();
  // 5. fiche sans version PT (panne de traduction) : le français reste affiché
  const ko = path.join(process.env.TEMP, 'live', 'TEST-fiche-pt-en-panne.html');
  if (fs.existsSync(ko)) { dom = await open(ko, '?lang=pt'); w = dom.window; ok(/Centre-ville/.test(txt(w, '.htitle span') || ''), 'PT indisponible → quartier resté en français : « ' + txt(w, '.htitle span') + ' »'); dom.window.close(); }
  // 6. régression : ancienne fiche FR/EN (bloc expertimo-data-en uniquement)
  dom = await open(OLD, ''); w = dom.window;
  ok(w._currentLang === 'fr', 'ancienne fiche : ouverture en FR');
  const fr = w.document.body.textContent.replace(/\s+/g, ' ').length;
  w.applyLang('en'); await new Promise(r => setTimeout(r, 200));
  ok(w._currentLang === 'en', 'ancienne fiche : bascule EN'); const en = txt(w, '.htitle span'); console.log('     quartier EN : « ' + en + ' »');
  w.applyLang('pt'); await new Promise(r => setTimeout(r, 200));
  ok(w.document.body.textContent.length > 1000, 'ancienne fiche : bascule PT sans plantage (repli FR/EN pour les contenus libres)');
  w.applyLang('fr'); ok(w._currentLang === 'fr', 'ancienne fiche : retour FR');
  dom.window.close();
  process.exit(bad ? 1 : 0);
})();
