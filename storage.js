import {validateLibrary,now,uid,gradeClosed} from './domain.js';
let db;
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export async function openStore(){
 if(db)return db;
 const r=indexedDB.open('ftl-learning',1);
 r.onupgradeneeded=()=>{const d=r.result;for(const name of ['meta','attempts','events','drafts','libraries'])d.createObjectStore(name,{keyPath:'id'});};
 db=await req(r);db.onversionchange=()=>{db.close();db=null;};return db;
}
async function transaction(names,mode,fn){const d=await openStore();return new Promise((resolve,reject)=>{
 const t=d.transaction(names,mode);let value; t.oncomplete=()=>resolve(value);t.onerror=()=>reject(t.error||Error('無法保存'));t.onabort=()=>reject(t.error||Error('儲存被中止'));
 try{value=fn(t);}catch(e){t.abort();reject(e);}
 });}
export async function get(name,id){const d=await openStore();return req(d.transaction(name).objectStore(name).get(id));}
export async function all(name){const d=await openStore();return req(d.transaction(name).objectStore(name).getAll());}
export async function put(name,value){return transaction([name],'readwrite',t=>t.objectStore(name).put(value));}
export async function initStore(){await openStore();let profile=await get('meta','profile');if(!profile){profile={id:'profile',recordId:uid(),createdAt:now(),schemaVersion:1};await put('meta',profile);}return profile;}
export async function installLibrary(l){validateLibrary(l);await transaction(['libraries','meta'],'readwrite',t=>{t.objectStore('libraries').put({id:l.version,library:l});t.objectStore('meta').put({id:'activeLibrary',version:l.version,installedAt:now()});});}
export async function activeLibrary(){const meta=await get('meta','activeLibrary');return meta?(await get('libraries',meta.version))?.library:null;}
export async function records(){const [attempts,events,drafts]=await Promise.all([all('attempts'),all('events'),all('drafts')]);attempts.sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt));events.sort((a,b)=>a.at.localeCompare(b.at));return {attempts,events,drafts};}
export async function saveDraft(d){const snapshot=structuredClone({...d,updatedAt:now()});const database=await openStore();await new Promise((resolve,reject)=>{
 const t=database.transaction(['drafts','attempts'],'readwrite');let conflict=false;
 t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error||Error('無法保存草稿'));t.onabort=()=>reject(conflict?Error('這份答案已在另一頁提交。請返回紀錄，原始答案保持不變。'):t.error||Error('儲存被中止'));
 const r=t.objectStore('attempts').get(d.id);r.onsuccess=()=>{if(r.result){conflict=true;t.abort();}else t.objectStore('drafts').put(snapshot);};
});}
export async function submit(d){
 const closedResult=d.answerMode==='closed'?gradeClosed(d.scenario,d.selectedOptionId):null;
 const answer=closedResult?d.scenario.closed.options.find(o=>o.id===d.selectedOptionId).text:d.answer;
 if(!answer?.trim()||!Number.isInteger(d.confidence)||d.confidence<1||d.confidence>5)throw Error('先填寫原始答案及信心。');
 const a={id:d.id,scenario:structuredClone(d.scenario),libraryVersion:d.libraryVersion,startedAt:d.startedAt,submittedAt:now(),answer,answerMode:d.answerMode||'open',selectedOptionId:d.selectedOptionId||null,closedResult,openDraft:closedResult?d.answer:undefined,practiceAfterExplanation:!!d.practiceAfterExplanation,optionsSeenBeforeOpen:!!d.optionsSeenBeforeOpen,confidence:d.confidence,hintsUsed:d.hintsUsed,hintHistory:structuredClone(d.hintHistory),isRetest:!!d.isRetest};
 // add(), not put(): committed historical answers cannot be overwritten.
 await transaction(['attempts','drafts','events'],'readwrite',t=>{t.objectStore('attempts').add(a);t.objectStore('drafts').delete(d.id);t.objectStore('events').add({id:uid(),kind:'submitted',attemptId:a.id,at:a.submittedAt});});return a;
}
export async function appendEvent(e){const value={...structuredClone(e),id:uid(),at:now()};await transaction(['events'],'readwrite',t=>t.objectStore('events').add(value));return value;}
export async function discardEmptyDraft(id){const d=await get('drafts',id);if(d&&!d.answer&&!d.hintsUsed)await transaction(['drafts'],'readwrite',t=>t.objectStore('drafts').delete(id));}
