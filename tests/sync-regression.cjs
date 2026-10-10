const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function setup(site, remote={}, failRead=false, failWrite=false) {
 const source=fs.readFileSync(site+'/assets/js/app.js','utf8');
 const start=source.indexOf('async function saveCloudProgress()'),end=source.indexOf('function getLeaderboardPayload()',start);
 const state=new Map(),writes=[];
 const ctx={auth:{currentUser:{uid:'test-user'}},localStorage:{getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v)},db:{collection:()=>({doc:()=>({get:async()=>{if(failRead)throw Error('offline');return {exists:true,data:()=>remote}},set:async(payload)=>{if(failWrite)throw Error('denied');writes.push(payload)}})})},firebase:{firestore:{FieldValue:{serverTimestamp:()=>0}}},getSchoolCode:()=>null,getSchoolName:()=>'',getPublicNickname:()=>'',loadProgress(){},showSyncStatus(){},console:{warn(){}},setTimeout,clearTimeout};
 vm.createContext(ctx);vm.runInContext(source.slice(0,source.indexOf("const WELCOME_ACCEPTED_KEY"))+source.slice(start,end),ctx);
 return {ctx,state,writes,run:s=>vm.runInContext(s,ctx)};
}
(async()=>{
 for(const [site,field] of [['.','kobunAppState']]) {
  let t=setup(site);t.run('cloudRestoreComplete=true');t.run(`localStorage.setItem(STORAGE_KEY,JSON.stringify({progress:{1:{q1:'○'}},savedAt:'2026-10-09T12:00:00Z'}))`);
  assert.equal(await t.run('saveCloudProgress()'),true);assert.equal(t.writes.length,1);assert.ok(t.writes[0][field]);assert.equal(t.writes[0].schoolCode,null);
  t=setup(site,{[field]:JSON.stringify({progress:{2:{q1:'◎'}},savedAt:'2026-10-09T13:00:00Z'})});t.run(`localStorage.setItem(STORAGE_KEY,JSON.stringify({savedAt:'2026-10-09T12:00:00Z'}))`);assert.equal(await t.run('restoreCloudProgress()'),true);assert.ok(t.run('JSON.parse(localStorage.getItem(STORAGE_KEY)).progress[2]'));
  t=setup(site,{[field]:JSON.stringify({savedAt:'2026-10-09T11:00:00Z'})});t.run(`localStorage.setItem(STORAGE_KEY,JSON.stringify({savedAt:'2026-10-09T12:00:00Z'}))`);assert.equal(await t.run('restoreCloudProgress()'),false);
  t=setup(site,{},true);await assert.rejects(t.run('restoreCloudProgress()'));assert.equal(await t.run('saveCloudProgress()'),false);assert.equal(t.writes.length,0);
  t=setup(site,{},false,true);t.run(`cloudRestoreComplete=true;localStorage.setItem(STORAGE_KEY,'{}')`);assert.equal(await t.run('saveCloudProgress()'),false);
  t=setup(site);t.run('queueCloudProgressSave()');assert.equal(t.run('cloudSaveTimer'),null);
  console.log(site+': 6 sync regression cases passed');
 }
})();
