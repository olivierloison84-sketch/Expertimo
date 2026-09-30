// Lot 2 : questions de l'assistant transmises à l'agent (fiches) + affichage / suppression dans les stats (app).
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const files = ['index.html', 'index_en.html'].concat(fs.readdirSync(path.join(root, 'fiches')).filter(f => f.endsWith('.html')).map(f => 'fiches/' + f));
(async () => {
  for (const f of files) {
    const rpc = [];
    const html = fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/body>(?![\s\S]*<\/body>)/, '<script>window.PRIVENCY_AGENT_ID="agent-1";</script></body>');
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://espace.privency.fr/' + f + '?client=Marie', virtualConsole: new VirtualConsole(), beforeParse(w) {
      w.scrollTo = () => {}; w.alert = () => {};
      w.fetch = async (url, opt) => { if (String(url).includes('/rpc/fiche_question')) rpc.push(JSON.parse(opt.body)); return { ok: true, status: 200, json: async () => ({ content: [{ text: 'ok' }] }) }; };
    } });
    const w = dom.window, d = w.document; await new Promise(r => setTimeout(r, 50));
    w.toggleAI(); await new Promise(r => setTimeout(r, 20));
    const notice = d.getElementById('ai-notice');
    assert(notice && /transmises à votre conseiller/.test(notice.textContent), f + ' : mention absente : ' + (notice && notice.textContent));
    d.getElementById('ai-input').value = '   ';
    w.sendAI(); assert.strictEqual(rpc.length, 0, f + ' : question vide enregistrée');
    d.getElementById('ai-input').value = 'Les charges incluent le chauffage ?';
    w.sendAI(); await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(rpc.length, 1, f + ' : 1 question attendue');
    assert.strictEqual(rpc[0].p_question, 'Les charges incluent le chauffage ?'); assert.strictEqual(rpc[0].p_client, 'Marie');
    assert.strictEqual(rpc[0].p_agent, 'agent-1'); assert(rpc[0].p_path.includes('/'), f);
    d.getElementById('ai-input').value = 'x'.repeat(900); w.sendAI();
    assert.strictEqual(rpc[1].p_question.length, 500, f + ' : troncature à 500');
    dom.window.close();
  }
  // Notice traduite
  { const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://espace.privency.fr/fiches/x.html', virtualConsole: new VirtualConsole(), beforeParse(w) { w.scrollTo = () => {}; w.fetch = async () => ({ ok: true, json: async () => ({}) }); } });
    await new Promise(r => setTimeout(r, 50)); const w = dom.window;
    w._currentLang = 'en'; w.renderAINotice(); assert(/shared with your advisor/.test(w.document.getElementById('ai-notice').textContent));
    w._currentLang = 'es'; w.renderAINotice(); assert(/asesor/.test(w.document.getElementById('ai-notice').textContent));
    dom.window.close(); }
  // App : affichage + suppression
  const calls = [];
  const rowsV = [{ id: 'v1', client_nom: 'Marie', bien_adresse: '1 rue A', evenement: 'fiche_ouverte', created_at: new Date().toISOString() }];
  const dom = await JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', url: 'https://app.privency.fr/app.html', virtualConsole: new VirtualConsole(), beforeParse(w) {
    w.scrollTo = () => {}; w.confirm = () => true;
    w.fetch = async (url, opt) => { calls.push((opt && opt.method || 'GET') + ' ' + url);
      if (opt && opt.method === 'DELETE') return { ok: true, status: 200, json: async () => [{ id: 'v1' }] };
      if (url.includes('fiche_questions')) return { ok: true, status: 200, json: async () => [{ id: 'q1', client_nom: 'Marie', bien_adresse: '1 rue A', question: 'Charges <img src=x onerror=alert(1)> ?', created_at: new Date().toISOString() }] };
      if (url.includes('fiche_sessions')) return { ok: true, status: 200, json: async () => [] };
      const off = +(url.match(/offset=(\d+)/) || [0, 0])[1]; return { ok: true, status: 200, json: async () => rowsV.slice(off) }; };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(fs.readFileSync(path.join(root, 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
  } });
  const w = dom.window, d = w.document; await new Promise(r => setTimeout(r, 300));
  w.privencyAuth = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  await w.loadAnalytics();
  const det = d.querySelector('#analytics-tbody details');
  assert(det && /1 question posée/.test(det.textContent), 'questions affichées');
  assert(!d.querySelector('#analytics-tbody img'), 'question échappée (pas d\'injection HTML)');
  assert(/Charges <img/.test(det.textContent), 'texte brut conservé');
  w.deleteAnalyticsGroups([w._analyticsGroups[0].key]); await new Promise(r => setTimeout(r, 300));
  assert(calls.some(c => c.startsWith('DELETE') && c.includes('fiche_questions?id=in.(q1)')), 'suppression des questions : ' + calls.filter(c => c.startsWith('DELETE')).join(' | '));
  console.log('OK questions assistant : ' + files.length + ' fiches + app'); process.exit(0);
})().catch(e => { console.error('ÉCHEC :', e.stack || e.message); process.exit(1); });
