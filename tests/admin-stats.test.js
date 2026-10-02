// admin-stats : essais exclus du MRR, messages joints, accès réservé. Supabase et Stripe simulés.
const Module=require('module');
const AG=[{id:'a1',email:'pay@x.fr',subscription_status:'active',stripe_subscription_id:'sub_pay',created_at:'2026-09-01'},
{id:'a2',email:'essai@x.fr',subscription_status:'active',stripe_subscription_id:'sub_try',created_at:'2026-10-01'},
{id:'a3',email:'x+test@x.fr',subscription_status:'active',stripe_subscription_id:'sub_t',created_at:'2026-10-01'}];
const T={agents:AG,agent_profiles:[{user_id:'a1',prenom:'Ana',nom:'D'}],agent_fiches:[],fiche_views:[],
aide_questions:[{id:'q1',agent_user_id:'a1',question:'Q ?',created_at:'2026-10-02'}],agent_idees:[{id:'i1',agent_user_id:'a2',categorie:'bug',message:'M',created_at:'2026-10-02'}]};
const q=t=>{const o={select:()=>o,gte:()=>o,order:()=>o,limit:()=>o,then:f=>f({data:T[t]})};return o};
const fake={'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async j=>j==='admin'?{data:{user:{id:'79e4e432-2232-4d2c-b41d-8c7c907c4dec'}}}:j==='other'?{data:{user:{id:'zz'}}}:{data:{},error:{}}},from:q})},
stripe:()=>({subscriptions:{list:async()=>({data:[{id:'sub_try',trial_end:1791000000}]})}})};
const orig=Module._load;Module._load=function(r,...a){return fake[r]||orig.call(this,r,...a)};
process.env.SUPABASE_SECRET_KEY='k';process.env.STRIPE_SECRET_KEY='s';
const h=require('../api/admin-stats.js');let fail=0;const ok=(c,m)=>{console.log(c?'ok':'FAIL',m);if(!c)fail++};
const call=async(tok)=>{const r={code:0,status(c){r.code=c;return r},json(b){r.body=b;return r},end(){return r},setHeader(){}};
await h({method:'GET',headers:{origin:'https://app.privency.fr',authorization:tok?'Bearer '+tok:''}},r);return r};
(async()=>{
 ok((await call(''))?.code===401,'sans jeton refusé');
 ok((await call('other')).code===403,'autre utilisateur refusé');
 const r=await call('admin');const b=r.body;
 ok(r.code===200,'admin accepté');
 ok(b.totaux.mrr_total===69&&b.totaux.nb_essais_en_cours===1,'essai exclu du MRR (69 €), 1 essai');
 ok(b.clients.find(c=>c.id==='a2').en_essai===true&&b.clients.find(c=>c.id==='a2').fin_essai,'fin d\'essai renseignée');
 ok(b.messages.questions[0].agent==='Ana D'&&b.messages.idees[0].agent==='essai@x.fr','messages avec nom de l\'agent');
 ok(b.comptes_internes.length===1,'compte test à part');
 process.exit(fail?1:0)})();
