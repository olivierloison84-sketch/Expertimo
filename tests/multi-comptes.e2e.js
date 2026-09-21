// Prérequis : cd tests && npm i --no-save playwright @supabase/supabase-js && npx playwright install chromium
// Usage : node tests/multi-comptes.e2e.js
// E2E multi-comptes dans UN seul profil navigateur (un seul BrowserContext), backend Supabase simulé.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SUPA_JS = fs.readFileSync(path.join(__dirname, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), 'utf8');
const SB = 'https://hhqcumnatnslfjpsrmgb.supabase.co';

// ── serveur statique ──
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/landing.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  const ext = path.extname(f);
  res.writeHead(200, { 'content-type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' }[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

// ── backend simulé ──
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const USERS = {
  A: { id: '11111111-1111-4111-8111-111111111111', email: 'a@agence.test', pw: 'pa', prenom: 'Olivier', nom: 'Alpha' },
  B: { id: '22222222-2222-4222-8222-222222222222', email: 'b@agence.test', pw: 'pb', prenom: 'Béatrice', nom: 'Bravo' },
};
const byId = id => Object.values(USERS).find(u => u.id === id);
const profiles = {}; Object.values(USERS).forEach(u => { profiles[u.id] = { user_id: u.id, prenom: u.prenom, nom: u.nom, email: u.email, photo_url: '', onboarding_seen: true, a_vu_ecran_accueil: true }; });
const validRefresh = new Map(); let rtN = 0;
const published = [];
function userObj(u) { return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, created_at: '2024-01-01T00:00:00Z', app_metadata: {}, user_metadata: { prenom: u.prenom, nom: u.nom } }; }
function issue(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', exp, user_metadata: { prenom: u.prenom, nom: u.nom }, app_metadata: {} }) + '.sig';
  const rt = 'rt-' + (++rtN) + '-' + u.id; validRefresh.set(rt, u.id);
  return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: rt, user: userObj(u) };
}
const sub = req => { const a = req.headers()['authorization'] || ''; try { return JSON.parse(Buffer.from(a.replace('Bearer ', '').split('.')[1], 'base64url').toString()).sub; } catch { return null; } };
const CORS = req => ({ 'access-control-allow-origin': '*', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' });
const json = (route, req, status, body) => route.fulfill({ status, headers: { ...CORS(req), 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function handleSupabase(route) {
  const req = route.request(); const u = new URL(req.url()); const p = u.pathname, m = req.method();
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS(req) });
  if (p === '/auth/v1/token') {
    const gt = u.searchParams.get('grant_type'); const body = JSON.parse(req.postData() || '{}');
    if (gt === 'password') {
      const usr = Object.values(USERS).find(x => x.email === body.email && x.pw === body.password);
      return usr ? json(route, req, 200, issue(usr)) : json(route, req, 400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials', message: 'Invalid login credentials' });
    }
    if (gt === 'refresh_token') {
      const uid = validRefresh.get(body.refresh_token);
      if (!uid) return json(route, req, 400, { code: 'refresh_token_not_found', error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found', message: 'Invalid Refresh Token: Refresh Token Not Found' });
      return json(route, req, 200, issue(byId(uid)));
    }
  }
  if (p === '/auth/v1/user') { const usr = byId(sub(req)); return usr ? json(route, req, 200, userObj(usr)) : json(route, req, 401, { message: 'bad jwt' }); }
  if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS(req) });
  if (p === '/rest/v1/agents') { const uid = sub(req); return json(route, req, 200, /pgrst\.object/.test(req.headers().accept || '') ? { subscription_status: 'active' } : [{ subscription_status: 'active' }]); }
  if (p === '/rest/v1/agent_profiles') {
    const uid = (u.searchParams.get('user_id') || '').replace('eq.', '') || sub(req);
    if (m === 'GET') { const row = profiles[uid]; return json(route, req, 200, /pgrst\.object/.test(req.headers().accept || '') ? (row || null) : (row ? [row] : [])); }
    if (m === 'PATCH') return route.fulfill({ status: 204, headers: CORS(req) });
    if (m === 'POST') { const row = JSON.parse(req.postData()); profiles[row.user_id] = { ...(profiles[row.user_id] || {}), ...row }; return route.fulfill({ status: 201, headers: CORS(req) }); }
  }
  return json(route, req, 200, []);
}

(async () => {
  await new Promise(r => server.listen(0, r)); const BASE = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  let fails = 0; const ok = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) fails++; };
  async function newCtx(init) {
    const ctx = await browser.newContext();
    await ctx.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(BASE)) return route.continue();
      if (url.startsWith(SB)) return handleSupabase(route);
      if (url === 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2') return route.fulfill({ status: 200, contentType: 'text/javascript', body: SUPA_JS });
      if (url.startsWith('https://app.privency.fr/api/fiche-publish')) {
        const req = route.request(); const body = JSON.parse(req.postData());
        published.push({ uid: sub(req), filename: body.filename, agentIdInHtml: (body.html.match(/PRIVENCY_AGENT_ID = "([^"]+)"/) || [])[1] });
        return json(route, req, 200, { ok: true, url: 'https://fiches.test/' + body.filename });
      }
      if (url.startsWith('https://app.privency.fr/')) return json(route, route.request(), 200, {});
      if (url.startsWith('https://checkout.stripe.test/')) return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Stripe</body></html>' });
      return route.abort();
    });
    if (init) await ctx.addInitScript(init);
    return ctx;
  }
  const visible = async page => page.waitForFunction(() => document.body && getComputedStyle(document.body).display !== 'none' && !document.getElementById('auth-guard-hide'), null, { timeout: 8000 });
  const uidOf = page => page.evaluate(() => sessionStorage.getItem('privency_active_uid'));
  // remember=true : case « Mémoriser ce compte » cochée (comportement historique des scénarios 1-4).
  const loginOn = async (page, u, remember = true) => {
    await page.goto(BASE + '/login.html');
    if (await page.locator('#chooser-box').isVisible()) await page.click('#add-account-btn');
    await page.fill('#email', u.email); await page.fill('#password', u.pw);
    if (remember) await page.check('#remember');
    await Promise.all([page.waitForURL('**/app.html'), page.click('#submit-btn')]);
    await visible(page);
  };

  // ═════ Scénario principal : UN seul profil, deux onglets ═════
  const ctx = await newCtx();
  const pageErrors = []; ctx.on('page', p => p.on('pageerror', e => pageErrors.push(String(e))));
  const pA = await ctx.newPage(); await loginOn(pA, USERS.A);
  ok(await uidOf(pA) === USERS.A.id, 'A connecté dans l’onglet 1 (uid actif = A)');
  await pA.waitForFunction(() => document.title.startsWith('Olivier'));
  ok((await pA.title()) === 'Olivier · Privency', 'titre onglet 1 = « Olivier · Privency » (' + await pA.title() + ')');

  const pB = await ctx.newPage();
  await pB.goto(BASE + '/login.html');
  ok(await pB.locator('#chooser-box').isVisible() && (await pB.locator('.account-name').allTextContents()).join() === 'Olivier Alpha', 'nouvel onglet : « Qui êtes-vous ? » liste A (' + (await pB.locator('.account-name').allTextContents()).join() + ')');
  ok(await pB.locator('#chooser-box h2').textContent() === 'Qui êtes-vous ?', 'titre de l’écran = Qui êtes-vous ?');
  ok(await uidOf(pB) === null, 'aucun compte actif dans le nouvel onglet');
  await pB.click('#add-account-btn'); await pB.fill('#email', USERS.B.email); await pB.fill('#password', USERS.B.pw); await pB.check('#remember');
  await Promise.all([pB.waitForURL('**/app.html'), pB.click('#submit-btn')]); await visible(pB);
  ok(await uidOf(pB) === USERS.B.id, 'B connecté dans l’onglet 2');
  await pB.waitForFunction(() => document.title.startsWith('Béatrice'));
  ok((await pB.title()) === 'Béatrice · Privency', 'titre onglet 2 = « Béatrice · Privency »');
  ok(await uidOf(pA) === USERS.A.id, 'onglet 1 toujours sur A après connexion de B');
  ok((await pA.title()) === 'Olivier · Privency', 'titre onglet 1 inchangé');

  // A n'a pas été déconnecté « en douce » (BroadcastChannel isolé)
  await pA.waitForTimeout(1200);
  ok(pA.url().includes('/app.html'), 'onglet 1 toujours sur app.html après le login de B');
  const sessKeys = await pA.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('privency-auth-')));
  ok(sessKeys.length === 2, 'deux sessions distinctes en localStorage : ' + sessKeys.map(k => k.slice(0, 22) + '…').join(', '));

  // Modifier le profil dans B, recharger A
  await pB.evaluate(() => { document.getElementById('agent-nom').value = 'Bravo Modifie'; document.getElementById('agent-tel').value = '0600000002'; saveProfile(); });
  await pB.waitForTimeout(600);
  await pA.reload(); await visible(pA);
  ok(await uidOf(pA) === USERS.A.id && pA.url().includes('/app.html'), 'A rechargé : reste A');
  await pA.waitForTimeout(500);
  const profA = await pA.evaluate(() => JSON.parse(PrivencyAuth.lsGet('_agent_profile') || 'null'));
  ok(profA && profA.nom === 'Alpha' && profA.prenom === 'Olivier', 'profil de A intact après modification de B (' + JSON.stringify(profA && [profA.prenom, profA.nom]) + ')');
  ok(profiles[USERS.A.id].nom === 'Alpha' && profiles[USERS.B.id].nom === 'Bravo Modifie', 'côté serveur : A inchangé, B modifié');
  const hdrA = await pA.textContent('#header-name'); ok(/Olivier/.test(hdrA), 'en-tête de A = ' + hdrA);
  const profB = await pB.evaluate(() => JSON.parse(PrivencyAuth.lsGet('_agent_profile')));
  ok(profB.nom === 'Bravo Modifie', 'cache de B modifié');

  // Publier une fiche depuis chaque onglet
  for (const [pg, name] of [[pA, 'fiche-a'], [pB, 'fiche-b']]) {
    await pg.evaluate(n => { window._lastGeneratedHTML = '<html><body>' + n + '</body></html>'; window._lastGeneratedSlug = n; pushToGitHub(); }, name);
    await pg.waitForFunction(() => /Publié/.test(document.getElementById('gh-push-status').textContent), null, { timeout: 8000 });
  }
  ok(published.length === 2 && published[0].uid === USERS.A.id && published[1].uid === USERS.B.id, 'publication : jeton A pour fiche-a, jeton B pour fiche-b ' + JSON.stringify(published.map(x => x.filename + '@' + (byId(x.uid) || {}).prenom)));
  ok(published.every(x => x.agentIdInHtml === x.uid), 'PRIVENCY_AGENT_ID injecté = agent de l’onglet');
  const nb = await pA.evaluate(ids => ids.map(id => localStorage.getItem('privency_nb_fiches_publiees:' + id)), [USERS.A.id, USERS.B.id]);
  ok(nb.join() === '1,1', 'compteur de fiches scopé par compte : ' + nb.join());
  ok(await pA.evaluate(() => localStorage.getItem('privency_nb_fiches_publiees')) === null, 'aucune clé non scopée privency_nb_fiches_publiees');

  // Brouillons scopés
  await pA.evaluate(() => saveDraftBien()); await pB.evaluate(() => { document.title; localStorage.setItem('_draft_bien:' + PrivencyAuth.activeUid(), '{"type":"B"}'); });
  const drafts = await pA.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('_draft_bien')));
  ok(drafts.length === 2 && drafts.every(k => k.includes(':')), 'brouillons scopés : ' + drafts.map(k => k.slice(0, 20) + '…').join(', '));

  // Nouvel onglet : Qui êtes-vous ? avec A et B (nom + prénom depuis le cache scopé)
  const pC = await ctx.newPage(); await pC.goto(BASE + '/app.html');
  await pC.waitForURL('**/login.html');
  ok((await pC.locator('.account-name').allTextContents()).join('|') === 'Béatrice Bravo Modifie|Olivier Alpha', 'onglet 3 : Qui êtes-vous ? = ' + (await pC.locator('.account-name').allTextContents()).join('|'));
  ok(await pC.locator('.account-remove').count() === 2 && await pC.locator('#add-account-btn').isVisible(), 'boutons « Retirer ce compte » et « Ajouter un compte » présents');
  // clic sur A sans mot de passe
  await Promise.all([pC.waitForURL('**/app.html'), pC.locator('.account-item', { hasText: 'Olivier' }).locator('.account-pick').click()]); await visible(pC);
  ok(await uidOf(pC) === USERS.A.id, 'clic sur A → activé sans mot de passe');

  // Retour Stripe (checkout / portail) dans le même onglet
  await pB.goto('https://checkout.stripe.test/pay');
  await pB.goto(BASE + '/app.html?checkout=success'); await visible(pB);
  ok(await uidOf(pB) === USERS.B.id && pB.url().includes('checkout=success'), 'retour Stripe (aller-retour cross-origin) : l’onglet reste sur B');
  await pB.goto('https://checkout.stripe.test/portal'); await pB.goBack(); await visible(pB);
  ok(await uidOf(pB) === USERS.B.id, 'retour portail Stripe (goBack) : reste sur B');

  // Déconnexion de B ne déconnecte pas A
  const before = await pA.evaluate(id => localStorage.getItem('privency-auth-' + id) !== null, USERS.A.id);
  await Promise.all([pB.waitForURL('**/login.html'), pB.click('#logout-btn')]);
  await pA.waitForTimeout(1200);
  ok(before && pA.url().includes('/app.html') && pC.url().includes('/app.html'), 'B déconnecté : onglets A (1 et 3) restent sur app.html');
  const left = await pA.evaluate(([a, b]) => ({ a: localStorage.getItem('privency-auth-' + a) !== null, b: localStorage.getItem('privency-auth-' + b) !== null, profB: localStorage.getItem('_agent_profile:' + b), profA: localStorage.getItem('_agent_profile:' + a) !== null, draftB: localStorage.getItem('_draft_bien:' + b) }), [USERS.A.id, USERS.B.id]);
  ok(left.a && !left.b && left.profA && left.profB === null && left.draftB === null, 'session + cache de B supprimés, ceux de A intacts ' + JSON.stringify(left));
  await pA.reload(); await visible(pA); ok(await uidOf(pA) === USERS.A.id, 'A rechargé après déconnexion de B : toujours connecté');
  await pA.evaluate(() => PrivencyAuth.getClient().auth.getSession()).then(r => ok(!!r.data.session && r.data.session.user.id === USERS.A.id, 'session Supabase de A valide'));

  // « Changer de compte »
  await Promise.all([pC.waitForURL('**/login.html'), pC.click('#switch-account-btn')]);
  ok(await uidOf(pC) === null && await pC.locator('#chooser-box').isVisible(), '« Changer de compte » : onglet sans compte actif + Qui êtes-vous ?');
  ok(await pC.evaluate(id => localStorage.getItem('privency-auth-' + id) !== null, USERS.A.id), '…mais la session de A est conservée');
  // « Retirer ce compte »
  pC.once('dialog', d => d.accept());
  await pC.locator('.account-remove').click(); await pC.waitForTimeout(500);
  ok(await pC.evaluate(id => Object.keys(localStorage).filter(k => k.includes(id)).length, USERS.A.id) === 0 && await pC.locator('#login-box').isVisible(), '« Retirer ce compte » : plus aucune clé de A, formulaire de connexion affiché');
  ok(pageErrors.length === 0, 'aucune erreur JS de page' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
  await ctx.close();

  // ═════ Refresh token expiré → mot de passe redemandé ═════
  const ctx2 = await newCtx();
  const q1 = await ctx2.newPage(); await loginOn(q1, USERS.A);
  const rt = await q1.evaluate(id => JSON.parse(localStorage.getItem('privency-auth-' + id)).refresh_token, USERS.A.id);
  // access token expiré + refresh révoqué
  await q1.evaluate(id => { const k = 'privency-auth-' + id; const s = JSON.parse(localStorage.getItem(k)); s.expires_at = 1; localStorage.setItem(k, JSON.stringify(s)); }, USERS.A.id);
  validRefresh.delete(rt);
  const q2 = await ctx2.newPage(); await q2.goto(BASE + '/login.html');
  await q2.locator('.account-pick').click();
  await q2.waitForSelector('#login-box', { state: 'visible' });
  ok(await q2.inputValue('#email') === USERS.A.email && /expiré/.test(await q2.textContent('#error-message')), 'refresh token expiré : mot de passe redemandé, e-mail prérempli');
  ok(await q2.isChecked('#remember'), 'compte mémorisé à re-authentifier : case « Mémoriser » recochée');
  await q2.fill('#password', USERS.A.pw); await Promise.all([q2.waitForURL('**/app.html'), q2.click('#submit-btn')]); await visible(q2);
  ok(await uidOf(q2) === USERS.A.id, '…reconnexion OK');
  await ctx2.close();

  // ═════ Migration : ancienne session unique + clés non scopées ═════
  const legacy = issue(USERS.A);
  const ctx3 = await newCtx(`(() => { if (localStorage.getItem('__seeded')) return; localStorage.setItem('__seeded','1');
    localStorage.setItem('sb-hhqcumnatnslfjpsrmgb-auth-token', ${JSON.stringify(JSON.stringify(legacy))});
    localStorage.setItem('_agent_profile', '{"prenom":"Olivier","nom":"Alpha"}'); localStorage.setItem('_draft_bien', '{"x":1}');
    localStorage.setItem('privency_tip_premiere_fiche_publiee', '1'); localStorage.setItem('privency_nb_fiches_publiees', '7'); })();`);
  const m1 = await ctx3.newPage(); await m1.goto(BASE + '/app.html'); await visible(m1);
  ok(await uidOf(m1) === USERS.A.id, 'migration : l’onglet déjà connecté reste sur son compte');
  const mig = await m1.evaluate(id => ({ keys: Object.keys(localStorage).sort(), nb: localStorage.getItem('privency_nb_fiches_publiees:' + id) }), USERS.A.id);
  ok(mig.nb === '7' && !mig.keys.some(k => ['_draft_bien', '_agent_profile', 'privency_nb_fiches_publiees', 'privency_tip_premiere_fiche_publiee', 'sb-hhqcumnatnslfjpsrmgb-auth-token'].includes(k)) && mig.keys.includes('_draft_bien:' + USERS.A.id) && mig.keys.includes('privency_tip_premiere_fiche_publiee:' + USERS.A.id), 'anciennes clés déplacées vers le compte puis supprimées : ' + mig.keys.map(k => k.replace(USERS.A.id, '<A>')).join(', '));
  await ctx3.close();

  // ═════ Retour par lien e-mail (#access_token) dans un onglet neuf ═════
  const s = issue(USERS.B);
  const ctx4 = await newCtx();
  const e1 = await ctx4.newPage(); await e1.goto(BASE + '/app.html#access_token=' + s.access_token + '&refresh_token=' + s.refresh_token + '&expires_in=3600&token_type=bearer&type=signup'); await visible(e1);
  ok(await uidOf(e1) === USERS.B.id && !e1.url().includes('access_token'), 'retour par lien (hash) : session adoptée sous le bon compte, URL nettoyée');
  ok(await e1.evaluate(id => localStorage.getItem('privency-auth-' + id) === null && sessionStorage.getItem('privency-auth-' + id) !== null && sessionStorage.getItem('privency_active_mode') === 'session', USERS.B.id), 'retour par lien : session en sessionStorage (non mémorisée), rien dans localStorage');
  const e2 = await ctx4.newPage(); await e2.goto(BASE + '/login.html');
  ok(await e2.locator('#chooser-box').isHidden(), 'retour par lien : compte non listé dans « Qui êtes-vous ? »');
  await ctx4.close();

  // Lien e-mail pour un compte DÉJÀ mémorisé → reste mémorisé (localStorage)
  const ctx4b = await newCtx();
  const f1 = await ctx4b.newPage(); await loginOn(f1, USERS.B, true);
  const s2 = issue(USERS.B); const f2 = await ctx4b.newPage();
  await f2.goto(BASE + '/app.html#access_token=' + s2.access_token + '&refresh_token=' + s2.refresh_token + '&type=magiclink'); await visible(f2);
  ok(await f2.evaluate(() => sessionStorage.getItem('privency_active_mode')) === null && await f2.evaluate(id => localStorage.getItem('privency-auth-' + id) !== null, USERS.B.id), 'lien e-mail sur compte déjà mémorisé : reste mémorisé (localStorage)');
  await ctx4b.close();

  // ═════ Option « Mémoriser ce compte sur cet ordinateur » ═════
  const ctx5 = await newCtx();
  const errs5 = []; ctx5.on('page', p => p.on('pageerror', e => errs5.push(String(e))));
  const r0 = await ctx5.newPage(); await r0.goto(BASE + '/login.html');
  ok(await r0.locator('#remember').isVisible() && !(await r0.isChecked('#remember')), 'case « Mémoriser ce compte » présente et DÉCOCHÉE par défaut');
  ok(/Mémoriser ce compte sur cet ordinateur/.test(await r0.textContent('.remember-label')) && /uniquement sur votre ordinateur personnel ou professionnel/.test(await r0.textContent('.remember-help')), 'libellé et texte d’aide conformes');
  // (a) connexion case décochée
  await loginOn(r0, USERS.A, false);
  ok(await uidOf(r0) === USERS.A.id && (await r0.title()) !== '' , '(a) A connecté, case décochée');
  await r0.waitForTimeout(500);
  const dump = await r0.evaluate(() => ({ ls: Object.keys(localStorage), ss: Object.keys(sessionStorage) }));
  ok(!dump.ls.some(k => k.includes('11111111')), '(a) aucune session ni donnée de A dans localStorage : ' + JSON.stringify(dump.ls));
  ok(dump.ss.includes('privency-auth-' + USERS.A.id) && dump.ss.includes('_agent_profile:' + USERS.A.id), '(a) session + cache de A dans sessionStorage');
  const r1 = await ctx5.newPage(); await r1.goto(BASE + '/login.html');
  ok(await r1.locator('#chooser-box').isHidden() && await r1.locator('#login-box').isVisible(), '(a) nouvel onglet : A absent de « Qui êtes-vous ? » (formulaire e-mail/mot de passe)');
  await r1.goto(BASE + '/app.html'); await r1.waitForURL('**/login.html');
  ok(await r1.locator('#login-box').isVisible(), '(a) app.html dans un nouvel onglet : redirigé vers la connexion');
  // rechargement du MÊME onglet : la session d’onglet survit
  await r0.reload(); await visible(r0);
  ok(await uidOf(r0) === USERS.A.id, '(a) rechargement du même onglet : toujours connecté');
  // fonctionnement normal en mode non mémorisé : publication + cache scopé en sessionStorage
  await r0.evaluate(() => { window._lastGeneratedHTML = '<html><body>x</body></html>'; window._lastGeneratedSlug = 'fiche-nm'; pushToGitHub(); });
  await r0.waitForFunction(() => /Publié/.test(document.getElementById('gh-push-status').textContent), null, { timeout: 8000 });
  ok(await r0.evaluate(id => sessionStorage.getItem('privency_nb_fiches_publiees:' + id) === '1' && Object.keys(localStorage).every(k => !k.includes(id)), USERS.A.id), '(a) compteur de fiches en sessionStorage, rien dans localStorage');
  // (c) fermer l’onglet puis rouvrir
  await r0.close();
  const r2 = await ctx5.newPage(); await r2.goto(BASE + '/app.html'); await r2.waitForURL('**/login.html');
  ok(await r2.locator('#login-box').isVisible() && await r2.locator('#chooser-box').isHidden() && await uidOf(r2) === null, '(c) onglet fermé puis app rouverte : e-mail et mot de passe redemandés');
  ok(await r2.evaluate(() => Object.keys(localStorage).length) === 0, '(c) localStorage totalement vide (aucune donnée d’agent)');
  // (b) connexion case cochée
  await r2.fill('#email', USERS.B.email); await r2.fill('#password', USERS.B.pw); await r2.check('#remember');
  await Promise.all([r2.waitForURL('**/app.html'), r2.click('#submit-btn')]); await visible(r2);
  const dumpB = await r2.evaluate(() => ({ ls: Object.keys(localStorage), ss: Object.keys(sessionStorage) }));
  ok(dumpB.ls.includes('privency-auth-' + USERS.B.id) && !dumpB.ss.includes('privency-auth-' + USERS.B.id), '(b) session de B en localStorage (mémorisée)');
  await r2.waitForFunction(id => localStorage.getItem('_agent_profile:' + id), USERS.B.id);
  const r3 = await ctx5.newPage(); await r3.goto(BASE + '/login.html');
  ok((await r3.locator('.account-name').allTextContents()).join() === 'Béatrice Bravo Modifie', '(b) B listé dans « Qui êtes-vous ? » (' + (await r3.locator('.account-name').allTextContents()).join() + ')');
  await Promise.all([r3.waitForURL('**/app.html'), r3.locator('.account-pick').click()]); await visible(r3);
  ok(await uidOf(r3) === USERS.B.id, '(b) clic sur B : activé sans mot de passe');
  // pas de mélange : un compte non mémorisé (A) dans un 3e onglet à côté du compte mémorisé (B)
  const r4 = await ctx5.newPage(); await loginOn(r4, USERS.A, false);
  await r4.waitForTimeout(500);
  const lsNow = await r4.evaluate(() => Object.keys(localStorage));
  ok(lsNow.every(k => !k.includes('11111111')) && lsNow.some(k => k.includes('22222222')), 'pas de mélange : localStorage ne contient que B (mémorisé), rien de A (non mémorisé)');
  const r5 = await ctx5.newPage(); await r5.goto(BASE + '/login.html');
  ok((await r5.locator('.account-name').allTextContents()).length === 1, 'chooser : seul le compte mémorisé est listé');
  // déconnexion d’un compte non mémorisé : sessionStorage purgé, B intact
  await Promise.all([r4.waitForURL('**/login.html'), r4.click('#logout-btn')]);
  const after = await r4.evaluate(() => ({ ss: Object.keys(sessionStorage), ls: Object.keys(localStorage) }));
  ok(after.ss.every(k => !k.includes('11111111')) && after.ls.some(k => k === 'privency-auth-' + USERS.B.id), 'déconnexion non mémorisé : sessionStorage purgé, session mémorisée de B intacte ' + JSON.stringify(after.ss));
  ok(r3.url().includes('/app.html') && r2.url().includes('/app.html'), 'les onglets de B restent connectés');
  // Décochée sur un compte DÉJÀ mémorisé : ne rien retirer
  const r6 = await ctx5.newPage(); await r6.goto(BASE + '/login.html'); await r6.click('#add-account-btn');
  await r6.fill('#email', USERS.B.email); await r6.fill('#password', USERS.B.pw);
  await Promise.all([r6.waitForURL('**/app.html'), r6.click('#submit-btn')]); await visible(r6);
  ok(await r6.evaluate(id => localStorage.getItem('privency-auth-' + id) !== null && sessionStorage.getItem('privency-auth-' + id) !== null && sessionStorage.getItem('privency_active_mode') === 'session', USERS.B.id), 'décochée sur compte mémorisé : session mémorisée conservée, cet onglet en mode non mémorisé');
  await r6.waitForTimeout(800);
  ok(r3.url().includes('/app.html'), '…et l’onglet mémorisé de B n’est pas déconnecté');
  // Déconnexion de l’onglet non mémorisé de B : la session mémorisée de B reste
  await Promise.all([r6.waitForURL('**/login.html'), r6.click('#logout-btn')]);
  await r3.waitForTimeout(800);
  ok(r3.url().includes('/app.html') && await r3.evaluate(id => localStorage.getItem('privency-auth-' + id) !== null, USERS.B.id), '…déconnecter l’onglet non mémorisé de B laisse la session mémorisée de B intacte');
  // Cochée sur un compte non mémorisé : la session passe en localStorage
  const r7 = await ctx5.newPage(); await loginOn(r7, USERS.A, false);
  await r7.evaluate(() => PrivencyAuth.switchAccount()); // non mémorisé : « Changer de compte » = déconnexion propre
  await r7.waitForURL('**/login.html');
  ok(await r7.evaluate(() => Object.keys(sessionStorage).filter(k => k.includes('11111111')).length) === 0, '« Changer de compte » sur un compte non mémorisé : session d’onglet purgée');
  const r8 = await ctx5.newPage(); await loginOn(r8, USERS.A, false);
  await r8.goto(BASE + '/login.html'); // même onglet, toujours en mode non mémorisé
  await r8.evaluate(() => sessionStorage.removeItem('privency_active_uid')); // simule un onglet sans compte actif
  await r8.reload(); if (await r8.locator('#chooser-box').isVisible()) await r8.click('#add-account-btn');
  await r8.fill('#email', USERS.A.email); await r8.fill('#password', USERS.A.pw); await r8.check('#remember');
  await Promise.all([r8.waitForURL('**/app.html'), r8.click('#submit-btn')]); await visible(r8);
  ok(await r8.evaluate(id => localStorage.getItem('privency-auth-' + id) !== null && sessionStorage.getItem('privency-auth-' + id) === null && sessionStorage.getItem('privency_active_mode') === null, USERS.A.id), 'cochée sur compte non mémorisé : la session passe en localStorage (et quitte le sessionStorage)');
  // « Retirer ce compte » supprime la session mémorisée
  const r9 = await ctx5.newPage(); await r9.goto(BASE + '/login.html'); r9.once('dialog', d => d.accept());
  await r9.locator('.account-item', { hasText: 'Olivier' }).locator('.account-remove').click(); await r9.waitForTimeout(500);
  ok(await r9.evaluate(id => Object.keys(localStorage).filter(k => k.includes(id)).length, USERS.A.id) === 0, '« Retirer ce compte » : session mémorisée supprimée');
  ok(errs5.length === 0, 'aucune erreur JS de page (scénario mémorisation)' + (errs5.length ? ' : ' + errs5.join(' | ') : ''));
  await ctx5.close();

  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' ÉCHEC(S)' : '\nTOUS LES TESTS PASSENT');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
