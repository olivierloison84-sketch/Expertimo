// Lien de fiche : ville-type-code.html, aucune adresse, pas de « FINAL » ; les anciennes fiches gardent leur nom.
const fs = require('fs'), path = require('path'), assert = require('assert');
const s = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
const a = s.indexOf('function shortSlug(d)'), b = s.indexOf('var DIAG_RESULT_TEXTS');
assert(a > 0 && b > a, 'bloc introuvable');
const api = new Function('window', 'var _editingFiche=null,_lastGeneratedSlug=null;' + s.slice(a, b) +
  'return { shortSlug, ficheFilename, set(e,sl){_editingFiche=e;_lastGeneratedSlug=sl;} };')(require('crypto').webcrypto ? { crypto: require('crypto').webcrypto } : {});
const d = { adresse: '81 rue de Gravigny 91380 Chilly-Mazarin', type: 'maison' };
for (let i = 0; i < 50; i++) {
  const sl = api.shortSlug(d);
  assert(/^chilly-mazarin-maison-[a-z0-9]{6}$/.test(sl), sl);
  assert(!/gravigny|81|91380|final/i.test(sl.replace(/[a-z0-9]{6}$/, '')), sl);
}
assert.notStrictEqual(api.shortSlug(d), api.shortSlug(d));
assert(/^longjumeau-appartement-/.test(api.shortSlug({ adresse: '3 rue X 91160 Longjumeau', type: 'appartement' })));
api.set(null, 'longjumeau-maison-k7x2q9');
assert.strictEqual(api.ficheFilename(), 'longjumeau-maison-k7x2q9.html');
api.set({ filename: '81-rue-de-gravigny-91380-chilly-mazarin-79e4e4-FINAL.html' }, '81-rue-de-gravigny-91380-chilly-mazarin-79e4e4');
assert.strictEqual(api.ficheFilename(), '81-rue-de-gravigny-91380-chilly-mazarin-79e4e4-FINAL.html');
api.set({ filename: 'longjumeau-maison-k7x2q9.html' }, 'longjumeau-maison-k7x2q9');
assert.strictEqual(api.ficheFilename(), 'longjumeau-maison-k7x2q9.html');
console.log('slug-fiche OK');
