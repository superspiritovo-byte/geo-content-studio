import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {NextRequest} from 'next/server';
process.env.GEO_DATA_DIR=mkdtempSync(join(tmpdir(),'geo-api-'));
const {GET,POST}=await import('../src/app/api/[...path]/route');
const {store}=await import('../src/lib/store');
const {encryptKey,decryptKey}=await import('../src/lib/secrets');
store().put('config',{id:'browser-mode',mode:'isolated'});
const context=(path:string)=>({params:Promise.resolve({path:path.split('/')})});
async function post(path:string,data:unknown,origin='http://127.0.0.1:3000'){
  const form=data instanceof FormData;
  const req=new NextRequest(`http://127.0.0.1:3000/api/${path}`,{method:'POST',headers:{host:'127.0.0.1:3000',origin,...(form?{}:{'Content-Type':'application/json'})},body:form?data:JSON.stringify(data)});
  const r=await POST(req,context(path));return {status:r.status,value:await r.json()};
}
async function state(){const r=await GET(new NextRequest('http://127.0.0.1:3000/api/state',{headers:{host:'127.0.0.1:3000'}}),context('state'));return r.json();}
test('接口拒绝跨站写入；设置不回显密钥或密文',async()=>{
  assert.equal((await post('accounts/add',{platform:'zhihu'},'https://evil.example')).status,403);
  const encrypted=encryptKey('test-key-not-a-real-secret');assert.notEqual(encrypted,'test-key-not-a-real-secret');assert.equal(decryptKey(encrypted),'test-key-not-a-real-secret');
  store().saveSettings({...store().settings(),encryptedKey:encrypted});
  const s=await state();assert.equal(s.settings.hasKey,true);assert.equal('encryptedKey' in s.settings,false);assert.equal(JSON.stringify(s).includes('test-key-not-a-real-secret'),false);
});
test('上传解析结果区分成功和失败，超数量或格式错误不创建资料',async()=>{
  const form=new FormData();form.set('name','接口测试企业');form.set('text','企业介绍');form.append('files',new File(['文件内容'], '产品.md'));form.append('files',new File(['broken'], '坏文件.docx'));
  assert.equal((await post('knowledge/upload',form)).status,200);
  const s=await state();assert.equal(s.documents.length,2);assert.equal(s.documents.filter((d:any)=>d.status==='failed').length,1);assert.equal(s.documents.filter((d:any)=>d.status==='ready')[0].text,'文件内容');
  const invalid=new FormData();invalid.set('name','不应创建');invalid.append('files',new File(['pdf'],'test.pdf'));assert.equal((await post('knowledge/upload',invalid)).status,400);
  const tooMany=new FormData();tooMany.set('name','不应创建');for(let i=0;i<11;i++)tooMany.append('files',new File(['a'],`${i}.txt`));assert.equal((await post('knowledge/upload',tooMany)).status,400);assert.equal(store().knowledge().length,1);
});
test('真实请求通路：模型返回校验、隔离上下文、认证错误，不产生假文章',async()=>{
  let received='';let mode='topics';
  const server=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);received=Buffer.concat(chunks).toString();if(mode==='auth'){res.writeHead(401);res.end('{}');return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:mode==='topics'?JSON.stringify({topics:[{title:'如何选择产品？',reason:'回答客户疑问',checks:['核对型号']}] }):mode==='bad'?'not json':JSON.stringify({title:'如何选择产品？',body:'## 选择依据\n\n根据真实资料选择产品。',checks:['核对价格']})},finish_reason:'stop'}]}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const address=server.address() as {port:number};store().saveSettings({...store().settings(),baseUrl:`http://127.0.0.1:${address.port}/v1`,model:'fixture-model'});
    const a=store().createKnowledge('模型企业甲','甲企业专属资料');store().createKnowledge('模型企业乙','乙企业不应出现');
    const input={knowledgeId:a.id,audience:'客户',purpose:'回答问题'};
    const result=await post('topics/generate',input);assert.equal(result.status,200);assert.equal(result.value[0].title,'如何选择产品？');assert.match(received,/甲企业专属资料/);assert.doesNotMatch(received,/乙企业不应出现/);
    mode='article';assert.equal((await post('articles/generate',{...input,title:'题目'})).status,200);assert.equal(store().articles().length,1);
    mode='bad';assert.equal((await post('articles/generate',{...input,title:'题目'})).status,400);assert.equal(store().articles().length,1);
    mode='auth';const failed=await post('topics/generate',input);assert.match(failed.value.error,/密钥/);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('发布接口要求明确确认与所审阅版本，并实现请求幂等',async()=>{
  const db=store();db.heartbeat();const account=db.createAccount('zhihu');db.confirmAccount(account.id,'接口验收作者','https://www.zhihu.com/people/api-author');
  const article=db.saveArticle({title:'已审阅文章',body:'已审阅正文',audience:'客户',purpose:'介绍',checks:[]});
  const input={articleId:article.id,reviewedRevision:article.revision,accountIds:[account.id],requestId:crypto.randomUUID(),confirmed:true};
  assert.equal((await post('publish',{...input,confirmed:false})).status,400);
  const updated=db.saveArticle({...article,body:'尚未审阅的新正文'});
  const stale=await post('publish',input);assert.match(stale.value.error,/文章已更新/);assert.equal(db.tasks().length,0);
  const current={...input,reviewedRevision:updated.revision};const first=await post('publish',current);const repeated=await post('publish',current);
  assert.equal(first.status,200);assert.equal(repeated.value.id,first.value.id);assert.equal(db.tasks().length,1);
});
test('连接测试接受有效的推理预算耗尽响应，但文章生成仍拒绝截断',async()=>{
  const server=createServer(async(req,res)=>{for await(const _ of req){}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'',reasoning_content:'正在思考如何回复 OK'},finish_reason:'length'}]}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const old=store().settings();
  try{store().saveSettings({...old,baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`});
    const result=await post('settings/test',{});assert.equal(result.status,200);assert.equal(result.value.ok,true);
    const generated=await post('articles/generate',{title:'测试',audience:'客户',purpose:'回答问题'});assert.equal(generated.status,400);assert.match(generated.value.error,/长度上限/);
  }finally{store().saveSettings(old);await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('人工确认独立记录证据、防重且不依赖助手；拒绝无确认、错误平台和处理中任务',async()=>{
  const db=store();const a=db.createAccount('zhihu');db.confirmAccount(a.id,'人工确认作者','https://www.zhihu.com/people/manual-proof');
  const article=db.saveArticle({title:'人工核对标题',body:'人工核对正文',audience:'客户',purpose:'介绍',checks:[]});
  db.createBatch(article.id,[a.id],crypto.randomUUID());const t=db.tasks().find(t=>t.articleId===article.id)!;
  const input={id:t.id,url:'https://zhuanlan.zhihu.com/p/123456',confirmed:true};
  assert.equal((await post('tasks/confirm-publication',input)).status,400);
  db.setTask(t.id,'needs_action','HTTP 403');
  assert.equal((await post('tasks/confirm-publication',{...input,confirmed:false})).status,400);
  assert.equal((await post('tasks/confirm-publication',{...input,url:'https://www.sohu.com/a/123_456'})).status,400);
  const command=db.command('check',t.id);assert.equal((await post('tasks/confirm-publication',input)).status,400);
  db.put('commands',{...command,status:'failed',message:'HTTP 403'});db.heartbeat('助手已停止');
  const result=await post('tasks/confirm-publication',input);assert.equal(result.status,200);
  const saved=db.tasks().find(x=>x.id===t.id)!;assert.equal(saved.status,'manually_confirmed');assert.equal(saved.manualConfirmation?.url,input.url);assert.ok(saved.manualConfirmation?.confirmedAt);assert.equal(saved.manualConfirmation?.previousStatus,'needs_action');assert.equal(saved.manualConfirmation?.previousMessage,'HTTP 403');assert.deepEqual(saved.snapshot,t.snapshot);
  assert.throws(()=>db.retryTask(t.id),/不能重新提交/);assert.throws(()=>db.createBatch(article.id,[a.id],crypto.randomUUID()),/重复发布/);
  assert.equal((await post('tasks/confirm-publication',input)).value.manualConfirmation.confirmedAt,saved.manualConfirmation?.confirmedAt);
});

after(()=>store().close());



test('结构化生成校验实际模型响应，保存编辑后的格式元数据',async()=>{
  const server=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const prompt=JSON.parse(raw).messages.at(-1).content;
    assert.match(prompt,/生成 2 组问答/);
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({title:'FAQ',items:[{question:'问题一',answer:'答案一'},{question:'问题二',answer:'答案二'}],checks:['核对事实']})}}]}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const old=store().settings();
  try{
    store().saveSettings({...old,baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`});
    const generated=await post('articles/generate',{title:'售后',audience:'客户',purpose:'解答',contentFormat:'faq',itemCount:2});
    assert.equal(generated.status,200);
    assert.equal(generated.value.contentFormat,'faq');
    assert.match(generated.value.body,/## 问题二/);
    const saved=await post('articles/save',{...generated.value,body:'人工修改的正文'});
    assert.equal(saved.status,200);
    assert.equal(saved.value.contentFormat,'faq');
    assert.equal(saved.value.body,'人工修改的正文');
  }finally{store().saveSettings(old);await new Promise<void>(resolve=>server.close(()=>resolve()));}
});



