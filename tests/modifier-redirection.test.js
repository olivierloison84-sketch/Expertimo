// « Modifier » sur une fiche devenue page de redirection (pv-redirect) : on suit la redirection,
// et le garde-fou refuse d'ouvrir un formulaire vide. Helpers extraits d'app.html.
const fs = require('fs'), path = require('path'), assert = require('assert');
const s = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
const a = s.indexOf('async function chargerHtmlFiche'), b = s.indexOf('async function modifierFiche');
assert(a > 0 && b > a, 'bloc introuvable');
const api = new Function(s.slice(a, b) + 'return { chargerHtmlFiche, ficheExtraiteVide };')();

const REDIR = fs.readFileSync(path.join(__dirname, '..', 'fiches', '50-avenue-saint-marc-massy-91300-FINAL.html'), 'utf8');
const REELLE = '<html><head><title>12 rue X · Privency</title></head><body><script id="expertimo-data" type="application/json">{"adresse":"12 rue X 91300 Massy","prix":250000,"surface":60}</script></body></html>';
const URL0 = 'https://raw.githubusercontent.com/o/r/main/fiches/50-avenue-saint-marc-massy-91300-FINAL.html?t=1';
const rep = (ok, t) => ({ ok, text: async () => t });

(async () => {
  // page normale : inchangée, pas de 2e fetch
  let n = 0;
  let r = await api.chargerHtmlFiche(URL0, REELLE, async () => { n++; return rep(true, ''); });
  assert.strictEqual(r.html, REELLE); assert.strictEqual(r.filenameReel, null); assert.strictEqual(n, 0);

  // redirection → vraie fiche, même dossier, dernier segment remplacé
  const urls = [];
  r = await api.chargerHtmlFiche(URL0, REDIR, async u => { urls.push(u); return rep(true, REELLE); });
  assert.strictEqual(r.filenameReel, 'massy-appartement-1ck2xo.html');
  assert(urls[0].startsWith('https://raw.githubusercontent.com/o/r/main/fiches/massy-appartement-1ck2xo.html?t='), urls[0]);
  const data = JSON.parse(r.html.match(/id="expertimo-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.strictEqual(data.adresse, '12 rue X 91300 Massy');
  assert(!api.ficheExtraiteVide(data));

  // 2e fetch en échec, ou encore une redirection, ou cible invalide → null (pas de formulaire)
  assert.strictEqual(await api.chargerHtmlFiche(URL0, REDIR, async () => rep(false, '')), null);
  assert.strictEqual(await api.chargerHtmlFiche(URL0, REDIR, async () => rep(true, REDIR)), null);
  assert.strictEqual(await api.chargerHtmlFiche(URL0, REDIR.replace('massy-appartement-1ck2xo.html', '../x.html'), async () => rep(true, REELLE)), null);

  // garde-fou
  assert(api.ficheExtraiteVide({ adresse: 'Redirection…', prix: 0, surface: 0 }));
  assert(api.ficheExtraiteVide({ adresse: '', prix: 0, surface: 0 }));
  assert(!api.ficheExtraiteVide({ adresse: 'Redirection…', prix: 100000, surface: 0 }));
  assert(!api.ficheExtraiteVide({ adresse: '3 rue Y', prix: 0, surface: 0 }));
  console.log('modifier-redirection OK');
})().catch(e => { console.error(e); process.exit(1); });
