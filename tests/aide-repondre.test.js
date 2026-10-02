const Module=require('module');
let rows={'11111111-1111-1111-1111-111111111111':{}};let last=null;
const fake={'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async j=>j==='admin'?{data:{user:{id:'79e4e432-2232-4d2c-b41d-8c7c907c4dec'}}}:j==='agent'?{data:{user:{id:'u1'}}}:{data:{},error:{}}},
from:()=>({update:v=>({eq:(c,id)=>({select:async()=>{if(!rows[id])return{data:[]};last=v;return{data:[{id}]}}})})})})}};
const orig=Module._load;Module._load=function(r,...a){return fake[r]||orig.call(this,r,...a)};process.env.SUPABASE_SECRET_KEY='k';
const h=require('../api/aide-repondre.js');let fail=0;const ok=(c,m)=>{console.log(c?'ok':'FAIL',m);if(!c)fail++};
const call=async(tok,body,origin='https://app.privency.fr')=>{const r={code:0,status(c){r.code=c;return r},json(b){r.body=b;return r},end(){return r},setHeader(){}};await h({method:'POST',headers:{origin,authorization:tok?'Bearer '+tok:''},body},r);return r};
const id='11111111-1111-1111-1111-111111111111';
(async()=>{
ok((await call('',{id,reponse:'x'})).code===401,'sans jeton');
ok((await call('agent',{id,reponse:'x'})).code===403,'un agent ne peut pas répondre');
ok((await call('admin',{id,reponse:'x'},'https://evil.com')).code===403,'origine refusée');
ok((await call('admin',{id:'zz',reponse:'x'})).code===400,'id invalide');
ok((await call('admin',{id,reponse:'  '})).code===400,'réponse vide');
ok((await call('admin',{id:'22222222-2222-2222-2222-222222222222',reponse:'x'})).code===404,'question inconnue');
const r=await call('admin',{id,reponse:'Bonjour, voici la réponse'});
ok(r.code===200&&last.reponse==='Bonjour, voici la réponse'&&last.repondu_at,'réponse enregistrée');
process.exit(fail?1:0)})();
