const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function setup(site, options={}) {
 const elements=new Map(),store=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',hidden:id.endsWith('-step')&&id!=='email-step',dataset:{},textContent:'',classList:{toggle(){},add(){},remove(){}},setAttribute(){},removeAttribute(){},focus(){},replaceChildren(){},querySelector(s){return el(id+s)},addEventListener(event,fn){this[event]=fn}});return elements.get(id)}
 const auth={currentUser:null,async signInAnonymously(){if(options.anonError)throw {code:options.anonError};this.currentUser={uid:'test',isAnonymous:true}}};
 const db={collection(){return {doc(){return {async get(){return {exists:options.exists!==false,data:()=>({active:options.active!==false,schoolName:'Test',startId:1,endId:10})}},async set(){}}}}}};
 const firebase={initializeApp(){},auth:()=>auth,firestore:()=>db};firebase.firestore.FieldValue={serverTimestamp:()=>0};
 const ctx={firebase,console:{warn(){}},URLSearchParams,location:{search:''},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:{getElementById:el,querySelector:el,querySelectorAll:()=>[],body:el('body'),createElement:el},fetch:async()=>({ok:!options.lookupError,json:async()=>options.lookupError?{error:{status:'UNAVAILABLE'}}:{result:options.result||{registered:true,passwordEnabled:true}}})};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(site+'/login.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
 return {el,store,submit:id=>el(id).submit({preventDefault(){}})};
}
(async()=>{
 for(const site of ['.']){
 let t=setup(site,{lookupError:true});t.el('email-input').value='test@example.com';await t.submit('email-form');assert.equal(t.el('password-step').hidden,false);
 for(const anonError of [undefined,'auth/operation-not-allowed','auth/network-request-failed']) {t=setup(site,{anonError});t.el('school-id-input').value='abc';await t.submit('school-form');assert.equal(!t.el('school-success-step').hidden,anonError!=='auth/network-request-failed');if(anonError!=='auth/network-request-failed'){const session=JSON.parse(t.store.get('systan_class_session_v1'));assert.equal(session.local,!!anonError)}}
 for(const options of [{exists:false},{active:false}]){t=setup(site,options);t.el('school-id-input').value='bad';await t.submit('school-form');assert.equal(t.el('school-success-step').hidden,true);assert.equal(t.store.size,0)}
 console.log(site+': 6 login regression cases passed');
 }
})();
