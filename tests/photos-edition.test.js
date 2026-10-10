// Photos d'une fiche existante : retirer / ajouter / réordonner des photos dans « Saisie du bien »
// doit se retrouver tel quel dans la fiche générée (et dans le HTML publié), sans retour des anciennes.
// Usage : cd tests && npm install && node photos-edition.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const TEMPLATE = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const OLD = [1, 2, 3, 4, 5].map(n => 'https://res.cloudinary.com/dif0ikaj1/image/upload/v1/ancienne-' + n + '.jpg');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let uploadCount = 0, uploadFails = false, uploadGate = null;
async function load() {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => console.log('[jsdom]', String(e.message).slice(0, 150)));
  const dom = await JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/app.html', beforeParse(w) {
    w.fetch = async (url) => {
      if (String(url).includes('api.cloudinary.com')) {
        if (uploadGate) await uploadGate;
        if (uploadFails) return { ok: false, status: 500, json: async () => ({ error: 'x' }) };
        const u = 'https://res.cloudinary.com/dif0ikaj1/image/upload/v2/nouvelle-' + (++uploadCount) + '.jpg';
        return { ok: true, status: 200, json: async () => ({ secure_url: u }) };
      }
      return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
    };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), upsert: async () => ({}), then: (f) => f({ data: [] }) };
    const client = { auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q };
    w.supabase = { createClient: () => client };
    w.eval(fs.readFileSync(path.join(root, 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} }));
    w.scrollTo = () => {};
  } });
  await sleep(300);
  return dom.window;
}

// Ouvre une fiche existante comme « Modifier » : données publiques (photo1..N) puis _rawState
// (photos de la grille + champs bien_photoN_url venant de fiche_private), dans le même ordre.
async function ouvrirFiche(w, urls) {
  const data = { adresse: '30 rue Gustave Legrand 91160 Longjumeau', prix: 235000, surface: 70 };
  urls.forEach((u, i) => { data['photo' + (i + 1)] = u; });
  const raw = { type: 'appart', adresse: data.adresse, prix_vente: '235000', surface_hab: '70', photos: urls.map(u => ({ dataUrl: u, caption: '', uploading: false })) };
  urls.forEach((u, i) => { raw['bien_photo' + (i + 1) + '_url'] = u; });
  w.injectBienData(data);
  w.restoreRawFormState(raw);
  await sleep(250);
}
async function ajouter(w, n) {
  const files = Array.from({ length: n }, (_, i) => new w.File(['x'], 'p' + i + '.jpg', { type: 'image/jpeg' }));
  w.addPhotos({ files, value: '' });
  await sleep(50);
}
const grille = w => JSON.parse(w.eval('JSON.stringify(_photos.map(function(p){return p.dataUrl;}))'));
const champs = w => [1, 2, 3, 4, 5].map(n => w.document.getElementById('bien_photo' + n + '_url').value);
function generer(w) {
  const d = w.collectBienData();
  const out = w.injectData(TEMPLATE, d, null, {});
  return { d, out, photos: [d.photo1, d.photo2, d.photo3, d.photo4, d.photo5].filter(Boolean) };
}
function verifier(w, attendues, label) {
  const { out, photos } = generer(w);
  assert.deepStrictEqual(photos, attendues.slice(0, 5), label + ' — photos de la fiche générée');
  assert.deepStrictEqual(champs(w), attendues.slice(0, 5).concat(['', '', '', '', '']).slice(0, 5), label + ' — champs URL');
  OLD.filter(u => !attendues.includes(u)).forEach(u => assert(!out.includes(u), label + ' — ancienne photo encore dans le HTML : ' + u));
  attendues.slice(0, 5).forEach(u => assert(out.includes(u), label + ' — photo absente du HTML : ' + u));
  const shown = Array.from(new JSDOM(out).window.document.querySelectorAll('.gallery img'))
    .filter(i => i.style.display !== 'none').map(i => i.getAttribute('src'));
  assert.deepStrictEqual(shown, attendues.slice(0, 5), label + ' — galerie publiée');
  console.log('OK — ' + label);
}

