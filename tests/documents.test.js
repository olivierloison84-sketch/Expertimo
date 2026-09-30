// Lot 3 : documents souhaités (fiches) + champ « copropriété » et stats (app).
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const files = ['index.html', 'index_en.html'].concat(fs.readdirSync(path.join(root, 'fiches')).filter(f => f.endsWith('.html')).map(f => 'fiches/' + f));
function load(f, data) {
  const calls = [];
  let html = fs.readFileSync(path.join(root, f), 'utf8');
  if (data) {
    const tag = '<script id="expertimo-data" type="application/json">' + JSON.stringify(data) + '</script>';
    html = /<script[^>]*id="expertimo-data"[^>]*>/.test(html) ? html.replace(/<script[^>]*id="expertimo-data"[^>]*>[\s\S]*?<\/script>/, () => tag) : html.replace(/<\/body>(?![\s\S]*<\/body>)/, () => tag + '</body>');
  }
  html = html.replace(/<\/body>(?![\s\S]*<\/body>)/, '<script>window.PRIVENCY_AGENT_ID="agent-1";</script></body>');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://espace.privency.fr/' + f + '?client=Marie', virtualConsole: new VirtualConsole(), beforeParse(w) {
    w.scrollTo = () => {}; w.alert = () => {};
    w.fetch = async (url, opt) => { calls.push({ url: String(url), body: opt && opt.body ? JSON.parse(opt.body) : null }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  } });
  return new Promise(r => setTimeout(() => r({ w: dom.window, d: dom.window.document, calls }), 60));
}
const labels = d => Array.from(d.querySelectorAll('#dp-groups .dp-item span')).map(x => x.textContent);
(async () => {
  for (const f of files) {
    const g = await load(f, { type: 'appart', copro: 'oui', chargesCopro: 253, taxeFonciere: 1682, agentEmail: 'agent@x.fr' }); const d = g.d;
    assert(d.getElementById('doc-picker'), f + ' : sélecteur absent'); assert(!d.querySelector('.dg'), f + ' : ancien bloc encore présent');
    let L = labels(d).join('|');
    assert(/Règlement de copropriété/.test(L) && /assemblées générales/.test(L) && /Mesurage loi Carrez/.test(L) && /Pré-état daté/.test(L), f + ' : copro incomplète');
    assert(/253 € \/ mois/.test(L) && /1682 € \/ an/.test(L), f + ' : montants absents : ' + L.slice(0, 200));
    assert(!/Audit énergétique|SPANC|Plan de bornage/.test(L), f + ' : documents de maison affichés en copro');
    assert.strictEqual(d.querySelectorAll('#dp-groups input').length, labels(d).length);
    const m = await load(f, { type: 'maison', copro: 'non' }); L = labels(m.d).join('|');
    assert(!/Règlement de copropriété|assemblées générales|Carrez|Pré-état/.test(L), f + ' : documents de copro affichés pour une maison');
    assert(/Audit énergétique/.test(L) && /SPANC/.test(L) && /Permis de construire/.test(L) && /bornage/.test(L) && /Diagnostic amiante/.test(L), f + ' : maison incomplète');
    const mc = await load(f, { type: 'maison', copro: 'oui' }); assert(/Règlement de copropriété/.test(labels(mc.d).join('|')), f + ' : maison en copropriété');
    const t = await load(f, { type: 'terrain', copro: 'non' }); L = labels(t.d).join('|');
    assert(/bornage/.test(L) && /urbanisme/.test(L) && !/DPE|amiante|Carrez|copropriété/i.test(L), f + ' : terrain : ' + L);
    const old = await load(f, { type: 'appart' }); assert(/Règlement de copropriété/.test(labels(old.d).join('|')), f + ' : ancienne fiche sans champ copro (appart)');
    const none = await load(f, {}); assert(labels(none.d).length > 5, f + ' : données absentes');
    // envoi
    const w = g.w, calls = g.calls;
    w.docPickerSend(); assert(/au moins un document/.test(d.getElementById('dp-msg').textContent) && !calls.some(c => c.url.includes('send-lead')), f + ' : envoi à vide');
    const boxes = d.querySelectorAll('#dp-groups input'); boxes[0].checked = true; boxes[1].checked = true;
    Array.from(boxes).find(b => b.value === 'pv_ag').checked = true; w._docUpdateCount();
    assert(/3 documents sélectionnés/.test(d.getElementById('dp-count').textContent), f + ' : compteur');
    d.getElementById('doc-nom').value = 'Marie D'; d.getElementById('doc-email').value = 'm@d.fr'; d.getElementById('dp-note').value = 'Urgent';
    w.docPickerSend(); await new Promise(r => setTimeout(r, 40));
    const lead = calls.find(c => c.url.includes('send-lead') && c.body.type === 'documents_liste');
    assert(lead && lead.body.documents.length === 3 && lead.body.documents.includes('Procès-verbaux des 3 dernières assemblées générales') && lead.body.agentEmail === 'agent@x.fr' && lead.body.email === 'm@d.fr' && lead.body.message === 'Urgent', f + ' : envoi email : ' + JSON.stringify(lead && lead.body));
    const rpc = calls.find(c => c.url.includes('/rpc/fiche_demande_documents')); assert(rpc && rpc.body.p_docs.length === 3 && rpc.body.p_client === 'Marie', f + ' : rpc');
    assert(/transmise/.test(d.getElementById('dp-msg').textContent), f + ' : confirmation');
    assert(calls.some(c => c.url.includes('fiche_views') && c.body.evenement === 'documents_demandes'), f + ' : événement');
    g.w.close(); m.w.close(); mc.w.close(); t.w.close(); old.w.close(); none.w.close();
  }
  // langue : le sélecteur suit applyLang même assistant fermé
  { const g = await load('index.html', { type: 'appart', copro: 'oui' });
    g.w.applyLang('en'); await new Promise(r => setTimeout(r, 30));
    assert(/Which documents would you like to receive/.test(g.d.getElementById('dp-title').textContent), 'applyLang(en) sans ouvrir l\'assistant : ' + g.d.getElementById('dp-title').textContent);
    assert(/Ongoing proceedings/.test(labels(g.d).join('|')) && /Asbestos survey of the common areas/.test(labels(g.d).join('|')), 'nouveaux documents copro');
    g.w.close(); }
  // échec d'envoi : rien n'est enregistré ; un nouvel essai réussi enregistre une seule fois
  { const g = await load('index.html', { type: 'appart', copro: 'oui', agentEmail: 'a@x.fr' }); let fail = true;
    g.w.fetch = async (url, opt) => { g.calls.push({ url: String(url), body: opt && opt.body ? JSON.parse(opt.body) : null }); if (String(url).includes('send-lead') && fail) throw new Error('réseau'); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
    g.d.querySelector('#dp-groups input').checked = true;
    g.w.docPickerSend(); await new Promise(r => setTimeout(r, 40));
    assert(/Envoi impossible/.test(g.d.getElementById('dp-msg').textContent), 'message d\'échec');
    assert(!g.calls.some(c => c.url.includes('fiche_demande_documents')) && !g.calls.some(c => c.body && c.body.evenement === 'documents_demandes'), 'rien d\'enregistré si l\'envoi échoue');
    fail = false; g.w.docPickerSend(); await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(g.calls.filter(c => c.url.includes('fiche_demande_documents')).length, 1, 'une seule demande enregistrée'); g.w.close(); }
  { const t = await load('index.html', { type: 'terrain', copro: 'non' }); assert(/Viabilisation/.test(labels(t.d).join('|')), 'viabilisation terrain'); const m = await load('index.html', { type: 'maison', copro: 'non' }); assert(!/Viabilisation/.test(labels(m.d).join('|')) && /Étude de sol/.test(labels(m.d).join('|')), 'maison'); t.w.close(); m.w.close(); }
  // langues : libellés envoyés à l'agent toujours en français
  { const g = await load('index.html', { type: 'appart', copro: 'oui', agentEmail: 'a@x.fr' });
    ['en', 'pt', 'es'].forEach(l => { g.w._currentLang = l; g.w.renderDocPicker(); });
    g.w._currentLang = 'en'; g.w.renderDocPicker(); assert(/Condominium rules/.test(labels(g.d).join('|')) && /Select all/.test(g.d.getElementById('dp-all').textContent), 'anglais');
    g.w._currentLang = 'es'; g.w.renderDocPicker(); assert(/Reglamento de la comunidad/.test(labels(g.d).join('|')), 'espagnol');
    g.w._currentLang = 'pt'; g.w.renderDocPicker(); assert(/Regulamento do condomínio/.test(labels(g.d).join('|')), 'portugais');
    g.d.querySelector('#dp-groups input[value=rcp]').checked = true; g.w._currentLang = 'en'; g.w.renderDocPicker();
    assert(g.d.querySelector('#dp-groups input[value=rcp]').checked, 'la sélection survit au changement de langue');
    g.w.docPickerSend(); await new Promise(r => setTimeout(r, 40));
    assert.deepStrictEqual(g.calls.find(c => c.url.includes('send-lead') && c.body.type === 'documents_liste').body.documents, ['Règlement de copropriété et état descriptif de division'], 'libellés FR pour l\'agent'); g.w.close(); }
  // App
  const calls = [];
  const rowsV = [{ id: 'v1', client_nom: 'Marie', bien_adresse: '1 rue A', evenement: 'fiche_ouverte', created_at: new Date().toISOString() }];
  const dom = await JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', url: 'https://app.privency.fr/app.html', virtualConsole: new VirtualConsole(), beforeParse(w) {
    w.scrollTo = () => {}; w.confirm = () => true;
    w.fetch = async (url, opt) => { calls.push((opt && opt.method || 'GET') + ' ' + url);
      if (opt && opt.method === 'DELETE') return { ok: true, status: 200, json: async () => [{ id: 'v1' }] };
      if (url.includes('fiche_demandes_documents')) return { ok: true, status: 200, json: async () => [{ id: 'd1', client_nom: 'Marie', bien_adresse: '1 rue A', docs: ['DPE', '<img src=x onerror=alert(1)>'], note: 'Urgent <b>x</b>', created_at: new Date().toISOString() }] };
      if (url.includes('fiche_sessions') || url.includes('fiche_questions')) return { ok: true, status: 200, json: async () => [] };
      const off = +(url.match(/offset=(\d+)/) || [0, 0])[1]; return { ok: true, status: 200, json: async () => rowsV.slice(off) }; };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(fs.readFileSync(path.join(root, 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
  } });
  const w = dom.window, d = w.document; await new Promise(r => setTimeout(r, 300));
  const val = () => { const r = d.querySelector('input[name=copro_statut]:checked'); return r && r.value; };
  w.switchType('appart'); assert.strictEqual(val(), 'oui', 'appart -> copro oui');
  w.switchType('maison'); assert.strictEqual(val(), 'non', 'maison -> copro non');
  assert.strictEqual(w.collectBienData().copro, 'non');
  d.querySelector('input[name=copro_statut][value=oui]').checked = true; d.dispatchEvent(Object.assign(new w.Event('change', { bubbles: true }), {})); d.querySelector('input[name=copro_statut][value=oui]').dispatchEvent(new w.Event('change', { bubbles: true }));
  w.switchType('appart'); w.switchType('maison'); assert.strictEqual(val(), 'oui', 'le choix manuel n\'est plus écrasé');
  assert.strictEqual(w.collectBienData().copro, 'oui'); w.switchType('terrain'); assert.strictEqual(w.collectBienData().copro, 'non', 'terrain');
  // restauration d'un brouillon contenant le défaut : le choix reste automatique ; un choix différent du défaut est figé
  w._coproAuto = true; w.restoreRawFormState({ type: 'appart', radio_copro_statut: 'oui' }); await new Promise(r => setTimeout(r, 200));
  w.switchType('maison'); assert.strictEqual(val(), 'non', 'brouillon avec le défaut : suit le type');
  w.restoreRawFormState({ type: 'maison', radio_copro_statut: 'oui' }); await new Promise(r => setTimeout(r, 200));
  w.switchType('appart'); w.switchType('maison'); assert.strictEqual(val(), 'oui', 'brouillon avec choix différent du défaut : figé');
  assert(w.PUBLIC_EMBED_KEYS.includes('copro'), 'copro publié dans la fiche');
  assert(w.collectRawFormState().radio_copro_statut === 'oui', 'choix enregistré dans le brouillon');
  w.privencyAuth = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  await w.loadAnalytics();
  const det = d.querySelector('#analytics-tbody details'); assert(det && /2 documents demandés/.test(det.textContent), 'demande affichée');
  assert(!d.querySelector('#analytics-tbody img') && !d.querySelector('#analytics-tbody b'), 'échappement');
  w.deleteAnalyticsGroups([w._analyticsGroups[0].key]); await new Promise(r => setTimeout(r, 300));
  assert(calls.some(c => c.startsWith('DELETE') && c.includes('fiche_demandes_documents?id=in.(d1)')), 'suppression des demandes');
  console.log('OK documents : ' + files.length + ' fiches + app'); process.exit(0);
})().catch(e => { console.error('ÉCHEC :', e.stack || e.message); process.exit(1); });
