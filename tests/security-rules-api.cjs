const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const project=process.env.FIREBASE_PROJECT_ID; if(!project)throw Error('Set FIREBASE_PROJECT_ID explicitly');
async function main(){
 const cfg=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/configstore/firebase-tools.json'),'utf8'));
 let token=cfg.tokens.access_token;
 if(cfg.tokens.expires_at<Date.now()+60000){
  const api=require(path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib/api.js'));
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:cfg.tokens.refresh_token,client_id:api.clientId(),client_secret:api.clientSecret()})});
  const j=await r.json();if(!r.ok)throw Error('OAuth refresh failed '+r.status);token=j.access_token;
 }
 async function call(url,method='GET',body){const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw Error('API '+r.status+' '+JSON.stringify(j.error?.message));return j;}
 const uid='security-review-fixture';
 const valid={uid,nickname:'Fixture',name:'Fixture',photoURL:'',schoolCode:'OWN',schoolName:'Test',mastered:1,done:2,totalAnswered:3,totalCorrect:1,totalWrong:2,accuracy:33.3};
 const cases=[
  ['stopped user delete','users','delete',{disabledInApp:true,schoolCode:null},null],
  ['stopped user ranking write','rankings','create',null,{schoolCode:'OTHER',mastered:999999}],
  ['foreign school ranking','rankingsKobun','create',null,{schoolCode:'OTHER',mastered:999999}],
  ['anonymous other user read','users','get',{schoolCode:'OTHER'},null],
  ...['rankings','rankingsKobun'].flatMap(col=>[
    ['valid '+col,col,'create',null,valid,'ALLOW',false],
    ['wrong school '+col,col,'create',null,{...valid,schoolCode:'OTHER'},'DENY',false],
    ['negative score '+col,col,'create',null,{...valid,mastered:-1},'DENY',false],
    ['overflow score '+col,col,'create',null,{...valid,mastered:999999,done:999999},'DENY',false],
    ['forged admin field '+col,col,'create',null,{...valid,disabledInApp:false},'DENY',false],
    ['legitimate update '+col,col,'update',{...valid,disabledInApp:false},{...valid,disabledInApp:false},'ALLOW',false]
  ]),
  ['normal profile update','users','update',{schoolCode:'OWN'},{schoolCode:'OWN',profileNickname:'Fixture'},'ALLOW',false],
  ['suspended profile update','users','update',{schoolCode:'OWN',disabledInApp:true},{schoolCode:'OWN',disabledInApp:true,profileNickname:'Fixture'},'DENY',true],
  ['admin profile delete','users','delete',{schoolCode:'OWN'},null,'ALLOW',false,true],
  ['teacher same school','users','get',{schoolCode:'OWN'},null,'ALLOW',false,false,'teacher','other-user'],
  ['teacher wrong school','users','get',{schoolCode:'OTHER'},null,'DENY',false,false,'teacher','other-user'],
  ['stopped teacher','users','get',{schoolCode:'OWN'},null,'DENY',true,false,'teacher','other-user'],
  ['student other user','users','get',{schoolCode:'OWN'},null,'DENY',false,false,'user','other-user']
 ];
 const source={files:[{name:'firestore.rules',content:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}]};
 const suite=cases.map(([name,col,method,old,data,expectation='DENY',stopped=true,admin=false,role='user',targetUid=uid])=>({expectation,request:{path:`/databases/(default)/documents/${col}/${targetUid}`,method,auth:col==='users'&&method==='get'&&name==='anonymous other user read'?null:{uid,token:{email:admin?cfg.user.email:'fixture@example.invalid',email_verified:admin}},resource:{data:data||{}}},resource:old?{data:old}:null,functionMocks:[{function:'get',args:[{anyValue:{}}],result:{value:{data:{disabledInApp:stopped,schoolCode:'OWN',role}}}},{function:'exists',args:[{anyValue:{}}],result:{value:true}}]}));
 const tested=await call(`https://firebaserules.googleapis.com/v1/projects/${project}:test`,'POST',{source,testSuite:{testCases:suite}});
 const result={issues:tested.issues||[],cases:cases.map((c,i)=>({name:c[0],...(tested.testResults||[])[i]}))};
 console.log(JSON.stringify({issues:result.issues,cases:result.cases.map(c=>({name:c.name,state:c.state}))},null,2));
 if(result.issues.some(i=>i.severity==='ERROR')||result.cases.length!==cases.length||result.cases.some(c=>c.state!=='SUCCESS'))throw Error('Rules tests failed');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
