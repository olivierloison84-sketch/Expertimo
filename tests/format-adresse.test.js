// Mise en forme des adresses et libellés lisibles de Mes stats (app.html) + adresse du bilan vendeur.
const fs = require('fs'), path = require('path'), assert = require('assert');
function extract(file, startRe, endRe) {
  const s = fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), a = s.search(startRe), b = s.indexOf(endRe, a);
  assert(a >= 0 && b > a, 'bloc introuvable dans ' + file);
  return s.slice(a, b);
}
const code = extract('app.html', /\/\* Adresse affichée proprement/, 'function _clAddr(s) {');
const api = new Function(code + '; return { fmtAdresse, _evtLabel, _tabLabel };')();
const cas = [
  ['41 rue du four a pain 91160 longjumeau', '41 rue du Four à Pain 91160 Longjumeau'],
  ['110 avenue philippe auguste paris 75011', '110 avenue Philippe Auguste Paris 75011'],
  ['12 RUE DES LILAS, 91300 MASSY', '12 rue des Lilas, 91300 Massy'],
  ["5 rue de l'arpajonnais 91160 morsang sur orge", "5 rue de l'Arpajonnais 91160 Morsang-sur-Orge"],
  ['8 place de la republique 91700 sainte genevieve des bois', '8 place de la République 91700 Sainte-Geneviève-des-Bois'],
  ['3 rue du marechal foch 91380 chilly mazarin', '3 rue du Maréchal Foch 91380 Chilly-Mazarin'],
  ['', ''],
];
cas.forEach(([i, e]) => assert.strictEqual(api.fmtAdresse(i), e, i));
assert.strictEqual(api.fmtAdresse(null), '');
assert.strictEqual(api._evtLabel('fiche_ouverte'), 'Fiche ouverte');
assert.strictEqual(api._evtLabel('onglet_financement'), 'Onglet « Financement et budget »');
assert.strictEqual(api._evtLabel('onglet_budget'), 'Onglet « Financement et budget »');
assert.strictEqual(api._evtLabel('truc_inconnu'), 'Truc inconnu');
assert.strictEqual(typeof api._evtLabel('__proto__'), 'string', 'pas de fuite de prototype');
assert(!/_/.test(api._tabLabel('mon_onglet')), 'plus de underscore');
// Libellé de la liste Mes fiches : le suffixe de compte (6 caractères hexadécimaux) est retiré, comme dans app.html.
const src = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
assert(src.includes("replace(/\\s(?=[0-9a-f]*\\d)[0-9a-f]{6}$/, '')"), 'retrait du suffixe dans loadFiches');
const lib = l => api.fmtAdresse(String(l).replace(/-FINAL\.html$/, '').replace(/\.html$/, '').replace(/-/g, ' ').replace(/\s(?=[0-9a-f]*\d)[0-9a-f]{6}$/, ''));
assert.strictEqual(lib('12-rue-des-lilas-91300-massy-d58321-FINAL.html'), '12 rue des Lilas 91300 Massy');
assert.strictEqual(lib('12 rue des lilas 91300 massy d58321'), '12 rue des Lilas 91300 Massy');
assert.strictEqual(lib('34 rue helene boucher 91300 massy'), '34 rue Hélène Boucher 91300 Massy');
// La page vendeur utilise la même fonction.
const v = fs.readFileSync(path.join(__dirname, '..', 'vendeur.html'), 'utf8');
assert(/function fmtAdresse/.test(v) && /fmtAdresse\(r\.bien\)/.test(v), 'fmtAdresse dans vendeur.html');
console.log('OK format adresses et libellés');
