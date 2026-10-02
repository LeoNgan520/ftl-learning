export const APP_VERSION='1.1.0';
export const TYPES=['Discovery','Diagnosis','Decision','Transfer','Hidden Retest','Ambiguous Scenario','Product X-Ray'];
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const uid=()=>globalThis.crypto.randomUUID();
export const now=()=>new Date().toISOString();
export function compareVersion(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]?1:-1;}return 0;}
export function validateManifest(m){
 if(!m||m.schemaVersion!==1||!/^\d+\.\d+\.\d+$/.test(m.libraryVersion)||!/^\d+\.\d+\.\d+$/.test(m.minAppVersion)||!/^\.[/]content[/][a-z0-9.-]+\.json$/.test(m.url)||!/^([a-f0-9]{64})$/.test(m.sha256)||!Number.isInteger(m.bytes)||m.bytes<=0||m.bytes>10_000_000)throw Error('教材版本清單格式不支援，原教材保留。');
 if(compareVersion(m.minAppVersion,APP_VERSION)>0)throw Error('新教材需要較新的 App；先更新 App，原教材保留。');
 return m;
}
export function validateLibrary(l){
 if(!l||l.schemaVersion!==1||!/^\d+\.\d+\.\d+$/.test(l.version)||!Array.isArray(l.modules)||!l.modules.length||!Array.isArray(l.scenarios)||!l.scenarios.length||l.scenarios.length>2000)throw Error('教材格式不支援，原教材保留。');
 const ids=new Set(),ms=new Set();
 for(const m of l.modules){if(!/^[a-z0-9-]+$/.test(m.id)||ms.has(m.id)||typeof m.title!=='string'||!Number.isInteger(m.level)||m.level<0||m.level>4||!Array.isArray(m.prerequisites)||typeof m.model!=='string'||typeof m.boundary!=='string')throw Error('教材主題格式錯誤。');ms.add(m.id);}
 for(const s of l.scenarios){if(!/^[a-z0-9-]+$/.test(s.id)||ids.has(s.id)||!ms.has(s.moduleId)||!TYPES.includes(s.type)||!/^\d+\.\d+\.\d+$/.test(s.version)||!['title','situation','question'].every(k=>typeof s[k]==='string'&&s[k].trim())||!Array.isArray(s.hints)||s.hints.length!==3||!s.hints.every(h=>typeof h==='string'&&h.trim())||!s.analysis||!['explanation','mentalModel','evidence','tradeoff','engineerQuestion','boundary','misconception','windowsFollowup'].every(k=>typeof s.analysis[k]==='string'&&s.analysis[k].trim())||!Array.isArray(s.analysis.rubric)||s.analysis.rubric.length!==4)throw Error('情境內容不完整。');if(s.closed)validateClosed(s.closed);ids.add(s.id);}
 for(const m of l.modules){if(m.prerequisites.some(p=>!ms.has(p))||!l.scenarios.some(s=>s.moduleId===m.id))throw Error('教材缺少主題關聯。');}
 return l;
}
export function moduleEvidence(m,l,records){
 const eligible=l.scenarios.filter(s=>s.moduleId===m.id), attempts=records.attempts.filter(a=>a.scenario.moduleId===m.id);
 const unique=new Set(attempts.map(a=>a.scenario.id));
 const reflections=records.events.filter(e=>e.kind==='reflection'&&attempts.some(a=>a.id===e.attemptId));
 const independent=attempts.filter(a=>a.hintsUsed===0&&!a.practiceAfterExplanation&&!a.optionsSeenBeforeOpen).length;
 const transfer=attempts.filter(a=>['Transfer','Hidden Retest','Product X-Ray'].includes(a.scenario.type)).length;
 const lastReflection=new Map();for(const e of reflections)lastReflection.set(e.attemptId,e);
 const reviewed=attempts.filter(a=>lastReflection.get(a.id)?.selfAssessment==='can-explain');
 const independentTransfer=reviewed.some(a=>a.hintsUsed===0&&!a.practiceAfterExplanation&&!a.optionsSeenBeforeOpen&&['Transfer','Hidden Retest','Product X-Ray'].includes(a.scenario.type));
 const boundaryEvidence=reflections.filter(e=>e.boundary?.trim()).length;
 const readyForNext=unique.size>=eligible.length&&reviewed.length>=2&&independentTransfer&&boundaryEvidence>=1;
 const status=!attempts.length?'尚未觀察':unique.size<eligible.length?'正在建立證據':!transfer?'已作答 · 待轉移驗證':'已收集初步證據 · 待 AI review';
 return {attempts:attempts.length,unique:unique.size,total:eligible.length,reflections:reflections.length,independent,transfer,status,mastery:'未驗證',boundaryEvidence,readyForNext,estimate:readyForNext?'初步自評證據支持探索下一主題，仍待外部驗證':'證據未足，不能推斷掌握'};
}
export function recommend(l,r){
 const seen=new Set(r.attempts.map(a=>a.scenario.id));
 const latestReflection=new Map();for(const e of r.events)if(e.kind==='reflection')latestReflection.set(e.attemptId,e);
 const unresolved=[...latestReflection.values()].filter(e=>e.selfAssessment==='needs-work'||e.selfAssessment==='uncertain');
 // Retest after at least three intervening answers. Never claim a passing grade.
 for(const e of unresolved){const a=r.attempts.find(a=>a.id===e.attemptId);if(!a)continue;
 const pos=r.attempts.indexOf(a),later=r.attempts.slice(pos+1);
 if(later.length>=3&&!later.some(t=>t.scenario.moduleId===a.scenario.moduleId)){
 const transfer=l.scenarios.find(s=>s.moduleId===a.scenario.moduleId&&['Hidden Retest','Transfer'].includes(s.type)&&!seen.has(s.id));if(transfer)return {scenario:transfer,reason:'換個情境，看看之前的理解能否用得上。'};
 }}
 for(const m of l.modules){
 const ss=l.scenarios.filter(s=>s.moduleId===m.id),next=ss.find(s=>!seen.has(s.id));
 if(next)return {scenario:next,reason:'從目前的學習證據，繼續下一個情境。'};
 if(!m.assessment){const e=moduleEvidence(m,l,r);if(!e.readyForNext){
 const candidate=ss.find(s=>['Transfer','Hidden Retest','Product X-Ray'].includes(s.type))||ss.at(-1);
 return {scenario:candidate,reason:'先換情境重測，並記錄理解及專業界線；完成題目本身不足以支持前進。你仍可在教材頁自由探索。'};
 }}
 }
 const least=l.modules.filter(m=>!m.assessment).sort((a,b)=>moduleEvidence(a,l,r).transfer-moduleEvidence(b,l,r).transfer)[0];
 const s=l.scenarios.find(s=>s.moduleId===least?.id&&['Transfer','Hidden Retest'].includes(s.type))||l.scenarios[0];
 return {scenario:s,reason:'Core 已全部作答；重測與 Windows AI review 用來查證理解，不按日期升級。'};
}

export function validateClosed(c){if(!c||typeof c.question!=='string'||!Array.isArray(c.options)||c.options.length!==3||new Set(c.options.map(o=>o.id)).size!==3||!c.options.every(o=>typeof o.id==='string'&&typeof o.text==='string'&&o.text.trim()&&typeof o.explanation==='string'&&o.explanation.trim())||!c.options.some(o=>o.id===c.correctOptionId))throw Error('選項或解說不完整。');return c;}
export function gradeClosed(s,id){validateClosed(s.closed);if(!s.closed.options.some(o=>o.id===id))throw Error('請先選擇答案。');return {correct:id===s.closed.correctOptionId,selectedOptionId:id,correctOptionId:s.closed.correctOptionId};}
export function reviewQueue(r){const latest=new Map();for(const e of r.events)if(e.kind==='ai-reviewed')latest.set(e.scenarioId,e);return [...latest.values()].filter(e=>e.reviewed).map(e=>({scenarioId:e.scenarioId,attemptId:e.attemptId,at:e.at,reason:'已找 AI 批改；以不同情境再練習'}));}
