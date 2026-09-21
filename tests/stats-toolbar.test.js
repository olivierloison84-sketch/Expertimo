// Barre d'outils Statistiques (onglet 5) : pagination, groupement, filtre de période, sélection, suppression.
const path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
(async () => {
  const DAY = 86400000, now = Date.now(), rows = [];
  // 1200 événements : 2 clients récents (7 j), 1 ancien (200 j)
  for (let i = 0; i < 600; i++) rows.push({ id: 'a' + i, client_nom: 'Client Récent', bien_adresse: '1 rue A', evenement: i % 2 ? 'fiche_ouverte' : 'onglet_prix', created_at: new Date(now - 2 * DAY - i * 1000).toISOString() });
  for (let i = 0; i < 500; i++) rows.push({ id: 'b' + i, client_nom: 'Autre Client', bien_adresse: '2 rue B', evenement: 'fiche_ouverte', created_at: new Date(now - 5 * DAY - i * 1000).toISOString() });
  for (let i = 0; i < 100; i++) rows.push({ id: 'c' + i, client_nom: 'Vieux Client', bien_adresse: '3 rue C', evenement: 'fiche_ouverte', created_at: new Date(now - 200 * DAY - i * 1000).toISOString() });
  rows.sort((x, y) => y.created_at.localeCompare(x.created_at));
  const calls = []; let deleted = [];
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'app.html'), { runScripts: 'dangerously', virtualConsole: new VirtualConsole(), url: 'http://localhost/app.html', pretendToBeVisual: true, beforeParse(w) {
    w.scrollTo = () => {}; w.confirm = () => true;
    w.fetch = async (url, opt) => {
      calls.push((opt && opt.method || 'GET') + ' ' + url);
      if (opt && opt.method === 'DELETE') { const ids = decodeURIComponent(url.match(/id=in\.\(([^)]*)\)/)[1]).split(','); deleted = deleted.concat(ids); ids.forEach(id => { const i = rows.findIndex(r => r.id === id); if (i >= 0) rows.splice(i, 1); }); return { ok: true, status: 200, json: async () => ids.map(id => ({ id })) }; }
      const off = +(url.match(/offset=(\d+)/) || [0, 0])[1], lim = +(url.match(/limit=(\d+)/) || [0, 1000])[1];
      return { ok: true, status: 200, json: async () => rows.slice(off, off + lim) };
    };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
  } });
  const w = dom.window, d = w.document;
  await new Promise(r => setTimeout(r, 300));
  w.privencyAuth = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  await w.loadAnalytics();
  assert(calls.filter(c => c.startsWith('GET') && c.includes('fiche_views')).length === 2, 'pagination : 2 pages attendues');
  assert.strictEqual(d.getElementById('analytics-toolbar').style.display, 'flex', 'barre d\'outils visible');
  assert.strictEqual(d.querySelectorAll('#analytics-tbody tr').length, 3, '3 groupes (client + bien)');
  assert(/3 lignes · 1200 événements/.test(d.getElementById('analytics-count').textContent), d.getElementById('analytics-count').textContent);
  // filtre de période
  const sel = d.getElementById('analytics-period');
  sel.value = '30'; w.renderAnalytics(); assert.strictEqual(d.querySelectorAll('#analytics-tbody tr').length, 2, '30 jours : 2 lignes');
  sel.value = 'older90'; w.renderAnalytics(); assert.strictEqual(d.querySelectorAll('#analytics-tbody tr').length, 1, '> 90 jours : 1 ligne');
  // sélection + suppression
  assert(d.getElementById('analytics-del-btn').disabled, 'bouton supprimer désactivé sans sélection');
  w.analyticsSelectAll(true); assert(!d.getElementById('analytics-del-btn').disabled, 'bouton activé après « Tout cocher »');
  w.deleteSelectedAnalytics(); await new Promise(r => setTimeout(r, 300));   // la fonction n'est pas async : on attend le rechargement
  assert.strictEqual(deleted.length, 100, '100 événements supprimés'); assert(calls.some(c => c.startsWith('DELETE')), 'requête DELETE envoyée');
  assert.strictEqual(d.getElementById('analytics-table-wrap').style.display, 'none', 'tableau masqué : plus de ligne > 90 jours');
  assert(/Aucune activité/.test(d.getElementById('analytics-empty').textContent), 'message vide affiché');
  sel.value = 'all'; w.renderAnalytics(); assert.strictEqual(d.querySelectorAll('#analytics-tbody tr').length, 2, 'les 2 groupes restants après suppression');
  console.log('OK — Statistiques : pagination (' + calls.filter(c => c.startsWith('GET')).length + ' requêtes), groupement, filtre de période, sélection, suppression.');
  dom.window.close();
})().catch(e => { console.error('ÉCHEC :', e.stack || e.message); process.exit(1); });
