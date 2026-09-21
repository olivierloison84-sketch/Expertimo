// Onglet « Vidéos » de app.html : navigation, 4 cartes dans l'ordre, « Bientôt disponible », une seule lecture à la fois, badge « Vue » scopé par compte.
const path = require('path'), fs = require('fs'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const ATTENDU = [
  ['Créer son profil agent', '1 min 11', '/videos/tuto-01-creer-son-profil.mp4'],
  ['Créer une fiche depuis une annonce', '1 min 44', '/videos/tuto-02-fiche-depuis-annonce.mp4'],
  ['Créer une fiche manuellement', '1 min 13', '/videos/tuto-03-fiche-manuelle.mp4'],
  ['Le Coaching Express', '1 min 33', '/videos/tuto-04-coaching-express.mp4']
];
(async () => {
  const dom = await JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', virtualConsole: new VirtualConsole(), url: 'http://localhost/app.html', pretendToBeVisual: true, beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: false, json: async () => ({}), text: async () => '' });
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(fs.readFileSync(path.join(root, 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
    w.scrollTo = () => {};
    w.pauses = [];
    w.HTMLMediaElement.prototype.pause = function () { w.pauses.push(this.getAttribute('aria-label')); };
  } });
  const w = dom.window, d = w.document;
  await new Promise(r => setTimeout(r, 300));

  // Navigation : l'entrée existe, dans « Outils commerciaux », juste sous « Coaching Express »
  const tab = d.getElementById('tab-9');
  assert(tab && tab.textContent.includes('Vidéos'), 'entrée « Vidéos » absente');
  assert.strictEqual(tab.previousElementSibling.id, 'tab-7', 'la Vidéos doit suivre Coaching Express');
  assert.strictEqual(tab.parentElement.id, 'stepper-tools', 'la Vidéos doit être dans le groupe Outils commerciaux');
  assert(d.getElementById('page-9'), 'panneau page-9 absent');
  assert.strictEqual(d.querySelectorAll('#videos-grid .video-card').length, 0, 'les cartes ne doivent être rendues qu’à la première visite');

  w.goToStep(9);
  assert(d.getElementById('page-9').classList.contains('active') && tab.classList.contains('active'), 'onglet non activé');
  assert(!d.getElementById('page-1').classList.contains('active'), 'l’ancienne page doit être masquée');
  assert(/moins de 2 minutes/.test(d.querySelector('.videos-intro').textContent), 'texte d’intro');

  // 4 cartes, dans l'ordre
  const cards = [...d.querySelectorAll('#videos-grid .video-card')];
  assert.strictEqual(cards.length, 4, '4 cartes attendues');
  cards.forEach((c, i) => {
    assert.strictEqual(c.querySelector('.video-card-title span').textContent, ATTENDU[i][0], 'titre carte ' + (i + 1));
    assert.strictEqual(c.querySelector('.video-card-meta').textContent, ATTENDU[i][1], 'durée carte ' + (i + 1));
    assert(c.querySelector('.video-card-desc').textContent.length > 20, 'description carte ' + (i + 1));
    const v = c.querySelector('video');
    assert(v, 'lecteur carte ' + (i + 1));
    assert(v.controls && v.getAttribute('preload') === 'metadata' && v.hasAttribute('playsinline'), 'attributs du lecteur ' + (i + 1));
    assert.strictEqual(v.getAttribute('src'), ATTENDU[i][2], 'url carte ' + (i + 1));
  });
  assert(!d.querySelector('.video-card-soon'), 'aucun « Bientôt disponible » quand toutes les urls sont renseignées');
  const mail = d.querySelector('#videos-support a');
  assert(/^mailto:.+@.+/.test(mail.getAttribute('href')) && /Une question qui n'est pas couverte \? Écrivez-nous\./.test(d.getElementById('videos-support').textContent), 'ligne de support');

  // Une seule vidéo à la fois
  const players = cards.map(c => c.querySelector('video'));
  w.pauses.length = 0;
  players[1].dispatchEvent(new w.Event('play'));
  assert(!w.pauses.includes(ATTENDU[1][0]) && [0, 2, 3].every(i => w.pauses.includes(ATTENDU[i][0])), 'lancer une vidéo doit mettre les autres en pause : ' + w.pauses);

  // Badge « Vue » : uniquement à la fin de lecture, mémorisé par compte (jamais en localStorage non scopé)
  players[0].dispatchEvent(new w.Event('pause'));
  assert(!cards[0].classList.contains('vue'), 'pas de badge sans lecture complète');
  players[0].dispatchEvent(new w.Event('ended'));
  assert(cards[0].classList.contains('vue') && !cards[1].classList.contains('vue'), 'badge « Vue » sur la carte 1 seulement');
  assert.deepStrictEqual(JSON.parse(w.localStorage.getItem('privency_videos_vues:test-uid')), { 'creer-profil': true }, 'clé scopée par compte');
  assert.strictEqual(w.localStorage.getItem('privency_videos_vues'), null, 'aucune clé non scopée');

  // Fichier introuvable → « Bientôt disponible »
  players[3].dispatchEvent(new w.Event('error'));
  assert(cards[3].querySelector('.video-card-soon') && !cards[3].querySelector('video') && /Bientôt disponible/.test(cards[3].textContent), 'erreur de chargement → Bientôt disponible');

  // Quitter l'onglet met en pause
  w.pauses.length = 0; w.goToStep(1);
  assert(w.pauses.length >= 3, 'quitter l’onglet met les vidéos en pause');

  // Rechargement : le badge est restauré depuis le stockage scopé ; url vide → « Bientôt disponible » (config)
  d.getElementById('videos-grid').textContent = ''; d.getElementById('videos-support').textContent = '';
  w._videosInited = false; w.VIDEOS_TUTOS[2].url = '';
  w.goToStep(9);
  const cards2 = [...d.querySelectorAll('#videos-grid .video-card')];
  assert.strictEqual(cards2.length, 4);
  assert(cards2[0].classList.contains('vue'), 'badge « Vue » restauré');
  assert(cards2[2].querySelector('.video-card-soon') && !cards2[2].querySelector('video'), 'url vide → Bientôt disponible');
  assert.strictEqual(cards2.filter(c => c.querySelector('.video-card-soon')).length, 1);
  console.log('OK — onglet Vidéos : entrée sous Coaching Express, 4 cartes dans l’ordre, Bientôt disponible, lecture unique, badge Vue scopé.');
  process.exit(0);
})().catch(e => { console.error('FAIL —', e.message); process.exit(1); });
