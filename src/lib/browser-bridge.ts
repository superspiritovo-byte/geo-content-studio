import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import type {Store} from './store';
import type {Platform} from './types';
export type BrowserMode='extension'|'isolated';
export type BrowserJob={id:string;action:'login'|'identity'|'prepare';platform:Platform;payload:Record<string,unknown>;status:'queued'|'running'|'done'|'failed';expiresAt:number;result?:unknown;error?:string};
type Connection={id:string;origin:string;tokenHash:string;lastSeen:number};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function table(db:Store){db.db.exec('CREATE TABLE IF NOT EXISTS browser_jobs (id TEXT PRIMARY KEY,data TEXT NOT NULL)');}
function save(db:Store,job:BrowserJob){table(db);db.db.prepare('INSERT INTO browser_jobs(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(job.id,JSON.stringify(job));return job;}
function jobs(db:Store):BrowserJob[]{table(db);return (db.db.prepare('SELECT data FROM browser_jobs ORDER BY rowid').all() as {data:string}[]).map(r=>JSON.parse(r.data));}
export function browserMode(db:Store):BrowserMode{return db.get<{mode:BrowserMode}>('config','browser-mode')?.mode||'extension';}
export function bridgeState(db:Store){const c=db.get<Connection>('config','browser-extension');return {mode:browserMode(db),paired:!!c,online:!!c&&Date.now()-c.lastSeen<45000};}
export function createPairCode(db:Store){const code=randomBytes(16).toString('hex');db.put('config',{id:'browser-pair',hash:hash(code),expiresAt:Date.now()+600000});return code;}
export function interruptBrowserJobs(db:Store){for(const j of jobs(db))if(['queued','running'].includes(j.status))save(db,{...j,status:'failed',error:'Chrome 连接中断；不会自动重放操作'});}
export function disconnectExtension(db:Store){db.remove('config','browser-extension');db.remove('config','browser-pair');interruptBrowserJobs(db);}
export function pairExtension(db:Store,code:string,origin:string){return db.transaction(()=>{
 const p=db.get<{hash:string;expiresAt:number}>('config','browser-pair');if(!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)||!p||Date.now()>p.expiresAt||!equal(p.hash,hash(code)))throw Error('配对码无效或已过期，请重新生成');
 disconnectExtension(db);const token=randomBytes(32).toString('hex');db.put<Connection>('config',{id:'browser-extension',origin,tokenHash:hash(token),lastSeen:Date.now()});return token;
});}
export function authenticateExtension(db:Store,token:string,origin:string){const c=db.get<Connection>('config','browser-extension');if(!c||c.origin!==origin||!equal(c.tokenHash,hash(token)))throw Error('Chrome 扩展连接凭据无效，请重新配对');db.put('config',{...c,lastSeen:Date.now()});}
export function browserJob(db:Store,id:string){table(db);const r=db.db.prepare('SELECT data FROM browser_jobs WHERE id=?').get(id) as {data:string}|undefined;return r?JSON.parse(r.data) as BrowserJob:undefined;}
export function enqueueBrowserJob(db:Store,action:BrowserJob['action'],platform:Platform,payload:Record<string,unknown>={}){
 if(!bridgeState(db).online)throw Error('Chrome 扩展未连接，请在日常 Chrome 中加载扩展并配对；不会另外打开浏览器');
 // Keep bounded metadata, never persist images or any browser credentials in jobs.
 for(const j of jobs(db))if(Date.now()>j.expiresAt)db.db.prepare('DELETE FROM browser_jobs WHERE id=?').run(j.id);
 return save(db,{id:randomUUID(),action,platform,payload,status:'queued',expiresAt:Date.now()+120000});
}
export function claimBrowserJob(db:Store){return db.transaction(()=>{for(const j of jobs(db)){if(['queued','running'].includes(j.status)&&Date.now()>j.expiresAt){save(db,{...j,status:'failed',error:'Chrome 操作超时，请先检查平台页面，不会自动重放'});continue;}if(j.status==='queued')return save(db,{...j,status:'running'});}return undefined;});}
export function cancelBrowserJob(db:Store,id:string,error:string){const j=browserJob(db,id);if(j&&['queued','running'].includes(j.status))save(db,{...j,status:'failed',error});}
export function finishBrowserJob(db:Store,id:string,value:{ok:boolean;result?:unknown;error?:string}){return db.transaction(()=>{const j=browserJob(db,id);if(!j||j.status!=='running'||Date.now()>j.expiresAt)throw Error('Chrome 操作已结束或超时，不接收重复回执');return save(db,{...j,status:value.ok?'done':'failed',result:value.ok?value.result:undefined,error:value.ok?undefined:(value.error||'Chrome 操作失败').slice(0,500)});});}
export function setBrowserMode(db:Store,mode:BrowserMode){if(db.tasks().some(t=>['queued','publishing'].includes(t.status)||(t.status==='needs_action'&&t.stage==='awaiting_platform_confirmation'))||db.all<{status:string}>('commands').some(c=>['queued','running'].includes(c.status)))throw Error('有正在处理的任务或待确认草稿，请处理完毕后切换浏览器模式');db.put('config',{id:'browser-mode',mode});}
export async function requestBrowser(db:Store,action:BrowserJob['action'],platform:Platform,payload:Record<string,unknown>={}){const job=enqueueBrowserJob(db,action,platform,payload);for(;;){await new Promise(r=>setTimeout(r,250));const current=browserJob(db,job.id);if(current?.status==='done')return current.result;if(current?.status==='failed')throw Error(current.error);if(Date.now()>job.expiresAt||!bridgeState(db).online){cancelBrowserJob(db,job.id,'Chrome 连接中断或操作超时，请先检查平台标签页；不会自动重放');throw Error('Chrome 连接中断或操作超时，请先检查平台标签页；不会自动重放');}}}
