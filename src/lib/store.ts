import {isImagePlatform,validateImagePost} from './image-post';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Account, Article, Command, Document, Knowledge, Platform, Settings, Task, TaskStatus, Topic } from './types';
import { platforms } from './types';
import { normalizeIdentity } from './publishing';
export const dataDir = process.env.GEO_DATA_DIR || join(process.env.LOCALAPPDATA || process.cwd(), 'GEOStudio', 'data');
mkdirSync(dataDir,{recursive:true});
const now = () => new Date().toISOString();
const id = () => randomUUID();
type Table = 'knowledge'|'documents'|'topics'|'articles'|'accounts'|'batches'|'tasks'|'commands'|'config';
export class Store {
  db:DatabaseSync;
  constructor(path = join(dataDir,'geo.sqlite')) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    for (const table of ['knowledge','documents','topics','articles','accounts','batches','tasks','commands','config']) this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS task_fingerprint ON tasks(json_extract(data,'$.fingerprint')); CREATE UNIQUE INDEX IF NOT EXISTS batch_request ON batches(json_extract(data,'$.requestId'));");
  }
  all<T>(table:Table):T[] { return (this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`).all() as {data:string}[]).map(r=>JSON.parse(r.data)); }
  get<T>(table:Table,key:string):T|undefined { const row=this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(key) as {data:string}|undefined;return row?JSON.parse(row.data):undefined; }
  put<T extends {id:string}>(table:Table,value:T):T {this.db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(value.id,JSON.stringify(value));return value;}
  remove(table:Table,key:string){this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(key);}
  transaction<T>(fn:()=>T):T {this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  knowledge(){return this.all<Knowledge>('knowledge');}
  documents(){return this.all<Document>('documents');}
  articles(){return this.all<Article>('articles');}
  accounts(){return this.all<Account>('accounts');}
  topics(){return this.all<Topic>('topics');}
  tasks(){return this.all<Task>('tasks');}
  createKnowledge(name:string,text:string){return this.put('knowledge',{id:id(),name,text,updatedAt:now()});}
  addDocument(knowledgeId:string,name:string,status:Document['status'],text:string,error='',path?:string){return this.put<Document>('documents',{id:id(),knowledgeId,name,status,text,error,path});}
  saveArticle(input:Partial<Article>&Pick<Article,'title'|'body'|'audience'|'purpose'|'checks'>){return this.put<Article>('articles',{...input,id:input.id||id(),revision:id(),updatedAt:now()});}
  createAccount(platform:Platform){return this.put<Account>('accounts',{id:id(),platform,name:'待登录账号',identity:'',status:'new',message:'打开平台窗口后完成登录，再读取账号身份。'});}
  confirmAccount(key:string,name:string,identity:string){return this.transaction(()=>{const a=this.get<Account>('accounts',key);if(!a)throw Error('账号不存在');const canonical=normalizeIdentity(identity);if(this.accounts().some(b=>b.id!==key&&b.platform===a.platform&&b.identity&&normalizeIdentity(b.identity)===canonical))throw Error('该平台账号已存在，请使用已保存的账号');return this.put<Account>('accounts',{...a,name,identity:canonical,status:'ready',message:a.publishable===false?'登录身份已确认；平台发布资格尚未确认，请完成平台实名认证或审核后重新读取。':'已确认账号；发布前将重新检查登录身份。'});});}
  createBatch(articleId:string,accountIds:string[],requestId:string,cover?:string,reviewedRevision?:string,imagePost?:{images:string[];title:string;body:string}){
    return this.transaction(()=>{
      const existing=this.all<{id:string;requestId:string}>('batches').find(b=>b.requestId===requestId);if(existing)return existing;
      const article=this.get<Article>('articles',articleId);if(!article?.title.trim()||!article.body.trim())throw Error('请先保存完整文章');
      if(reviewedRevision!==undefined&&article.revision!==reviewedRevision)throw Error('文章已更新，请重新预览并确认后发布');
      if(!accountIds.length)throw Error('请选择发布账号');
      const batch={id:id(),requestId,articleId,createdAt:now()};
      const tasks=[...new Set(accountIds)].map(accountId=>{
        const a=this.get<Account>('accounts',accountId);if(!a||a.status!=='ready'||!a.identity)throw Error('账号尚未确认登录');
        if(a.publishable===false)throw Error('账号已登录，但平台发布资格尚未确认，请完成平台认证或审核后重新读取身份');
        if(isImagePlatform(a.platform))validateImagePost(a.platform,imagePost?.title||'',imagePost?.body||'',imagePost?.images||[]);
        if(platforms[a.platform].cover&&!cover)throw Error(`${platforms[a.platform].name}需要封面`);
        const fingerprint=createHash('sha256').update(JSON.stringify([article.title,article.body,cover||'',a.platform,normalizeIdentity(a.identity),isImagePlatform(a.platform)?imagePost:null])).digest('hex');
        if(this.tasks().some(t=>t.fingerprint===fingerprint))throw Error('此版本已为该账号创建任务，请查看已有记录，避免重复发布');
        return {id:id(),batchId:batch.id,articleId,accountId,platform:a.platform,accountName:a.name,identity:a.identity,snapshot:structuredClone(article),cover,...(isImagePlatform(a.platform)?{images:[...(imagePost?.images||[])],postTitle:imagePost?.title,postBody:imagePost?.body}:{}),status:'queued',stage:'queued',message:'等待助手处理',updatedAt:now(),submissionAttempt:false,fingerprint} satisfies Task;
      });
      this.put('batches',batch);for(const task of tasks)this.put('tasks',task);return batch;
    });
  }
  claimTask(){return this.transaction(()=>{const task=this.tasks().reverse().find(t=>t.status==='queued'&&!this.tasks().some(p=>p.accountId===t.accountId&&p.stage==='awaiting_platform_confirmation'&&p.status==='needs_action'));if(!task)return;return this.put<Task>('tasks',{...task,status:'publishing',stage:'preparing',updatedAt:now(),message:'正在核对身份并准备文章'});});}
  setTask(key:string,status:TaskStatus,message:string,extra:Partial<Task>={}){const task=this.get<Task>('tasks',key);if(!task)throw Error('任务不存在');if(status==='published')throw Error('公开发布必须通过身份、内容和公开页面核验');return this.put<Task>('tasks',{...task,...extra,id:task.id,status,message,updatedAt:now()});}
  verifiedTask(key:string,url:string,proof:{identity:string;title:string;bodyMatches:boolean;publiclyAccessible:boolean}){const task=this.get<Task>('tasks',key);if(!task||proof.identity!==task.identity||proof.title!==task.snapshot.title||!proof.bodyMatches||!proof.publiclyAccessible)throw Error('公开文章核验未通过');return this.put<Task>('tasks',{...task,status:'published',publicUrl:url,message:'已核对公开页面、作者、标题和正文',updatedAt:now()});}
  retryTask(key:string){return this.transaction(()=>{const t=this.get<Task>('tasks',key);if(!t||!['failed','needs_action'].includes(t.status)||t.submissionAttempt||t.manualPublicationClaim)throw Error('该任务可能已提交，只能检查结果，不能重新提交');return this.setTask(key,'queued','已重新排队，提交前将再次检查身份');});}
  releaseImageTask(key:string){const t=this.get<Task>('tasks',key);if(!t||!isImagePlatform(t.platform)||t.stage!=='awaiting_platform_confirmation'||t.status!=='needs_action')throw Error('没有可释放的图文草稿');return this.setTask(key,'handled','用户已确认在平台处理完毕；此记录不代表自动核验公开发布。',{stage:'platform_handled'});}
  recoverInterrupted(){for(const t of this.tasks())if(t.status==='publishing')this.setTask(t.id,'needs_action','助手曾中断，请先检查平台后台；系统不会自动重新发布');for(const c of this.all<Command>('commands'))if(c.status==='running')this.put('commands',{...c,status:'failed',message:'助手曾中断，请重新发起操作'});}
  command(kind:Command['kind'],target:string,url?:string){const pending=this.all<Command>('commands').find(c=>c.kind===kind&&c.target===target&&['queued','running'].includes(c.status));return pending||this.put<Command>('commands',{id:id(),kind,target,url,status:'queued',message:'等待助手'});}
  claimCommand(){return this.transaction(()=>{const c=this.all<Command>('commands').reverse().find(c=>c.status==='queued');return c?this.put<Command>('commands',{...c,status:'running',message:'执行中'}):undefined;});}
  settings():Settings {return this.get<Settings&{id:string}>('config','settings')||{baseUrl:'',model:'',encryptedKey:'',contextLimit:32768,length:'1200',tone:'专业、清楚、自然'};}
  saveSettings(s:Settings){this.put('config',{...s,id:'settings'});}
  heartbeat(message='助手运行中'){this.put('config',{id:'heartbeat',time:now(),message});}
  worker(){const h=this.get<{time:string;message:string}>('config','heartbeat');return {online:!!h&&h.message!=='助手已停止'&&Date.now()-Date.parse(h.time)<20000,heartbeat:h?.time,message:h?.message};}
  close(){this.db.close();}
}
let singleton:Store|undefined;
export function store(){return singleton||=new Store();}
