// Lot 5 : « retour de visite en un clic » dans les 32 fiches (liste fermée, 4 max, envoi, langues, échec).
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const files = ['index.html', 'index_en.html'].concat(fs.readdirSync(path.join(root, 'fiches')).filter(f => f.endsWith('.html')).map(f => 'fiches/' + f));
function load(f, failRpc) {
  const calls = [];
  let html = fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/body>(?![\s\S]*<\/body>)/, '<script>window.PRIVENCY_AGENT_ID="agent-1";</script></body>');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://espace.privency.fr/' + f + '?client=Marie', virtualConsole: new VirtualConsole(), beforeParse(w) {
    w.scrollTo = () => {}; w.alert = () => {};
    w.fetch = async (url, opt) => { calls.push({ url: String(url), body: opt && opt.body ? JSON.parse(opt.body) : null });
      if (failRpc && String(url).includes('fiche_retour')) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  } });
  return new Promise(r => setTimeout(() => r({ w: dom.window, d: dom.window.document, calls }), 60));
}
const chips = d => Array.from(d.querySelectorAll('#vr-chips .vr-chip'));
(async () => {
  for (const f of files) {
    const g = await load(f), d = g.d;
    assert(d.getElementById('vr-card') && d.querySelectorAll('[id="vr-card"]').length === 1, f + ' : carte absente');
    assert.strictEqual(chips(d).length, 8, f + ' : 8 réponses attendues');
    assert(d.getElementById('vr-card').closest('#offre'), f + ' : carte hors de l\'onglet offre');
    assert(!/<input|<textarea/i.test(d.getElementById('vr-card').innerHTML), f + ' : aucun champ de texte libre');
    g.w.vrSend(); assert(/au moins une réponse|at least one/i.test(d.getElementById('vr-msg').textContent) && !g.calls.some(c => c.url.includes('fiche_retour')), f + ' : envoi à vide');
    chips(d).slice(0, 5).forEach(c => c.click());
    assert.strictEqual(d.querySelectorAll('#vr-chips .vr-chip[aria-pressed="true"]').length, 4, f + ' : 4 maximum');
    assert(/4/.test(d.getElementById('vr-msg').textContent), f + ' : message du plafond');
    g.w.vrSend(); await new Promise(r => setTimeout(r, 30));
    const c = g.calls.find(x => x.url.includes('/rpc/fiche_retour'));
    assert(c && c.body.p_reponses.length === 4 && c.body.p_reponses.every(x => ['coup_coeur', 'prix', 'travaux', 'quartier'].includes(x)) && c.body.p_client === 'Marie' && c.body.p_agent === 'agent-1', f + ' : appel RPC ' + JSON.stringify(c && c.body));
    assert(g.calls.some(x => x.url.includes('fiche_views') && x.body.evenement === 'retour_visite'), f + ' : événement retour_visite');
    assert(d.getElementById('vr-send').style.display === 'none' && chips(d).every(x => x.disabled) && /Merci|Thank/.test(d.getElementById('vr-msg').textContent), f + ' : confirmation');
    g.w.close();
  }
  // langues (fiche avec sélecteur) + échec réseau : rien n'est confirmé, nouvel essai possible
  { const g = await load('index.html'); g.w.applyLang('pt'); await new Promise(r => setTimeout(r, 30));
    assert(/Visitou o imóvel/.test(g.d.getElementById('vr-title').textContent) && /O preço/.test(g.d.querySelector('#vr-chips .vr-chip[data-code="prix"]').textContent), 'portugais');
    g.w.applyLang('es'); await new Promise(r => setTimeout(r, 30)); assert(/Ha visitado/.test(g.d.getElementById('vr-title').textContent), 'espagnol'); g.w.close(); }
  { const g = await load('index.html', true); g.d.querySelector('#vr-chips .vr-chip[data-code="prix"]').click(); g.w.vrSend(); await new Promise(r => setTimeout(r, 30));
    assert(/échoué/.test(g.d.getElementById('vr-msg').textContent) && g.d.getElementById('vr-send').style.display !== 'none' && !g.calls.some(x => x.body && x.body.evenement === 'retour_visite'), 'échec : pas de confirmation ni d\'événement'); g.w.close(); }
  console.log('OK retour de visite : ' + files.length + ' fiches');
})().catch(e => { console.error(e); process.exit(1); });