test('回退后监测和自动运营接口关闭，保留数据库中的历史记录',async()=>{
  store().db.exec("CREATE TABLE IF NOT EXISTS monitor (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
  store().db.prepare("INSERT INTO monitor(id,data) VALUES(?,?)").run('rollback-retained',JSON.stringify({id:'rollback-retained',brand:'历史数据'}));
  assert.equal((await post('monitor/save',{})).status,404);
  assert.equal((await post('autopilot/config',{})).status,404);
  const current=await state();
  assert.equal('monitor' in current,false);
  assert.equal('autoRuns' in current,false);
  assert.ok(store().db.prepare("SELECT id FROM monitor WHERE id=?").get('rollback-retained'));
});

test('RAG 接口保留旧配置，拒绝远端地址，索引失败不会创建假资料',async()=>{
 const original=store().settings();
 const bad=await post('rag/settings',{enabled:true,baseUrl:'https://example.com',embeddingModel:'embeddinggemma',chatModel:'qwen3:1.7b'});assert.equal(bad.status,400);
 const save=await post('rag/settings',{enabled:true,baseUrl:'http://127.0.0.1:11434',embeddingModel:'embeddinggemma',chatModel:'qwen3:1.7b'});assert.equal(save.status,200);assert.deepEqual(store().settings(),original);
 assert.equal((await post('rag/answer',{knowledgeId:crypto.randomUUID(),question:'什么价格'})).status,400);
 const s=await state();assert.equal(s.rag.settings.enabled,true);assert.equal("id" in s.rag.settings,false);assert.ok(Array.isArray(s.rag.indexes));
 await post('rag/settings',{...s.rag.settings,enabled:false});
});

test('本机 RAG 写作走本机请求并保留检索快照；设置变化不切换到在线',async()=>{
 let endpointHits:string[]=[];
 const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;endpointHits.push(req.url||'');res.setHeader('Content-Type','application/json');if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'embeddinggemma:latest',digest:'local-embed'},{name:'qwen3:1.7b',digest:'local-chat'}]}));return;}
 const payload=JSON.parse(raw);if(req.url==='/api/embed'){res.end(JSON.stringify({embeddings:payload.input.map(()=>[1,0])}));return;}
 res.end(JSON.stringify({message:{content:JSON.stringify({title:'本机文章',body:'设备质保三个月。',checks:[]})}}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address() as {port:number};
 try{assert.equal((await post('rag/settings',{enabled:true,baseUrl:`http://127.0.0.1:${addr.port}`,embeddingModel:'embeddinggemma',chatModel:'qwen3:1.7b'})).status,200);const knowledge=store().createKnowledge('本机写作测试','设备质保三个月。');assert.equal((await post('rag/index',{knowledgeId:knowledge.id})).status,200);const generated=await post('articles/generate',{knowledgeId:knowledge.id,title:'设备质保多久',audience:'客户',purpose:'说明质保'});assert.equal(generated.status,200);assert.equal(generated.value.retrievalSources[0].name,'粘贴资料');assert.equal(generated.value.retrievalSources[0].text,'设备质保三个月。');assert.ok(endpointHits.includes('/api/chat'));assert.ok(!endpointHits.includes('/chat/completions'));const {writingContext,writingCompletion}=await import('../src/lib/rag-writing');const context=await writingContext(store(),knowledge.id,'质保');await post('rag/settings',{...(await state()).rag.settings,enabled:false});await writingCompletion(store(),'只返回 JSON','质保',context.local);assert.equal(endpointHits.at(-1),'/api/chat');}
 finally{await post('rag/settings',{...(await state()).rag.settings,enabled:false});await new Promise<void>(r=>server.close(()=>r()));}
});