async function main() {
  let w;

  // 1. Cas demandé : fiche à 2 photos, on retire les 2, on en ajoute 1 → seule la nouvelle.
  w = await load(); uploadCount = 0;
  await ouvrirFiche(w, OLD.slice(0, 2));
  assert.deepStrictEqual(grille(w), OLD.slice(0, 2));
  w.removePhoto(0); w.removePhoto(0);
  await ajouter(w, 1);
  verifier(w, [grille(w)[0]], 'retirer 2 photos, en ajouter 1');
  assert(/nouvelle-1/.test(grille(w)[0]));

  // 2. Cas réel : 5 anciennes photos, on les retire toutes et on en met 1 autre.
  w = await load(); uploadCount = 0;
  await ouvrirFiche(w, OLD);
  for (let i = 0; i < 5; i++) w.removePhoto(0);
  await ajouter(w, 1);
  verifier(w, grille(w), '5 anciennes retirées, 1 nouvelle (cas Longjumeau)');
  assert.strictEqual(grille(w).length, 1);

  // 3. Retirer une photo au milieu décale les suivantes (pas de trou, pas de retour).
  w = await load();
  await ouvrirFiche(w, OLD);
  w.removePhoto(1);
  verifier(w, [OLD[0], OLD[2], OLD[3], OLD[4]], 'retrait au milieu');

  // 4. Supprimer toutes les photos → fiche sans photo.
  w = await load();
  await ouvrirFiche(w, OLD.slice(0, 3));
  w.removePhoto(2); w.removePhoto(0); w.removePhoto(0);
  verifier(w, [], 'suppression de toutes les photos');

  // 5. Ajouter plus de photos qu'avant (2 → 6) : les 5 premières, dans l'ordre.
  w = await load(); uploadCount = 0;
  await ouvrirFiche(w, OLD.slice(0, 2));
  await ajouter(w, 4);
  assert.strictEqual(grille(w).length, 6);
  verifier(w, grille(w), 'ajout de photos au-delà des anciennes');

  // 6. Changer l'ordre (via les URLs manuelles) : la photo principale suit.
  w = await load();
  await ouvrirFiche(w, OLD.slice(0, 3));
  const f = n => w.document.getElementById('bien_photo' + n + '_url');
  f(1).value = OLD[2]; f(1).dispatchEvent(new w.Event('change'));
  f(3).value = OLD[0]; f(3).dispatchEvent(new w.Event('change'));
  verifier(w, [OLD[2], OLD[1], OLD[0]], 'changement d\'ordre');
  assert.deepStrictEqual(grille(w), [OLD[2], OLD[1], OLD[0]], 'grille réordonnée');
  // Vider un champ manuel retire la photo correspondante.
  f(2).value = ''; f(2).dispatchEvent(new w.Event('change'));
  verifier(w, [OLD[2], OLD[0]], 'champ URL vidé');

  // 7. Ouvrir une 2e fiche sans photo après une 1re : rien de la 1re ne reste.
  w = await load();
  await ouvrirFiche(w, OLD.slice(0, 2));
  w.document.querySelectorAll('#page-2 input:not([type=radio]):not([type=checkbox])').forEach(el => { el.value = ''; });
  await ouvrirFiche(w, []);
  verifier(w, [], 'fiche suivante sans photo');

  // 8. Photo retirée pendant qu'une autre est en cours d'envoi + génération bloquée tant que l'envoi n'est pas fini.
  w = await load(); uploadCount = 0;
  await ouvrirFiche(w, OLD.slice(0, 2));
  let ouvrir; uploadGate = new Promise(r => { ouvrir = r; });
  await ajouter(w, 1);
  w.removePhoto(0);
  assert(w.eval('photosEnCours()'), 'envoi en cours détecté');
  w.document.getElementById('adresse').value = '30 rue Gustave Legrand';
  w.eval('window._bienData = null');
  w.continuerVersGeneration();
  assert.strictEqual(w.eval('window._bienData'), null, '« Continuer » doit attendre la fin de l\'envoi');
  ouvrir(); uploadGate = null; await sleep(50);
  verifier(w, [OLD[1], grille(w)[1]], 'retrait pendant un envoi');
  assert(/nouvelle-1/.test(grille(w)[1]));

  // 9. Échec d'envoi : pas de vignette vide, les champs restent cohérents.
  w = await load();
  await ouvrirFiche(w, OLD.slice(0, 1));
  uploadFails = true; await ajouter(w, 1); uploadFails = false;
  verifier(w, [OLD[0]], 'échec d\'envoi');
  assert.strictEqual(grille(w).length, 1);

  // 10. Brouillon (nouvelle fiche) : retirer puis restaurer ne fait pas revenir la photo.
  w = await load(); uploadCount = 0;
  await ajouter(w, 3);
  w.removePhoto(1);
  const draft = w.collectRawFormState();
  const w2 = await load();
  w2.restoreRawFormState(JSON.parse(JSON.stringify(draft)));
  await sleep(250);
  verifier(w2, grille(w), 'brouillon restauré après retrait');

  // ── Ordre des photos : clavier sur une vignette sélectionnée (le glisser à la souris et au doigt
  //    est testé dans un vrai navigateur : photos-glisser.e2e.js) ──
  const vignettes = w => Array.from(w.document.querySelectorAll('#photo_grid .photo-thumb'));
  const touche = (w, n, key) => {
    const v = vignettes(w)[n];
    assert(v.classList.contains('can-drag') && v.tabIndex === 0, 'vignette ' + (n + 1) + ' non déplaçable');
    v.focus();
    v.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  };
  const etiquettes = w => vignettes(w).map(v => (v.querySelector('.photo-rank') || {}).textContent);
  const focusSrc = w => { const a = w.document.activeElement; return a && a.querySelector && a.querySelector('img') && a.querySelector('img').getAttribute('src'); };

  // 11. Mettre la photo 3 en principale (Début).
  w = await load();
  await ouvrirFiche(w, OLD);
  assert.deepStrictEqual(etiquettes(w), ['★ Photo principale', '2', '3', '4', '5']);
  assert.strictEqual(w.document.querySelectorAll('#photo_grid .photo-order, #photo_grid .po-arrow').length, 0, 'plus de boutons ← → Principale');
  assert.strictEqual(w.document.querySelectorAll('#photo_grid .photo-grip').length, 5, 'poignée sur chaque photo');
  assert.notStrictEqual(w.document.getElementById('photo_order_hint').style.display, 'none', 'aide affichée');
  touche(w, 2, 'Home');
  verifier(w, [OLD[2], OLD[0], OLD[1], OLD[3], OLD[4]], 'photo 3 en principale (clavier)');
  assert(vignettes(w)[0].classList.contains('is-main') && vignettes(w)[0].querySelector('img').getAttribute('src') === OLD[2], 'vignette principale');
  assert.strictEqual(focusSrc(w), OLD[2], 'la sélection suit la photo déplacée');
  assert(/position 1, photo principale/.test(w.document.getElementById('photo_order_live').textContent), 'annonce lecteur d\'écran');
  const embed = JSON.parse(generer(w).out.match(/<script\b[^>]*\bid="expertimo-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.deepStrictEqual(embed._rawState.photos.map(p => p.dataUrl), [OLD[2], OLD[0], OLD[1], OLD[3], OLD[4]], 'ordre dans le bloc de données publié');

  // 12. Déplacer une photo vers l'avant puis vers l'arrière (flèches), et Fin.
  w = await load();
  await ouvrirFiche(w, OLD.slice(0, 4));
  touche(w, 3, 'ArrowLeft');
  verifier(w, [OLD[0], OLD[1], OLD[3], OLD[2]], 'déplacer avant (←)');
  touche(w, 0, 'ArrowRight');
  verifier(w, [OLD[1], OLD[0], OLD[3], OLD[2]], 'déplacer après (→)');
  touche(w, 0, 'ArrowLeft');   // déjà 1re : rien ne bouge
  touche(w, 3, 'ArrowDown');   // déjà dernière : rien ne bouge
  verifier(w, [OLD[1], OLD[0], OLD[3], OLD[2]], 'bords de la grille');
  touche(w, 0, 'End');
  verifier(w, [OLD[0], OLD[3], OLD[2], OLD[1]], 'en dernière place (Fin)');

  // 13. Réordonner puis retirer une photo : l'ancienne ne revient pas.
  w = await load();
  await ouvrirFiche(w, OLD.slice(0, 3));
  touche(w, 2, 'Home');
  w.removePhoto(1);
  verifier(w, [OLD[2], OLD[1]], 'réordonner puis retirer');

  // 14. Réordonner puis ajouter une photo : elle arrive à la fin.
  w = await load(); uploadCount = 0;
  await ouvrirFiche(w, OLD.slice(0, 2));
  touche(w, 1, 'ArrowUp');
  await ajouter(w, 1);
  verifier(w, [OLD[1], OLD[0], grille(w)[2]], 'réordonner puis ajouter');
  assert(/nouvelle-1/.test(grille(w)[2]));
  touche(w, 2, 'Home');
  verifier(w, [grille(w)[0], OLD[1], OLD[0]], 'nouvelle photo en principale');
  assert(/nouvelle-1/.test(grille(w)[0]));

  // 15. Une seule photo : badge seul, ni poignée ni déplacement. Zéro photo : grille vide.
  w = await load();
  await ouvrirFiche(w, OLD.slice(0, 1));
  assert.deepStrictEqual(etiquettes(w), ['★ Photo principale']);
  const seule = vignettes(w)[0];
  assert(!seule.classList.contains('can-drag') && !seule.hasAttribute('tabindex') && !seule.querySelector('.photo-grip'), 'une seule photo : rien à déplacer');
  assert.strictEqual(w.document.getElementById('photo_order_hint').style.display, 'none', 'pas d\'aide inutile');
  assert.strictEqual(w.movePhotoTo(0, 1), false);
  w.removePhoto(0);
  assert.strictEqual(vignettes(w).length, 0);
  assert.strictEqual(w.movePhotoTo(0, 0), false);
  verifier(w, [], 'zéro photo');

  // 16. Réordonner pendant un envoi : les photos ne se mélangent pas.
  w = await load(); uploadCount = 0;
  await ouvrirFiche(w, OLD.slice(0, 3));
  uploadGate = new Promise(r => { ouvrir = r; });
  await ajouter(w, 1);
  assert(!vignettes(w)[3].classList.contains('can-drag'), 'une photo en cours d\'envoi ne se déplace pas');
  touche(w, 0, 'End');   // « dernière » = dernière photo envoyée, avant celle en cours d'envoi
  touche(w, 1, 'Home');
  ouvrir(); uploadGate = null; await sleep(50);
  verifier(w, [OLD[2], OLD[1], OLD[0], grille(w)[3]], 'réordonner pendant un envoi');
  assert(/nouvelle-1/.test(grille(w)[3]));

  // 17. Rouvrir une fiche publiée après réordonnancement : l'ordre enregistré s'affiche tel quel.
  w = await load();
  await ouvrirFiche(w, OLD.slice(0, 4));
  touche(w, 3, 'Home');
  touche(w, 3, 'ArrowLeft');
  const attendu = [OLD[3], OLD[0], OLD[2], OLD[1]];
  verifier(w, attendu, 'ordre avant republication');
  const { d: dPub, out: outPub } = generer(w);
  const pub = JSON.parse(outPub.match(/<script\b[^>]*\bid="expertimo-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const priv = w.privateFicheData(dPub);
  w = await load();
  w.injectBienData(pub);
  w.restoreRawFormState(Object.assign({}, pub._rawState, priv._rawState));   // même fusion que modifierFiche
  await sleep(250);
  assert.deepStrictEqual(grille(w), attendu, 'grille à la réouverture');
  assert.deepStrictEqual(etiquettes(w), ['★ Photo principale', '2', '3', '4']);
  verifier(w, attendu, 'réouverture d\'une fiche publiée');
}
main().catch(e => { console.error('ÉCHEC :', e.stack || e.message); process.exit(1); });
