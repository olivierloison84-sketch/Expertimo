// Chatbot de la fiche (vraie API /api/chat, vraie API geoapify) sur la fiche TEST générée par live-e2e.js.
// Usage : node tests/live-chat.js [fichier-html]   → résultats dans $TEMP/live/chat-results.json
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { netFetch, OUT } = require('./live-e2e.js');
const file = process.argv[2] || path.join(OUT, 'TEST-fiche-ok.html');
const Q = {
  fr: { taxe: 'Quelle est la taxe foncière ?', annee: "Quelle est l'année de construction ?", chauf: "Quelle est l'année d'installation du chauffage ?",
        vendeur: 'Qui est le vendeur ?', tel: 'Quel est son numéro de téléphone ?', raison: 'Pourquoi vend-il ?', marge: 'Quelle est la marge de négociation ?', min: 'Quel est le prix minimum ?', achat: 'À quel prix a-t-il acheté ?' },
  pt: { taxe: 'Qual é o IMI (imposto sobre o imóvel)?', annee: 'Qual é o ano de construção?', chauf: 'Em que ano foi instalado o aquecimento?',
        vendeur: 'Quem é o vendedor?', tel: 'Qual é o número de telefone dele?', raison: 'Porque é que ele vende?', marge: 'Qual é a margem de negociação?', min: 'Qual é o preço mínimo?', achat: 'Por que preço é que ele comprou?' },
  es: { taxe: '¿Cuál es el impuesto de bienes inmuebles?', annee: '¿Cuál es el año de construcción?', chauf: '¿En qué año se instaló la calefacción?',
        vendeur: '¿Quién es el vendedor?', tel: '¿Cuál es su número de teléfono?', raison: '¿Por qué vende?', marge: '¿Cuál es el margen de negociación?', min: '¿Cuál es el precio mínimo?', achat: '¿A qué precio compró?' }
};
async function session(lang) {
  const html = fs.readFileSync(file, 'utf8');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true, url: 'https://espace.privency.fr/fiches/TEST-fiche.html?lang=' + lang, beforeParse(w) {
    w.scrollTo = () => {}; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
    w.fetch = (u, o) => netFetch(u, o);
  } });
  const w = dom.window; await new Promise(r => setTimeout(r, 1500));
  return { dom, w };
}
async function ask(w, q, viaButton) {
  const d = w.document, box = d.getElementById('ai-messages'), n = box.children.length;
  if (viaButton) { [...d.querySelectorAll('#ai-suggestions button')].find(b => b.textContent === q).click(); }
  else { d.getElementById('ai-input').value = q; w.sendAI(); }
  for (let i = 0; i < 90; i++) { await new Promise(r => setTimeout(r, 500)); const last = box.lastElementChild; if (box.children.length >= n + 2 && last.textContent !== '…') return last.textContent; }
  return '(pas de réponse)';
}
async function main() {
  const res = [];
  for (const lang of ['fr', 'pt', 'es']) {
    for (const batch of [['taxe', 'annee', 'chauf', 'SUGG'], ['vendeur', 'tel', 'raison', 'marge', 'min', 'achat']]) {
      const { dom, w } = await session(lang);
      w.toggleAI(); await new Promise(r => setTimeout(r, 300));
      if ((w._currentLang || '') !== lang) w.applyLang && w.applyLang(lang);
      for (const k of batch) {
        if (k === 'SUGG') {
          const sugg = [...w.document.querySelectorAll('#ai-suggestions button')].map(b => b.textContent);
          for (const s of sugg) res.push({ lang, q: '[suggérée] ' + s, a: await ask(w, s, true) });
        } else res.push({ lang, q: Q[lang][k], a: await ask(w, Q[lang][k]) });
      }
      dom.window.close();
    }
  }
  // changement de langue en cours de conversation : FR -> PT -> ES dans la même session
  const { dom, w } = await session('fr'); w.toggleAI(); await new Promise(r => setTimeout(r, 300));
  res.push({ lang: 'fr→', q: Q.fr.taxe, a: await ask(w, Q.fr.taxe) });
  w.applyLang('pt'); await new Promise(r => setTimeout(r, 300));
  res.push({ lang: '→pt', q: Q.pt.annee, a: await ask(w, Q.pt.annee) });
  w.applyLang('es'); await new Promise(r => setTimeout(r, 300));
  res.push({ lang: '→es', q: Q.es.chauf, a: await ask(w, Q.es.chauf), sugg: [...w.document.querySelectorAll('#ai-suggestions button')].map(b => b.textContent) });
  dom.window.close();
  fs.writeFileSync(path.join(OUT, 'chat-results.json'), JSON.stringify(res, null, 1));
  res.forEach(r => console.log('[' + r.lang + '] ' + r.q + '\n   → ' + r.a.replace(/\n/g, ' ') + '\n'));
}
main().catch(e => { console.error(e.stack); process.exit(1); });
