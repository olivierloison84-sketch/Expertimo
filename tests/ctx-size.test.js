// Taille du contexte chatbot sur un bien « très rempli » (tous les champs de l'étape 2 remplis) vs limite 24000 de api/chat.js.
const path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
(async () => {
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'app.html'), { runScripts: 'dangerously', virtualConsole: new VirtualConsole(), url: 'http://localhost/app.html', beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: false, json: async () => ({}), text: async () => '' });
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
    w.scrollTo = () => {};
  } });
  const w = dom.window, doc = w.document;
  await new Promise(r => setTimeout(r, 300));
  for (const len of [120, 400]) {
    doc.querySelectorAll('#page-2 input[type=text], #page-2 textarea').forEach(el => { el.value = ('Texte de remplissage réaliste ').repeat(30).slice(0, len); });
    doc.getElementById('adresse').value = '12 rue des Lilas 91000 Evry';
    const ctx = w.buildChatContext(w.collectBienData());
    console.log('champs texte de ' + len + ' car. -> contexte chatbot : ' + ctx.length + ' car. (limite prompt système 24000, hors instructions ~3-4k)');
  }
  dom.window.close();
})();