test('本机索引失败仍保存上传资料，并返回可见错误',async()=>{
 await post('rag/settings',{enabled:true,baseUrl:'http://127.0.0.1:1',embeddingModel:'embeddinggemma',chatModel:'qwen3:1.7b'});
 const form=new FormData();form.set('name','索引失败保留资料');form.set('text','测试质保资料');const result=await post('knowledge/upload',form);assert.equal(result.status,200);assert.ok(result.value.indexError);assert.equal(store().get<{text:string}>('knowledge',result.value.id)?.text,'测试质保资料');
 await post('rag/settings',{...(await state()).rag.settings,enabled:false});
});

test('Chrome 扩展 API 拒绝未配对来源，默认扩展离线不打开独立浏览器',async()=>{
 const db=store();db.heartbeat();db.put('config',{id:'browser-mode',mode:'extension'});
 const a=db.createAccount('zhihu');const login=await post('accounts/login',{id:a.id});assert.equal(login.status,400);assert.match(login.value.error,/扩展未连接/);
 const pair=await post('browser/pair-code',{});assert.match(pair.value.code,/^[a-f0-9]{32}$/);assert.equal((await post('browser/extension/poll',{})).status,403);
 const origin='chrome-extension://'+'c'.repeat(32);
 async function extension(path:string,value:unknown,token=''){const req=new NextRequest(`http://127.0.0.1:3000/api/browser/extension/${path}`,{method:'POST',headers:{host:'127.0.0.1:3000',origin,'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(value)});const r=await POST(req,context(`browser/extension/${path}`));return{status:r.status,value:await r.json()};}
 assert.equal((await extension('poll',{})).status,400);const connected=await extension('pair',{code:pair.value.code});assert.equal(connected.status,200);assert.ok(connected.value.token);
 assert.equal(JSON.stringify(await state()).includes(connected.value.token),false);assert.equal((await extension('poll',{},connected.value.token)).status,200);
 const {enqueueBrowserJob,browserJob}=await import('../src/lib/browser-bridge');const job=enqueueBrowserJob(db,'login','zhihu');assert.equal((await extension('heartbeat',{},connected.value.token)).status,200);assert.equal(browserJob(db,job.id)?.status,'queued');
 assert.equal((await extension('asset',{id:crypto.randomUUID(),file:crypto.randomUUID()+'.png'},connected.value.token)).status,400);
 assert.equal((await post('accounts/login',{id:a.id})).status,200);for(const c of db.all<any>('commands'))if(c.target===a.id)db.put('commands',{...c,status:'failed',message:'fixture cleanup'});
 await post('browser/disconnect',{});db.put('config',{id:'browser-mode',mode:'isolated'});
});
test('抖音文章人工确认保存正确链接和快照，不创建提交指令',async()=>{
 const db=store();const a=db.createAccount('douyin');db.confirmAccount(a.id,'测试作者','https://creator.douyin.com/account?id=12345');
 const article=db.saveArticle({title:'抖音文章',body:'测试正文',audience:'客户',purpose:'测试',checks:[]});db.createBatch(article.id,[a.id],crypto.randomUUID(),undefined,article.revision,{images:['fixture.png'],title:'抖音文章',body:'测试正文'});const t=db.tasks().find(t=>t.articleId===article.id)!;db.setTask(t.id,'needs_action','准备超时',{stage:'awaiting_platform_confirmation',manualPublicationClaim:true});
 const before=db.all('commands').length;const url='https://www.douyin.com/article/7707179220908150066';const result=await post('tasks/confirm-publication',{id:t.id,url,confirmed:true});assert.equal(result.status,200);assert.equal(result.value.status,'manually_confirmed');assert.equal(result.value.manualConfirmation.url,url);assert.deepEqual(result.value.snapshot,t.snapshot);assert.equal(db.all('commands').length,before);
});
test('百家号分享页人工确认支持合法文章标识，但拒绝直接用预览地址',async()=>{
 const db=store();const a=db.createAccount('baijiahao');db.confirmAccount(a.id,'测试百家号作者','https://baijiahao.baidu.com/builder/rc/settings/accountSet?id=123456');const article=db.saveArticle({title:'百度分享文章',body:'测试正文',audience:'客户',purpose:'测试',checks:[]});db.createBatch(article.id,[a.id],crypto.randomUUID(),'fixture.png');const task=db.tasks().find(t=>t.articleId===article.id)!;db.setTask(task.id,'needs_action','等待人工确认');
 const url=new URL('https://mbd.baidu.com/newspage/data/landingsuper');url.searchParams.set('context',JSON.stringify({nid:'news_10039597693489046961',sourceFrom:'bjh'}));url.searchParams.set('preview','1');const rejected=await post('tasks/confirm-publication',{id:task.id,url:url.toString(),confirmed:true});assert.equal(rejected.status,400);assert.match(rejected.value.error,/预览/);url.searchParams.delete('preview');const accepted=await post('tasks/confirm-publication',{id:task.id,url:url.toString(),confirmed:true});assert.equal(accepted.status,200);assert.equal(accepted.value.status,'manually_confirmed');assert.equal(accepted.value.publicUrl,url.toString());
});
