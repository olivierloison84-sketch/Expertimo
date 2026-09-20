// Affiche les chaînes PT ou ES de l'objet I18N de index.html à côté du français, pour relecture. Usage : node tests/dump-i18n.js pt|es
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const lang = process.argv[2] || 'pt';
const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), { runScripts: 'dangerously', virtualConsole: new VirtualConsole(), url: 'https://espace.privency.fr/x.html', beforeParse(w) {
  w.fetch = async () => ({ ok: false, json: async () => ({}), text: async () => '' }); w.scrollTo = () => {}; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
  w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }; } });
setTimeout(() => {
  const I = dom.window.eval('I18N');
  const flat = (o, p = '', out = {}) => { Object.keys(o || {}).forEach(k => { const v = o[k], key = p ? p + '.' + k : k; if (v && typeof v === 'object') flat(v, key, out); else out[key] = String(v); }); return out; };
  const fr = flat(I.fr), tg = flat(I[lang]);
  console.log('clés FR : ' + Object.keys(fr).length + ' | clés ' + lang.toUpperCase() + ' : ' + Object.keys(tg).length + ' | manquantes : ' + Object.keys(fr).filter(k => !(k in tg)).length);
  Object.keys(tg).forEach(k => console.log(k + ' | ' + (fr[k] || '').slice(0, 70) + ' || ' + tg[k].slice(0, 150)));
  dom.window.close();
}, 500);
