// Glisser-déposer des photos de « Saisie du bien » dans un vrai navigateur (Chromium via Playwright) :
// souris sur ordinateur, appui long + glisser au doigt sur téléphone, défilement de la page préservé.
// Usage : node tests/photos-glisser.e2e.js  (Playwright installé ; PW_CHROMIUM=/chemin/chromium si besoin)
// Captures dans $SHOTS_DIR si défini.
const fs = require('fs'), path = require('path'), assert = require('assert');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); }
const root = path.join(__dirname, '..');
const TEMPLATE = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const SHOTS = process.env.SHOTS_DIR;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const img = n => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(' + (n * 67) + ',45%,58%)"/><text x="200" y="185" font-size="110" font-family="Arial" text-anchor="middle" fill="white">' + n + '</text></svg>');

// Page de test : la vraie app.html, carte « Photos du bien » isolée entre deux blocs hauts (pour défiler).
async function ouvrir(ctx, nb, opts = {}) {
  const page = await ctx.newPage();
  // Les erreurs du démarrage hors connexion (pas de session Supabase) ne concernent pas ce test ;
  // toute erreur JS après la mise en place, si.
  const erreurs = []; let suivi = false;
  page.on('pageerror', e => { if (suivi) erreurs.push(e.message); });
  page.erreurs = erreurs;
  await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await page.goto('file://' + path.join(root, 'app.html'));
  await page.waitForTimeout(500);
  await page.evaluate(({ urls, uploading }) => {
    const ag = document.getElementById('auth-guard-hide'); if (ag) ag.remove();
    const card = document.getElementById('photo_grid').closest('.card');
    const box = document.createElement('div'); box.id = 'box'; box.style.cssText = 'padding:16px;max-width:900px;margin:0 auto;background:#fff';
    const haut = document.createElement('div'); haut.style.height = '700px'; haut.textContent = 'haut de page';
    const bas = document.createElement('div'); bas.style.height = '1400px'; bas.id = 'bas';
    box.append(haut, card, bas);
    document.body.innerHTML = ''; document.body.appendChild(box);
    document.body.style.cssText = 'display:block;overflow:auto;background:#fff;margin:0';
    _photos = urls.map(u => ({ dataUrl: u, caption: '', uploading: false }));
    if (uploading) _photos.push({ dataUrl: '', caption: '', uploading: true });
    syncPhotoUrlFields(); renderPhotos();
    // Grille un peu sous le haut de l'écran : hors de la zone de défilement automatique (70 px).
    document.getElementById('photo_grid').scrollIntoView({ block: 'start' });
    window.scrollBy(0, -110);
  }, { urls: Array.from({ length: nb }, (_, i) => img(i + 1)), uploading: !!opts.uploading });
  await page.waitForTimeout(100);
  suivi = true;
  return page;
}
// Ordre courant, lu dans la grille ET dans les champs cachés bien_photoN_url (doivent concorder).
async function ordre(page) {
  if (page.erreurs.length) throw new Error('erreur JS : ' + page.erreurs.join(' | '));
  return page.evaluate(() => {
    const num = u => decodeURIComponent(u).match(/>(\d+)</)[1];
    const g = photoUrls().map(num).join('');
    const f = ['bien_photo1_url','bien_photo2_url','bien_photo3_url','bien_photo4_url','bien_photo5_url']
      .map(id => document.getElementById(id).value).filter(Boolean).map(num).join('');
    if (g.slice(0, 5) !== f) throw new Error('champs cachés désynchronisés : grille ' + g + ' / champs ' + f);
    const badge = document.querySelector('#photo_grid .photo-thumb.is-main .photo-rank');
    const imgMain = document.querySelector('#photo_grid .photo-thumb.is-main img');
    if (g && (!badge || badge.textContent !== '★ Photo principale' || num(imgMain.getAttribute('src')) !== g[0])) throw new Error('badge principal mal placé');
    return g;
  });
}
const centre = async (page, n) => { const b = await page.locator('#photo_grid .photo-thumb').nth(n).locator('img').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
const etat = page => page.evaluate(() => ({ drag: !!document.querySelector('.photo-thumb.is-dragging'), slot: !!document.querySelector('#photo_grid .photo-slot'), scrollY: window.scrollY }));

async function souris(page, from, to, opts = {}) {
  const a = await centre(page, from);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x + (to.x - a.x) * i / steps, a.y + (to.y - a.y) * i / steps); await page.waitForTimeout(16); }
  await page.waitForTimeout(260);   // fin des animations
  if (opts.pendant) await opts.pendant();
  if (opts.escape) await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(50);
}

