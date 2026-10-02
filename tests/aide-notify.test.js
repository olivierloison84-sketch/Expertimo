// Test de l'API aide-notify avec Supabase et Resend simulés.
const Module=require('module'),path=require('path');
let rows={aide_questions:{id:'11111111-1111-1111-1111-111111111111',agent_user_id:'u1',question:'Comment <b>faire</b> ?'}},sent=[];
const fake={createClient:()=>({auth:{getUser:async j=>j==='good'?{data:{user:{id:'u1',email:'a@b.fr'}}}:{data:{},error:{}}},from:t=>({select:()=>({eq:(c,id)=>({maybeSingle:async()=>({data:t==='agent_profiles'?{prenom:'Ana',nom:'D'}:(rows[t]&&rows[t].id===id?rows[t]:null)})}),eq2:0})})})};
const orig=Module._load;Module._load=function(r,...a){return r==='@supabase/supabase-js'?fake:orig.call(this,r,...a)};
process.env.SUPABASE_SECRET_KEY='k';process.env.RESEND_API_KEY='r';
global.fetch=async(u,o)=>{sent.push(JSON.parse(o.body));return{ok:true}};
const h=require('../api/aide-notify.js');let fail=0;const ok=(c,m)=>{console.log(c?'ok':'FAIL',m);if(!c)fail++};
const mk=(o={})=>{const r={code:0,h:{},status(c){r.code=c;return r},json(b){r.body=b;return r},end(){return r},setHeader(){}};return r};
const call=async(headers,body)=>{const r=mk();await h({method:'POST',headers:Object.assign({origin:'https://app.privency.fr'},headers),body},r);return r};
(async()=>{
 let r=await call({},{kind:'question',id:rows.aide_questions.id});ok(r.code===401,'sans jeton refusé');
 r=await call({authorization:'Bearer bad'},{kind:'question',id:rows.aide_questions.id});ok(r.code===401,'jeton invalide refusé');
 r=await call({authorization:'Bearer good',origin:'https://evil.com'},{kind:'question',id:rows.aide_questions.id});ok(r.code===403,'origine refusée');
 r=await call({authorization:'Bearer good'},{kind:'question',id:'22222222-2222-2222-2222-222222222222'});ok(r.code===404&&!sent.length,'ligne inconnue ignorée');
 rows.aide_questions.agent_user_id='autre';r=await call({authorization:'Bearer good'},{kind:'question',id:rows.aide_questions.id});ok(r.code===404&&!sent.length,'ligne d\'un autre agent ignorée');
 rows.aide_questions.agent_user_id='u1';r=await call({authorization:'Bearer good'},{kind:'question',id:rows.aide_questions.id});
 ok(r.code===200&&sent.length===1&&sent[0].to[0]==='contact@privency.fr'&&/Ana D/.test(sent[0].subject)&&!/<b>faire/.test(sent[0].html),'mail envoyé, texte échappé');
 process.exit(fail?1:0)})();
