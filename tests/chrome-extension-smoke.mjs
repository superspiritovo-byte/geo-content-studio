// Explicit isolated MV3 smoke test. Build .next-chrome-qa, then node --import tsx tests/chrome-extension-smoke.mjs.
import {mkdtempSync,mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {platformAction} from '../chrome-extension/platform.js';

const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'geo-real-extension-'));process.env.GEO_DATA_DIR=join(dir,'data');mkdirSync(process.env.GEO_DATA_DIR,{recursive:true});
const ext=join(dir,'extension');mkdirSync(ext);for(const file of readdirSync(resolve('chrome-extension')))if(file.endsWith('.js')||file.endsWith('.json')||file.endsWith('.html')||file.endsWith('.png'))writeFileSync(join(ext,file),readFileSync(resolve('chrome-extension',file)));writeFileSync(join(ext,'background.js'),readFileSync(join(ext,'background.js'),'utf8').replace("const BASE='http://127.0.0.1:18080'","const BASE='http://127.0.0.1:18083'"));

const cover=crypto.randomUUID()+'.png';mkdirSync(join(process.env.GEO_DATA_DIR,'covers'));writeFileSync(join(process.env.GEO_DATA_DIR,'covers',cover),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=','base64'));
const {Store}=await import('../src/lib/store.ts');const db=new Store();const account=db.createAccount('zhihu');db.confirmAccount(account.id,'模拟作者','https://www.zhihu.com/people/fixture-author');const article=db.saveArticle({title:'扩展测试标题',body:'## 测试小标题\n\n这是**格式正文**。',audience:'客户',purpose:'测试',checks:[]});db.close();
const env={...process.env,GEO_BUILD_DIR:'.next-chrome-qa'};const children=[];let context;
const base='http://127.0.0.1:18083';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){const v=await fn();if(v)return v;await wait(300);}throw Error('Condition timeout');}
async function post(path,data={}){const r=await fetch(`${base}/api/${path}`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(data)});const value=await r.json();if(!r.ok)throw Error(JSON.stringify(value));return value;}
const state=async()=>await (await fetch(base+'/api/state')).json();
try{

 children.push(spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','18083'],{cwd:root,env,windowsHide:true,stdio:'ignore'}));await until(async()=>{try{return(await fetch(base+'/api/state')).ok;}catch{return false;}});
 children.push(spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','src/worker.ts'],{cwd:root,env,windowsHide:true,stdio:'ignore'}));await until(async()=>(await state()).worker.online);
 context=await chromium.launchPersistentContext(join(dir,'browser'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`],viewport:{width:1440,height:1000}});
 await context.route('https://www.zhihu.com/**',async route=>{if(new URL(route.request().url()).pathname==='/api/v4/me')return route.fulfill({json:{name:'模拟作者',url_token:'fixture-author'}});return route.fulfill({contentType:'text/html; charset=utf-8',body:'<html><body><h1>测试创作者后台</h1></body></html>'});});
 await context.route('https://zhuanlan.zhihu.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<html><body><textarea placeholder="请输入标题"></textarea><input type="file" accept="image/*"><div class="ProseMirror" contenteditable="true"></div><button onclick="window.publishClicks=(window.publishClicks||0)+1">发布</button></body></html>'}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=worker.url().split('/')[2];
 const existing=await context.newPage();await existing.goto('https://www.zhihu.com/creator');
 const ui=await context.newPage();await ui.goto(base+'/settings');await ui.getByRole('button',{name:'生成配对码',exact:true}).click();const code=await ui.getByRole('textbox',{name:'一次性配对码'}).inputValue();
 const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await popup.locator('#code').fill(code);await popup.locator('#pair').click();await until(async()=>(await state()).browser.online);
 await post('accounts/login',{id:account.id});await until(async()=>(await state()).commands.some(c=>c.target===account.id&&c.kind==='login'&&c.status==='done'));
 assert.equal(context.pages().filter(p=>p.url().startsWith('https://www.zhihu.com')).length,1,'reuse existing tab');
 await post('accounts/observe',{id:account.id});await until(async()=>(await state()).commands.some(c=>c.target===account.id&&c.kind==='observe'&&c.status==='done'));
 await post('publish',{articleId:article.id,reviewedRevision:article.revision,accountIds:[account.id],requestId:crypto.randomUUID(),confirmed:true,cover});
 const task=await until(async()=>{const s=await state();const t=s.tasks[0];if(t?.status==='needs_action')return t;});
 assert.equal(task.stage,'awaiting_platform_confirmation',task.message);assert.match(task.message,/准备好/);assert.equal(task.submissionAttempt,false);
 const editor=context.pages().find(p=>p.url().startsWith('https://zhuanlan.zhihu.com/'));assert.ok(editor);assert.equal(await editor.locator('textarea').inputValue(),article.title);assert.equal(await editor.locator('h2').innerText(),'测试小标题');assert.equal(await editor.locator('strong').innerText(),'格式正文');assert.equal(await editor.evaluate(()=>window.publishClicks||0),0);assert.equal(await editor.locator('input[type=file]').evaluate(el=>el.files[0].name),cover);
 assert.equal(await worker.evaluate(async()=> (await chrome.windows.getAll()).length),1);
 // An already populated editor must be left untouched.
 const before=await editor.locator('.ProseMirror').innerHTML();
 const runAction=async(page,platform,action,payload={})=>page.evaluate(({source,platform,action,payload})=>new Function('return ('+source+')')()(platform,action,payload),{source:platformAction.toString(),platform,action,payload});
 const protectedText=await runAction(editor,'zhihu','fill',{title:'不应覆盖',body:'不应覆盖',html:'<p>不应覆盖</p>'});assert.match(protectedText.pageError,/已有草稿/);assert.equal(await editor.locator('.ProseMirror').innerHTML(),before);
 // An image-only draft must not be replaced either.
 const fixture=await context.newPage();await fixture.goto('https://www.zhihu.com/creator');await fixture.setContent('<input type="file" accept="image/*"><textarea placeholder="标题"></textarea><div contenteditable="true"></div>');
 await fixture.locator('input[type=file]').setInputFiles({name:'existing.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=','base64')});
 assert.match((await runAction(fixture,'zhihu','check-empty')).pageError,/图片草稿/);assert.equal(await fixture.locator('input[type=file]').evaluate(el=>el.files[0].name),'existing.png');
 // Same-origin iframe editors keep formatted body support.
 await context.route('https://baijiahao.baidu.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<html><body><input placeholder="标题"><iframe srcdoc='<body class="view" contenteditable="true" style="height:180px"></body>'></iframe></body></html>`}));
 const framed=await context.newPage();await framed.goto('https://baijiahao.baidu.com/builder/rc/edit');const filled=await runAction(framed,'baijiahao','fill',{title:'框架标题',body:'原始标记',html:'<h2>框架小标题</h2><p><strong>框架正文</strong></p>'});assert.equal(filled.prepared,true,filled.pageError);assert.equal(await framed.frameLocator('iframe').locator('strong').innerText(),'框架正文');
 assert.match((await runAction(framed,'sohu','identity')).pageError,/不匹配/);

 await ui.goto(base+'/accounts');await ui.screenshot({path:'test-results/chrome-extension-connected.png',fullPage:true});
 await post('tasks/release',{id:task.id,confirmed:true});assert.equal((await state()).tasks[0].status,'handled');
 console.log('PASS real MV3: pair, reuse current tab/window, identity, rich text + image, draft/iframe guards, no publish click, release');
}catch(e){console.error('QA FAIL',e,context?.pages().map(p=>p.url()));console.error('QA TABS',await context?.serviceWorkers()[0]?.evaluate(async()=> (await chrome.tabs.query({})).map(({id,url,pendingUrl,status,windowId})=>({id,url,pendingUrl,status,windowId}))));throw e;}finally{await context?.close();for(const c of children.reverse())c.kill();}

