import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.GEO_DATA_DIR=mkdtempSync(join(tmpdir(),'geo-ext-publish-'));
const {Store}=await import('../src/lib/store');
const {prepareInChrome,validateBrowserIdentity}=await import('../src/lib/extension-publishing');
function setup(){const db=new Store(':memory:');const a=db.createAccount('zhihu');db.confirmAccount(a.id,'目标作者','https://www.zhihu.com/people/target');const article=db.saveArticle({title:'准备标题',body:'## 小标题\n\n**正文**',audience:'客户',purpose:'说明',checks:[]});db.createBatch(article.id,[a.id],'test');const task=db.claimTask()!;return{db,a,task};}
test('扩展发布只准备，不提交；账号不符不填入；中断保留防重和账号占用',async()=>{
 const {db,task}=setup();let prepares=0;const request:any=async(_db:any,action:string)=>{if(action==='identity')return{name:'其他作者',identity:'https://www.zhihu.com/people/other'};prepares++;return{prepared:true};};await assert.rejects(prepareInChrome(db,task,request),/账号不符/);assert.equal(prepares,0);
 const success:any=async(_db:any,action:string,_platform:string,payload:any)=>{if(action==='identity')return{name:'目标作者',identity:task.identity};assert.equal(action,'prepare');assert.match(payload.html,/<h2>/);assert.equal(payload.taskId,task.id);return{prepared:true};};await prepareInChrome(db,task,success);const saved=db.tasks()[0];assert.equal(saved.status,'needs_action');assert.equal(saved.stage,'awaiting_platform_confirmation');assert.equal(saved.submissionAttempt,false);assert.equal(saved.manualPublicationClaim,true);assert.throws(()=>db.retryTask(task.id),/不能重新提交/);db.releaseImageTask(task.id);assert.equal(db.tasks()[0].status,'handled');db.close();
 const crash=setup();const failing:any=async(_db:any,action:string)=>{if(action==='identity')return{name:'目标作者',identity:crash.task.identity};throw Error('断线');};await assert.rejects(prepareInChrome(crash.db,crash.task,failing),/断线/);crash.db.recoverInterrupted();assert.equal(crash.db.tasks()[0].stage,'awaiting_platform_confirmation');assert.throws(()=>crash.db.retryTask(crash.task.id),/不能重新提交/);crash.db.close();
});
test('扩展身份不能采用其他平台或页面的作者标识',()=>{
 assert.throws(()=>validateBrowserIdentity('zhihu',{name:'伪作者',identity:'https://www.sohu.com/a/1_2'}));assert.throws(()=>validateBrowserIdentity('zhihu',{name:'作者',identity:'https://www.zhihu.com/question/1'}));assert.equal(validateBrowserIdentity('bilibili',{name:'测试',identity:'https://space.bilibili.com/1234'}).name,'测试');
});
