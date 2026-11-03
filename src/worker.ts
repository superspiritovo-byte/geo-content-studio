import {isImagePlatform} from './lib/image-post';
import {prepareImagePost} from './lib/image-adapters';
import { chromium, type BrowserContext, type Locator } from 'playwright';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { store, dataDir } from './lib/store';
import { platforms, type Account, type Task, type Command } from './lib/types';
import { readIdentity, fillArticle, submitArticle, publicSelectors, selectAccountPage } from './lib/adapters';
import { contentMatches, normalizeIdentity, validatePublicUrl, bylineMatches, publicAccessFailure } from './lib/publishing';
const db=store();
const lock=join(dataDir,'worker.lock');
if(existsSync(lock)){const pid=Number(readFileSync(lock,'utf8'));let alive=false;try{process.kill(pid,0);alive=true;}catch{}if(alive){console.error('发布助手已经运行');process.exit(1);}unlinkSync(lock);}
const fd=openSync(lock,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);
const contexts=new Map<string,BrowserContext>();let stopping=false;
async function shutdown(){if(stopping)return;stopping=true;for(const context of contexts.values())await context.close().catch(()=>{});try{unlinkSync(lock);}catch{}db.heartbeat('助手已停止');db.close();process.exit(0);}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
process.on('exit',()=>{try{unlinkSync(lock);}catch{}});
async function pageFor(account:Account){let context=contexts.get(account.id);if(!context){const path=join(dataDir,'profiles','chrome',account.id);mkdirSync(path,{recursive:true});context=await chromium.launchPersistentContext(path,{channel:'chrome',headless:false,viewport:{width:1280,height:850}});contexts.set(account.id,context);context.on('close',()=>contexts.delete(account.id));}const selected=selectAccountPage(context.pages(),account.platform);if(selected)return selected;const page=context.pages().find(p=>!p.isClosed())||await context.newPage();await page.goto(platforms[account.platform].home,{waitUntil:'domcontentloaded',timeout:45000});return page;}
async function checkPublic(task:Task,value?:string){
  if(isImagePlatform(task.platform))throw Error('新平台图文公开结果自动核验尚待真实账号适配，请在平台后台核对。检查不会重复提交。');
  const url=validatePublicUrl(task.platform,value||task.publicUrl||'');
  // Independent non-authenticated context proves that the page is publicly accessible.
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{const context=await browser.newContext();const page=await context.newPage();await page.route('**/*',async route=>{
      const u=new URL(route.request().url());const host=u.hostname;
      if(u.protocol!=='https:'||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(host))return route.abort();
      return route.continue();
    });
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});if(!response?.ok())throw Error(publicAccessFailure(response?.status()));validatePublicUrl(task.platform,page.url());
    const title=(await page.locator('h1').first().innerText({timeout:12000})).trim();
    const rules=publicSelectors[task.platform];
    const bodies=page.locator(rules.body);const visible:Locator[]=[];for(let i=0;i<await bodies.count();i++)if(await bodies.nth(i).isVisible())visible.push(bodies.nth(i));
    if(visible.length!==1)throw Error('无法确认唯一文章正文区域，请人工核对；未标记为公开发布');
    const body=await visible[0].innerText();
    const hrefs=(await page.locator(rules.byline).evaluateAll(nodes=>nodes.map(n=>(n as HTMLAnchorElement).href))).filter(h=>rules.identity.test(h));
    if(!bylineMatches(task.identity,hrefs)||!contentMatches(task.snapshot.title,task.snapshot.body,title,body))throw Error('无法同时核对文章署名、标题和完整正文，请检查链接；未标记为公开发布');
    db.verifiedTask(task.id,page.url(),{identity:task.identity,title:task.snapshot.title,bodyMatches:true,publiclyAccessible:true});
  }finally{await browser.close();}
}
async function command(c:Command){
  try{
    if(c.kind==='check'){const t=db.get<Task>('tasks',c.target);if(!t)throw Error('任务不存在');await checkPublic(t,c.url);}
    else{
      const a=db.get<Account>('accounts',c.target);if(!a)throw Error('账号不存在');const page=await pageFor(a);
      if(c.kind==='login'){if(db.tasks().some(t=>t.accountId===a.id&&t.stage==='awaiting_platform_confirmation'&&t.status==='needs_action'))throw Error('该账号有待确认的图文草稿，请先在平台窗口完成处理并释放账号，避免覆盖草稿');await page.goto(platforms[a.platform].home,{waitUntil:'domcontentloaded',timeout:45000});await page.bringToFront();}
      else if(c.kind==='observe'){
        const identity=await readIdentity(page,a.platform);
        if(a.status==='ready'&&a.identity!==identity.identity){db.put('accounts',{...a,status:'expired',message:'当前浏览器身份与已保存账号不符，请重新登录'});throw Error('账号身份不符，未覆盖原账号');}
        db.put<Account>('accounts',{...a,observedName:identity.name,observedIdentity:identity.identity,publishable:identity.publishable,status:a.status==='ready'?'ready':'observed',message:identity.publishable===false?'已识别登录身份，可确认保存。搜狐号发布资格尚未确认，请在平台完成实名认证或审核后重新读取；这不代表未登录。':'已从平台读取身份，请核对名称后确认保存。'});
      }
    }
    db.put<Command>('commands',{...c,status:'done',message:c.kind==='login'?'平台窗口已打开，请自行完成登录':c.kind==='check'?'公开结果核验通过':'账号身份读取完成'});
  }catch(e){const message=e instanceof Error?e.message:'助手操作失败';db.put<Command>('commands',{...c,status:'failed',message});}
}
async function publish(task:Task){
  try{
    const account=db.get<Account>('accounts',task.accountId);if(!account)throw Error('账号已移除');
    const page=await pageFor(account);await page.goto(platforms[account.platform].home,{waitUntil:'domcontentloaded',timeout:45000});
    const current=await readIdentity(page,account.platform);
    if(current.publishable===false)throw Error('账号身份已识别，但平台发布资格尚未确认，请先完成平台认证或审核，未提交文章');
    if(current.identity!==task.identity){db.put('accounts',{...account,status:'expired',message:'身份不符，请重新登录'});throw Error('当前登录身份与目标账号不符，未提交文章');}
    if(isImagePlatform(account.platform)){
      await prepareImagePost(page,account.platform,task.postTitle!,task.postBody!,task.images!.map(file=>join(dataDir,'covers',file)));
      db.setTask(task.id,'needs_action','图文图片与文案已准备，请在平台窗口核对图片顺序、话题及声明后确认发布；助手没有点击发布。',{stage:'awaiting_platform_confirmation',manualPublicationClaim:true});return;
    }
    await fillArticle(page,account.platform,task.snapshot.title,task.snapshot.body,task.cover?join(dataDir,'covers',task.cover):undefined);
    // Persist BEFORE any click. A crash here must never cause an automatic second click.
    db.setTask(task.id,'publishing','已填入文章，正在尝试提交',{submissionAttempt:true,stage:'submitting'});
    await submitArticle(page,account.platform,task.snapshot.title,task.snapshot.body);
    let publicUrl:string|undefined;try{publicUrl=validatePublicUrl(task.platform,page.url());}catch{}
    db.setTask(task.id,'submitted','已尝试提交，请检查平台审核或确认弹窗。提供公开链接后可核验；系统不会自动重发。',{publicUrl,stage:'submitted',submissionAttempt:true});
    if(publicUrl){try{await checkPublic(db.get<Task>('tasks',task.id)!,publicUrl);}catch{/* Keep submitted until public proof is available. */}}
  }catch(e){const t=db.get<Task>('tasks',task.id)!;db.setTask(task.id,'needs_action',(e instanceof Error?e.message:'发布需要人工处理')+(t.submissionAttempt?'；可能已提交，请先检查后台，禁止重复提交。':''));}
}
db.recoverInterrupted();
const beat=setInterval(()=>db.heartbeat(),4000);db.heartbeat();console.log('GEO 本机发布助手已启动（知乎 / 百家号 / 搜狐号，适配器待真实账号验证）');
try{while(!stopping){const c=db.claimCommand();if(c){await command(c);continue;}const task=db.claimTask();if(task){await publish(task);continue;}await new Promise(resolve=>setTimeout(resolve,1000));}}finally{clearInterval(beat);await shutdown();}
