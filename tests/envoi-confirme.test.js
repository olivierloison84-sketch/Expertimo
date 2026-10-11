// « Envoyé ! » honnête : le match du test et le carnet de visite ne s'affichent comme envoyés que si le serveur
// confirme l'enregistrement ; échec (hors ligne, erreur serveur) : message clair, bouton actif, résultat conservé ;
// nouvelle tentative possible, sans doublon une fois l'envoi réussi.
// Usage : cd tests && node envoi-confirme.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

(async () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  let mode = 'ok', attente = null;
  const posts = [], recus = [];   // tentatives / enregistrements confirmés
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://espace.privency.fr/fiches/x.html?client=Marie', virtualConsole: new VirtualConsole(), beforeParse(w) {
    w.scrollTo = () => {}; w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} }));
    w.fetch = (url, opt) => {
      if (!String(url).includes('/rest/v1/fiche_views')) return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      const ev = JSON.parse(opt.body).evenement;
      if (/^(onglet_|fiche_ouverte)/.test(ev)) return Promise.resolve({ ok: true, status: 201 });
      posts.push(ev);
      if (mode === 'horsligne') return Promise.reject(new TypeError('Failed to fetch'));
      if (mode === 'erreur') return Promise.resolve({ ok: false, status: 500 });
      if (mode === 'lent') return new Promise(res => { attente = () => { recus.push(ev); res({ ok: true, status: 201 }); }; });
      recus.push(ev); return Promise.resolve({ ok: true, status: 201 });
    };
  } });
  const w = dom.window, doc = w.document;
  await tick(200);
  const click = sel => { const el = doc.querySelector(sel); assert(el, 'élément ' + sel); el.click(); };
  const nb = re => recus.filter(e => re.test(e)).length;

  // ── Test « Crush ou crash ? » : envoi du match ──
  click('#main-nav button[data-tab="crush"]'); click('#crush [data-act="solo"]');
  for (let i = 0; i < 8; i++) click('#crush [data-act="pick"][data-a="A"]');
  const score = doc.querySelector('#crush .cr-ring-v b').textContent;
  doc.getElementById('cr-prenom').value = 'Léa';
  for (const m of ['horsligne', 'erreur']) {
    mode = m; click('#crush [data-act="send"]'); await tick();
    assert(!doc.querySelector('#crush .cr-sent'), m + ' : jamais « Envoyé ! » sans confirmation');
    assert.strictEqual(doc.querySelector('#crush .cr-err').textContent, 'L\'envoi n\'a pas abouti. Réessayez dans un instant.', m + ' : message d\'échec');
    const b = doc.querySelector('#crush [data-act="send"]'); assert(b && !b.disabled, m + ' : bouton toujours actif');
    assert.strictEqual(doc.querySelector('#crush .cr-ring-v b').textContent, score, m + ' : résultat du test conservé');
    assert.strictEqual(doc.getElementById('cr-prenom').value, 'Léa', m + ' : prénom saisi conservé');
  }
  w.applyLang('en'); assert.strictEqual(doc.querySelector('#crush .cr-err').textContent, 'Sending failed. Please try again in a moment.', 'message dans la langue de la fiche');
  w.applyLang('pt'); assert(/O envio falhou/.test(doc.querySelector('#crush .cr-err').textContent));
  w.applyLang('es'); assert(/No se ha podido enviar/.test(doc.querySelector('#crush .cr-err').textContent));
  w.applyLang('fr');
  assert.strictEqual(nb(/^crush_termine:/), 0, 'rien d\'enregistré après deux échecs');
  // nouvelle tentative : envoi en cours (bouton désactivé, double clic sans effet), puis confirmation
  mode = 'lent'; click('#crush [data-act="send"]'); await tick();
  const enCours = doc.querySelector('#crush [data-act="send"]');
  assert(enCours.disabled && !doc.querySelector('#crush .cr-sent') && !doc.querySelector('#crush .cr-err'), 'en cours : ni « Envoyé ! » ni erreur, bouton désactivé');
  w.document.querySelector('#crush [data-act="send"]').disabled = false; click('#crush [data-act="send"]');   // même un clic forcé ne relance pas
  const tentatives = posts.filter(e => /^crush_termine:/.test(e)).length;
  attente(); await tick();
  assert(doc.querySelector('#crush .cr-sent') && /Envoyé !/.test(doc.querySelector('#crush .cr-sent').textContent), '« Envoyé ! » après confirmation');
  assert(!doc.querySelector('#crush [data-act="send"]'), 'plus de bouton d\'envoi une fois reçu');
  assert.strictEqual(tentatives, 3, '2 échecs + 1 tentative en cours, pas de double envoi : ' + tentatives);
  assert.strictEqual(nb(/^crush_termine:/), 1, 'un seul enregistrement');
  assert(/"n":"Léa"/.test(recus.find(e => /^crush_termine:/.test(e))), 'prénom transmis');
  mode = 'ok'; w.renderCrush(); assert.strictEqual(nb(/^crush_termine:/), 1, 'pas de doublon au rafraîchissement');

  // ── Carnet de visite : partage à l'agent ──
  click('#main-nav button[data-tab="offre"]');
  click('#pv-carnet .pv-chip');
  const msg = () => doc.querySelector('#pv-carnet .pv-msg');
  mode = 'horsligne'; click('#pv-carnet [data-pv="car-share"]'); await tick();
  assert(msg() && msg().classList.contains('pv-err') && msg().textContent === 'L\'envoi n\'a pas abouti. Réessayez dans un instant.', 'carnet : message d\'échec');
  assert(!doc.querySelector('#pv-carnet [data-pv="car-share"]').disabled, 'carnet : bouton actif');
  assert(!JSON.parse(w.localStorage.getItem('pv_part_/fiches/x.html_carnet')).shared, 'carnet : pas marqué partagé');
  assert.strictEqual(doc.querySelectorAll('#vr-chips .vr-chip[aria-pressed="true"]').length, 0, 'carnet : retour de visite non pré-rempli sans confirmation');
  assert.strictEqual(doc.querySelectorAll('#pv-carnet .pv-chip.on').length, 1, 'carnet : coups de cœur conservés');
  mode = 'erreur'; click('#pv-carnet [data-pv="car-share"]'); await tick(); assert(msg().classList.contains('pv-err'));
  w.applyLang('en'); click('#pv-carnet [data-pv="car-share"]'); await tick(); assert.strictEqual(msg().textContent, 'Sending failed. Please try again in a moment.'); w.applyLang('fr');
  mode = 'ok'; click('#pv-carnet [data-pv="car-share"]'); await tick();
  assert(!msg().classList.contains('pv-err') && /^Partagé !/.test(msg().textContent), 'carnet : « Partagé ! » après confirmation');
  assert(doc.querySelectorAll('#vr-chips .vr-chip[aria-pressed="true"]').length > 0, 'carnet : retour de visite pré-rempli après confirmation');
  assert.strictEqual(nb(/^carnet_partage:/), 1);
  click('#pv-carnet [data-pv="car-share"]'); await tick();
  assert.strictEqual(nb(/^carnet_partage:/), 1, 'carnet : nouveau clic, même contenu : pas de doublon');
  click('#pv-carnet .pv-chip:not(.on)'); click('#pv-carnet [data-pv="car-share"]'); await tick();
  assert.strictEqual(nb(/^carnet_partage:/), 2, 'carnet modifié : la mise à jour est envoyée');
  console.log('OK envoi confirmé : test et carnet (succès, hors ligne, erreur serveur, nouvelle tentative, sans doublon, 4 langues)');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
