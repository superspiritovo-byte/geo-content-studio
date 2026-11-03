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
after(()=>store().close());
