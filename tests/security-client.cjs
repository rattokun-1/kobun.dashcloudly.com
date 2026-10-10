const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');
const pick=(name,next)=>source.slice(source.indexOf(name),source.indexOf(next,source.indexOf(name)));
async function suspension(data,failed=false){
 let signedOut=0;
 const ctx={isSchoolAdmin:()=>false,auth:{signOut:async()=>{signedOut++}},db:{collection:()=>({doc:()=>({get:async()=>{if(failed)throw Error('offline');return {exists:true,data:()=>data}}})})},showSuspendedOverlay(){},hideSuspendedOverlay(){},showSyncStatus(){},USER_SUSPENDED_MESSAGE:'stopped',console:{warn(){}}};
 vm.createContext(ctx);vm.runInContext(pick('async function enforceUserSuspendedState(', '\nasync function loadAdminDashboard'),ctx);
 return {blocked:await ctx.enforceUserSuspendedState({uid:'fixture'}),signedOut};
}
(async()=>{
 assert.deepEqual(await suspension({},true),{blocked:true,signedOut:1});
 assert.deepEqual(await suspension({disabledInApp:true}),{blocked:true,signedOut:1});
 assert.deepEqual(await suspension({disabledInApp:false}),{blocked:false,signedOut:0});
 const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
 const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 const ctx={escapeHtml:esc,normalizeSchoolCode:x=>x};vm.createContext(ctx);
 vm.runInContext(pick('function renderAdminUserRows(', '\nfunction filterAdminUserRows('),ctx);
 for(const id of ['ordinary',"x');globalThis.injected=true;//",'x"\\\n<>&']){
  const html=ctx.renderAdminUserRows([{id,role:'user'}]);
  const handlers=[...html.matchAll(/onclick="([^"]*)"/g)].map(m=>decode(m[1]));
  assert.equal(handlers.length,3);
  for(const handler of handlers){let received;const env={saveAdminUserProfile:x=>received=x,toggleAdminUserSuspended:x=>received=x,deleteAdminUserAppData:x=>received=x};vm.createContext(env);vm.runInContext(handler,env);assert.equal(received,id);assert.equal(env.injected,undefined);}
 }
 let committed=0;const writes=[];
 const adminCtx={auth:{currentUser:{uid:'admin-fixture',email:'admin@example.invalid'}},isSchoolAdmin:()=>true,RANKINGS_COLLECTION:'rankings',firebase:{firestore:{FieldValue:{serverTimestamp:()=>0}}},db:{collection:name=>({doc:id=>({name,id})}),batch:()=>({set:(ref,data)=>writes.push({ref,data}),commit:async()=>{committed++}})},showSyncStatus(){},loadAdminDashboard:async()=>{},console};
 vm.createContext(adminCtx);vm.runInContext(pick('async function toggleAdminUserSuspended(', '\nasync function deleteAdminUserAppData('),adminCtx);
 await adminCtx.toggleAdminUserSuspended('target-fixture',true);
 assert.equal(committed,1);assert.equal(writes.length,3);assert.equal(writes[2].ref.name,'securityAudit');assert.equal(writes[2].data.actorUid,'admin-fixture');assert.equal(writes[2].data.action,'suspend');
 console.log('Suspension fail-closed and dynamic handler tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
