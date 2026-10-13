// Essai 30 jours sans carte (code à usage unique) + lecture seule. Lancer : node tests/codes-essai.test.js
const Module = require('module'), assert = require('assert');

const state = { agents: {}, codes: {}, sessions: [], stripeFail: false };
function db() {
  return {
    auth: { getUser: async (jwt) => ({ data: { user: jwt === 'jwt-u1' ? { id: 'u1' } : null }, error: jwt === 'jwt-u1' ? null : {} }) },
    from(t) {
      const q = { t, f: [], upd: null, nulls: [] };
      const chain = {
        select() { q.sel = true; return chain; },
        update(v) { q.upd = v; return chain; },
        eq(k, v) { q.f.push([k, v]); return chain; },
        is(k, v) { q.nulls.push(k); return chain; },
        limit() { return chain; },
        maybeSingle: async () => ({ data: run(q)[0] || null, error: null }),
        then(res, rej) { return Promise.resolve({ data: run(q), error: null }).then(res, rej); }
      };
      return chain;
    }
  };
}
function run(q) {
  if (q.t === 'agents') { const a = state.agents[q.f[0][1]]; return a ? [a] : []; }
  const rows = Object.values(state.codes).filter(r => q.f.every(([k, v]) => r[k] === v) && q.nulls.every(k => r[k] == null));
  if (q.upd) rows.forEach(r => Object.assign(r, q.upd));
  return rows.map(r => ({ code: r.code }));
}
const orig = Module._load;
Module._load = function (req, ...a) {
  if (req === 'stripe') return () => ({ checkout: { sessions: { create: async (p) => { if (state.stripeFail) throw new Error('boom'); state.sessions.push(p); return { url: 'https://stripe/x' }; } } } });
  if (req === '@supabase/supabase-js') return { createClient: db };
  return orig.call(this, req, ...a);
};
process.env.STRIPE_SECRET_KEY = 'sk'; process.env.SUPABASE_SECRET_KEY = 'sb';
const checkout = require('../api/create-checkout.js');
const { verifierAbonnementActif } = require('../api/_abonnement.js');

function call(body, jwt) {
  return new Promise(resolve => {
    const res = { h: {}, setHeader() {}, status(c) { this.c = c; return this; }, json(j) { resolve({ c: this.c, j }); }, end() { resolve({ c: this.c }); } };
    checkout({ method: 'POST', body, headers: jwt ? { authorization: 'Bearer ' + jwt } : {} }, res);
  });
}
(async () => {
  state.codes.ABC = { code: 'ABC', utilise_par: null, utilise_le: null };
  state.agents.u1 = { stripe_customer_id: null };
  let r = await call({ user_id: 'u1', email: 'a@b.fr', code: 'zzz' }, 'jwt-u1'); assert.equal(r.c, 400); assert(/invalide/.test(r.j.error));
  r = await call({ user_id: 'u1', email: 'a@b.fr', code: 'abc' }); assert.equal(r.c, 401, 'JWT requis avec un code');
  r = await call({ user_id: 'u2', email: 'a@b.fr', code: 'abc' }, 'jwt-u1'); assert.equal(r.c, 401, 'JWT d\'un autre compte');
  state.stripeFail = true;
  r = await call({ user_id: 'u1', email: 'a@b.fr', code: ' abc ' }, 'jwt-u1'); assert.equal(r.c, 500);
  assert.equal(state.codes.ABC.utilise_par, null, 'code libéré si Stripe échoue');
  state.stripeFail = false;
  r = await call({ user_id: 'u1', email: 'a@b.fr', code: ' abc ' }, 'jwt-u1'); assert.equal(r.c, 200);
  const p = state.sessions[0];
  assert.equal(p.subscription_data.trial_period_days, 30); assert.equal(p.payment_method_collection, 'if_required');
  assert.equal(p.subscription_data.trial_settings.end_behavior.missing_payment_method, 'cancel');
  assert.equal(p.line_items[0].price, 'price_1UGLoSLkk3vvHRV1Vo5eFzv9');
  assert.equal(state.codes.ABC.utilise_par, 'u1'); assert(state.codes.ABC.utilise_le);
  r = await call({ user_id: 'u1', email: 'a@b.fr', code: 'abc' }, 'jwt-u1'); assert.equal(r.c, 400); assert(/déjà utilisé un code/.test(r.j.error));
  state.codes.XYZ = { code: 'XYZ', utilise_par: null }; state.agents.u1 = { stripe_customer_id: 'cus_1' };
  r = await call({ user_id: 'u1', email: 'a@b.fr', code: 'xyz' }, 'jwt-u1'); assert.equal(r.c, 400); assert.equal(state.codes.XYZ.utilise_par, null, 'code non consommé');
  state.agents.u1 = { stripe_customer_id: null }; state.codes.ABC.utilise_par = null; state.codes.USED = { code: 'USED', utilise_par: 'u9' }; state.sessions.length = 0;
  r = await call({ user_id: 'u1', email: 'a@b.fr', code: 'used' }, 'jwt-u1'); assert.equal(r.c, 400); assert(/déjà été utilisé/.test(r.j.error));
  // sans code : comportement inchangé (14 j avec carte)
  state.codes.ABC.utilise_par = null; r = await call({ user_id: 'u1', email: 'a@b.fr' });
  assert.equal(r.c, 200); assert.equal(state.sessions[0].payment_method_collection, 'always'); assert.equal(state.sessions[0].subscription_data.trial_period_days, 14);

  // garde lecture seule
  for (const [st, ok] of [['active', true], ['past_due', true], ['inactive', false], [null, false]]) {
    state.agents.z = { subscription_status: st };
    assert.equal((await verifierAbonnementActif(db(), 'z')).ok, ok, String(st));
  }
  assert.equal((await verifierAbonnementActif(db(), 'inconnu')).status, 403);
  console.log('ok codes-essai + lecture seule');
})().catch(e => { console.error(e); process.exit(1); });
