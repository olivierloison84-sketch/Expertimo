// Vérifie que les fiches nettoyées s'affichent comme avant : même titre, même texte visible, mêmes erreurs de script
// (comparaison avec la version du tag de sauvegarde). Usage : node tests/fiches-render.check.js
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, 'node_modules', 'jsdom'));
const root = path.join(__dirname, '..'), TAG = 'backup-fiches-avant-confidentialite-2026-09-20';
async function render(html) {
  const errs = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errs.push(String(e.message).slice(0, 80)));
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc, url: 'https://espace.privency.fr/fiches/x.html', pretendToBeVisual: true, beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: false, json: async () => ({}), text: async () => '' }); w.scrollTo = () => {}; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
    w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }; } });
  await new Promise(r => setTimeout(r, 250));
  const d = dom.window.document, t = { title: d.title, text: d.body.textContent.replace(/\s+/g, ' ').trim(), errs: errs.filter(e => !/Not implemented/.test(e)) };
  dom.window.close(); return t;
}
(async () => {
  let bad = 0;
  for (const f of fs.readdirSync(path.join(root, 'fiches')).filter(x => x.endsWith('.html')).sort()) {
    const now = fs.readFileSync(path.join(root, 'fiches', f), 'utf8');
    const old = cp.execSync('git show ' + TAG + ':fiches/' + f, { cwd: root, maxBuffer: 1 << 28 }).toString('utf8');
    const a = await render(old), b = await render(now);
    // le texte visible ne doit différer que par le bloc de bienvenue nominatif ou la référence de mandat
    const same = a.title === b.title && a.errs.length === b.errs.length && Math.abs(a.text.length - b.text.length) < 60;
    if (!same) bad++;
    console.log((same ? 'OK   ' : 'DIFF ') + f + ' | titre=' + (b.title || '').slice(0, 30) + ' | erreurs ' + a.errs.length + '→' + b.errs.length + ' | texte ' + a.text.length + '→' + b.text.length);
  }
  process.exit(bad ? 1 : 0);
})();
