const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function run(creator,values){
 let result,authReads=0;
 const firestore={collection:()=>({where:()=>({orderBy:()=>({limit:()=>({get:async()=>({empty:true})})})})})};
 const ctx={exports:{},require:name=>{
  if(name==='firebase-admin/app')return {initializeApp(){}};
  if(name==='firebase-admin/firestore')return {getFirestore:()=>firestore,FieldValue:{serverTimestamp:()=>0},FieldPath:{documentId:()=>''}};
  if(name==='firebase-admin/messaging')return {getMessaging:()=>{throw Error('No live messages allowed')}};
  if(name==='firebase-admin/auth')return {getAuth:()=>({getUser:async()=>{authReads++;if(!creator)throw Error('unknown');return creator}})};
  if(name==='firebase-functions/v2/firestore')return {onDocumentCreated:(_,fn)=>fn,onDocumentUpdated:(_,fn)=>fn,onDocumentWritten:(_,fn)=>fn};
  if(name==='firebase-functions/v2/scheduler')return {onSchedule:(_,fn)=>fn};
  return require(name);
 }};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/index.js','utf8'),ctx);
 await ctx.exports.sendInstalledAppNotification({data:{data:()=>values,ref:{set:async data=>result=data}}});
 return {status:result.status,authReads};
}
(async()=>{
 const email=fs.readFileSync(__dirname+'/index.js','utf8').match(/const ADMIN_EMAIL = '([^']+)'/)[1];
 assert.equal((await run(null,{createdByEmail:email,target:'installed'})).status,'rejected');
 assert.equal((await run(null,{createdByUid:'unknown',target:'installed'})).status,'rejected');
 for(const user of [{email,emailVerified:false},{email,emailVerified:true,disabled:true},{email:'other@example.invalid',emailVerified:true}])assert.equal((await run(user,{createdByUid:'fixture',target:'installed'})).status,'rejected');
 assert.equal((await run({email,emailVerified:true,disabled:false},{createdByUid:'fixture',target:'installed',title:'Test',body:'No recipient'})).status,'sent');
 console.log('6 notification authorization tests passed without sending messages');
})().catch(e=>{console.error(e);process.exitCode=1});