// Toucher réel (CDP) : appui, maintien éventuel, glisser par étapes, relâcher.
async function doigt(page, cdp, a, b, { maintien = 0, steps = 14, pause = 16, pendant } = {}) {
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(a.x, a.y) });
  if (maintien) await page.waitForTimeout(maintien);
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps) });
    await page.waitForTimeout(pause);
  }
  await page.waitForTimeout(260);
  if (pendant) await pendant();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await pw.chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ok = m => console.log('OK — ' + m);

  // ══ Ordinateur (souris) ══
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await ouvrir(desk, 5);
  assert.strictEqual(await ordre(page), '12345');
  assert.strictEqual(await page.locator('#photo_grid .photo-thumb').first().locator('img').evaluate(e => getComputedStyle(e).cursor), 'grab', 'curseur main');
  assert.strictEqual(await page.locator('#photo_grid .photo-grip').count(), 5, 'poignée');
  assert.strictEqual(await page.locator('#photo_grid button').count(), 5, 'seul bouton restant : ✕');

  // Photo 4 → 1re place, avec contrôle pendant le glisser (copie qui suit, repère, badge en direct).
  let p1 = await centre(page, 0);
  await souris(page, 3, { x: p1.b.x + 10, y: p1.y }, { pendant: async () => {
    const e = await etat(page);
    assert(e.drag && e.slot, 'copie flottante + repère pendant le glisser');
    const g = await page.locator('.photo-thumb.is-dragging .photo-rank').textContent();
    assert.strictEqual(g, '★ Photo principale', 'le badge suit la photo en 1re position pendant le glisser');
    assert.strictEqual(await page.locator('#photo_grid .photo-slot + .photo-thumb .photo-rank').textContent(), '2', 'les autres se décalent');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'ordi-pendant.png'), clip: { x: 0, y: 0, width: 1280, height: 520 } });
  } });
  assert.strictEqual(await ordre(page), '41235'); ok('souris : photo 4 déposée en 1re place');
  assert(!(await etat(page)).drag && !(await etat(page)).slot, 'plus de copie ni de repère après dépôt');

  // 1re → dernière place.
  let p5 = await centre(page, 4);
  await souris(page, 0, { x: p5.b.x + p5.b.width - 8, y: p5.y });
  assert.strictEqual(await ordre(page), '12354'); ok('souris : 1re photo déposée en dernière place');

  // Au milieu : photo 1 sur la moitié gauche de la 3e vignette → entre la 2e et la 3e.
  let p3 = await centre(page, 2);
  await souris(page, 0, { x: p3.b.x + 12, y: p3.y });
  assert.strictEqual(await ordre(page), '21354'); ok('souris : photo déposée au milieu');

  // Annuler : relâcher hors de la grille, puis Échap.
  await souris(page, 1, { x: 640, y: 880 }, { pendant: async () => {
    assert.strictEqual(await page.locator('.photo-thumb.is-dragging .photo-rank').textContent(), '2', 'hors grille : la photo revient à sa place');
  } });
  assert.strictEqual(await ordre(page), '21354'); ok('souris : relâcher hors de la grille annule');
  p1 = await centre(page, 0);
  await souris(page, 3, { x: p1.b.x + 10, y: p1.y }, { escape: true });
  assert.strictEqual(await ordre(page), '21354'); ok('souris : Échap annule');

  // Simple clic : rien ne bouge.
  const c = await centre(page, 2); await page.mouse.click(c.x, c.y); await page.waitForTimeout(50);
  assert.strictEqual(await ordre(page), '21354'); assert(!(await etat(page)).drag); ok('souris : un clic ne déplace rien');

  // Le résultat va jusqu'à la fiche générée : photo1..5 et galerie publiée dans l'ordre.
  const gen = await page.evaluate(tmpl => {
    document.body.insertAdjacentHTML('beforeend', '<input id="adresse" value="30 rue Gustave Legrand">');
    // Hors connexion, auth-client.js n'est pas chargé : profil agent vide.
    if (!window.PrivencyAuth) window.PrivencyAuth = { lsGet: () => null, lsSet() {}, lsRemove() {} };
    const d = collectBienData(), out = injectData(tmpl, d, null, {});
    const doc = new DOMParser().parseFromString(out, 'text/html');
    const num = u => decodeURIComponent(u).match(/>(\d+)</)[1];
    return { d: [d.photo1, d.photo2, d.photo3, d.photo4, d.photo5].map(num).join(''),
      galerie: Array.from(doc.querySelectorAll('.gallery img')).filter(i => i.style.display !== 'none').map(i => num(i.getAttribute('src'))).join('') };
  }, TEMPLATE);
  assert.deepStrictEqual(gen, { d: '21354', galerie: '21354' }); ok('fiche générée et galerie publiée dans le nouvel ordre');
  await page.close();

  // Pendant un envoi : la photo en cours d'envoi ne bouge pas et reste après les autres.
  page = await ouvrir(desk, 3, { uploading: true });
  assert.strictEqual(await page.locator('#photo_grid .photo-thumb').nth(3).evaluate(e => e.classList.contains('can-drag')), false);
  const up = await centre(page, 2).catch(() => null);
  const enCours = await page.locator('#photo_grid .photo-thumb').nth(3).boundingBox();
  await souris(page, 0, { x: enCours.x + enCours.width - 5, y: enCours.y + enCours.height / 2 });
  assert.strictEqual(await ordre(page), '231');
  await page.evaluate(n => { const e = _photos.find(p => p.uploading); e.dataUrl = n; e.uploading = false; syncPhotoUrlFields(); renderPhotos(); }, img(9));
  assert.strictEqual(await ordre(page), '2319'); ok('souris : déplacer pendant un envoi ne mélange rien');
  // Envoi qui se termine EN PLEIN glisser : la grille n'est pas reconstruite sous le doigt, tout est appliqué au dépôt.
  await page.evaluate(() => { _photos.push({ dataUrl: '', caption: '', uploading: true }); renderPhotos(); });
  p1 = await centre(page, 0);
  await souris(page, 3, { x: p1.b.x + 10, y: p1.y }, { pendant: () => page.evaluate(n => { const e = _photos.find(p => p.uploading); e.dataUrl = n; e.uploading = false; syncPhotoUrlFields(); renderPhotos(); }, img(8)) });
  assert.strictEqual(await ordre(page), '92318'); ok('souris : envoi terminé pendant le glisser');
  await page.close();

  // Une seule photo : rien à glisser.
  page = await ouvrir(desk, 1);
  assert.strictEqual(await page.locator('#photo_grid .can-drag, #photo_grid .photo-grip').count(), 0);
  assert.strictEqual(await page.locator('#photo_order_hint').isVisible(), false);
  const s1 = await centre(page, 0);
  await page.mouse.move(s1.x, s1.y); await page.mouse.down(); await page.mouse.move(s1.x + 200, s1.y + 50, { steps: 8 });
  assert(!(await etat(page)).drag); await page.mouse.up();
  assert.strictEqual(await ordre(page), '1'); ok('une seule photo : pas de déplacement ni de poignée');
  await page.close();

  // Clavier : Tab jusqu'à une vignette, flèches.
  page = await ouvrir(desk, 3);
  await page.locator('#photo_grid .photo-thumb').nth(2).focus();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  assert.strictEqual(await ordre(page), '312');
  assert.strictEqual(await page.evaluate(() => document.activeElement.querySelector('.photo-rank').textContent), '★ Photo principale');
  ok('clavier : flèches sur la vignette sélectionnée');
  await page.close();
  await desk.close();

  // ══ Téléphone (doigt) ══
  const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page = await ouvrir(tel, 4);
  const cdp = await page.context().newCDPSession(page);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'tel-repos.png') });

  // Défilement vertical normal en touchant une photo : la page défile, rien ne bouge.
  let avant = (await etat(page)).scrollY;
  let a = await centre(page, 1);
  await doigt(page, cdp, a, { x: a.x, y: a.y - 300 }, { steps: 10, pause: 10 });
  let apres = await etat(page);
  assert(apres.scrollY > avant + 100, 'la page doit défiler (' + avant + ' → ' + apres.scrollY + ')');
  assert(!apres.drag); assert.strictEqual(await ordre(page), '1234'); ok('doigt : glisser vertical rapide = défilement de la page');
  await page.evaluate(() => { document.getElementById('photo_grid').scrollIntoView({ block: 'start' }); window.scrollBy(0, -110); });
  await page.waitForTimeout(100);

  // Simple toucher : rien.
  a = await centre(page, 1);
  await doigt(page, cdp, a, a, { steps: 0 });
  assert(!(await etat(page)).drag); assert.strictEqual(await ordre(page), '1234'); ok('doigt : un simple toucher ne déplace rien');

  // Appui long puis relâcher sans bouger : ordre inchangé.
  await doigt(page, cdp, a, a, { maintien: 450, steps: 0 });
  assert.strictEqual(await ordre(page), '1234'); ok('doigt : appui long sans glisser ne change rien');

  // Appui long (≈ 300 ms) puis glisser la photo 3 tout en haut.
  avant = (await etat(page)).scrollY;
  a = await centre(page, 2); p1 = await centre(page, 0);
  await doigt(page, cdp, a, { x: p1.x, y: p1.b.y + 10 }, { maintien: 450, pendant: async () => {
    const e = await etat(page); assert(e.drag && e.slot, 'photo soulevée');
    assert.strictEqual(await page.locator('.photo-thumb.is-dragging .photo-rank').textContent(), '★ Photo principale');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'tel-pendant.png') });
  } });
  assert.strictEqual(await ordre(page), '3124'); ok('doigt : appui long + glisser vers la 1re place');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'tel-apres.png') });

  // Appui long puis glisser vers le bas jusqu'à la dernière place.
  a = await centre(page, 0); const d4 = await centre(page, 3);
  await doigt(page, cdp, a, { x: d4.x, y: d4.b.y + d4.b.height - 8 }, { maintien: 450, steps: 20 });
  assert.strictEqual(await ordre(page), '1243'); ok('doigt : glisser vers la dernière place');

  // Appui long puis glisser hors de la grille : annulé.
  a = await centre(page, 1);
  await doigt(page, cdp, a, { x: 195, y: 20 }, { maintien: 450, steps: 10 });
  assert.strictEqual(await ordre(page), '1243'); ok('doigt : relâcher hors de la grille annule');

  await page.close(); await tel.close(); await browser.close();
}
main().catch(e => { console.error('ÉCHEC :', e.stack || e.message); process.exit(1); });
