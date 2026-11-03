import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.GEO_DATA_DIR = mkdtempSync(join(tmpdir(), 'geo-test-'));
const { Store } = await import('../src/lib/store');
const { buildContext, parseModelJSON, assertContextFits } = await import('../src/lib/ai');

test('资料隔离：只使用选中的资料和成功解析文件', () => {
  const db = new Store(':memory:');
  const a = db.createKnowledge('企业甲', '甲产品价格 100 元');
  db.createKnowledge('企业乙', '乙企业秘密');
  db.addDocument(a.id, '失败.docx', 'failed', '', '解析失败');
  const context = buildContext(db, a.id);
  assert.match(context, /甲产品价格/);
  assert.doesNotMatch(context, /乙企业|失败.docx/);
  assert.throws(() => buildContext(db, 'missing'), /资料不存在/);
  db.close();
});
test('超容量拒绝而不是静默截断；兼容 fenced JSON', () => {
  assert.throws(() => assertContextFits('长'.repeat(200), 100, 0), /上下文/);
  assert.deepEqual(parseModelJSON('```json\n{"title":"题目"}\n```'), {title:'题目'});
  assert.throws(() => parseModelJSON('不是 JSON'), /JSON/);
});
test('发布快照、重复提交与结果检查不创建新任务', () => {
  const db = new Store(':memory:');
  const article = db.saveArticle({ title:'原题', body:'原文', audience:'客户', purpose:'回答问题', checks:[] });
  const account = db.createAccount('zhihu');
  db.confirmAccount(account.id, '作者甲', 'https://www.zhihu.com/people/author-a');
  const batch = db.createBatch(article.id, [account.id], 'request-1');
  assert.equal(db.createBatch(article.id, [account.id], 'request-1').id, batch.id);
  assert.throws(() => db.createBatch(article.id, [account.id], 'request-2'), /重复/);
  db.saveArticle({...article, title:'修改题', body:'修改文'});
  assert.equal(db.tasks()[0].snapshot.title, '原题');
  assert.equal(db.tasks().length, 1);
  assert.throws(() => db.setTask(db.tasks()[0].id, 'published', '伪成功'), /核验/);
  db.close();
});
test('重启后不重新执行可能已经提交的任务', () => {
  const file = join(process.env.GEO_DATA_DIR!, 'restart.sqlite');
  let db = new Store(file);
  const a = db.saveArticle({title:'标题',body:'正文',audience:'客户',purpose:'介绍',checks:[]});
  const account = db.createAccount('sohu');
  db.confirmAccount(account.id,'作者','https://mp.sohu.com/profile?xpt=author');
  db.createBatch(a.id,[account.id],'restart');
  const task = db.claimTask()!;
  assert.equal(task.status,'publishing');
  db.close(); db = new Store(file); db.recoverInterrupted();
  assert.equal(db.tasks()[0].status,'needs_action');
  assert.equal(db.claimTask(),undefined);
  assert.equal(db.articles()[0].title,'标题');
  db.close();
});
test('发布前验证账号与封面约束', () => {
  const db = new Store(':memory:');
  const a = db.saveArticle({title:'标题',body:'正文',audience:'客户',purpose:'介绍',checks:[]});
  assert.throws(() => db.createBatch(a.id,[],'empty'),/账号/);
  const acc = db.createAccount('baijiahao');
  assert.throws(() => db.createBatch(a.id,[acc.id],'unconfirmed'),/登录/);
  db.confirmAccount(acc.id,'作者','https://author.baidu.com/home/123');
  assert.throws(() => db.createBatch(a.id,[acc.id],'no-cover'),/封面/);
  db.close();
});
test('同一真实平台账号不能重复保存；相同正文复制为另一文章也不会重发',()=>{
  const db=new Store(':memory:');const a=db.createAccount('zhihu');const b=db.createAccount('zhihu');
  db.confirmAccount(a.id,'作者','https://www.zhihu.com/people/same');
  assert.throws(()=>db.confirmAccount(b.id,'作者','https://www.zhihu.com/people/same?utm_source=foo'),/已存在/);
  const article=db.saveArticle({title:'同一内容',body:'完整正文',audience:'客户',purpose:'介绍',checks:[]});db.createBatch(article.id,[a.id],'first');
  const copy=db.saveArticle({title:article.title,body:article.body,audience:'客户',purpose:'介绍',checks:[]});
  assert.throws(()=>db.createBatch(copy.id,[a.id],'second'),/重复/);db.close();
});
test('预览确认与提交之间文章发生变化时拒绝发布',()=>{
  const db=new Store(':memory:');const a=db.createAccount('zhihu');db.confirmAccount(a.id,'作者','https://www.zhihu.com/people/revision');
  const article=db.saveArticle({title:'用户看过的标题',body:'用户看过的正文',audience:'客户',purpose:'介绍',checks:[]});
  const reviewedRevision=article.revision;db.saveArticle({...article,body:'另一窗口修改后的内容'});
  assert.throws(()=>db.createBatch(article.id,[a.id],'revision-test',undefined,reviewedRevision),/文章已更新/);
  assert.equal(db.tasks().length,0);db.close();
});
test('一篇文章在三个账号分别记录结果；检查指令不增加发布任务',()=>{
  const db=new Store(':memory:');
  const accounts=[db.createAccount('zhihu'),db.createAccount('baijiahao'),db.createAccount('sohu')];
  const identities=['https://www.zhihu.com/people/a','https://author.baidu.com/home?app_id=123','https://mp.sohu.com/profile?xpt=a'];
  accounts.forEach((a,i)=>db.confirmAccount(a.id,`作者${i}`,identities[i]));
  const article=db.saveArticle({title:'逐账号结果',body:'真实正文',audience:'客户',purpose:'介绍',checks:[]});
  db.createBatch(article.id,accounts.map(a=>a.id),'all-accounts','fixture.png',article.revision);
  const tasks=db.tasks();const a=tasks.find(t=>t.platform==='zhihu')!,b=tasks.find(t=>t.platform==='baijiahao')!,c=tasks.find(t=>t.platform==='sohu')!;
  assert.throws(()=>db.verifiedTask(a.id,'https://zhuanlan.zhihu.com/p/123',{identity:identities[2],title:article.title,bodyMatches:true,publiclyAccessible:true}),/核验/);
  db.verifiedTask(a.id,'https://zhuanlan.zhihu.com/p/123',{identity:identities[0],title:article.title,bodyMatches:true,publiclyAccessible:true});
  db.setTask(b.id,'submitted','审核中',{submissionAttempt:true});db.setTask(c.id,'needs_action','需要验证码');
  db.command('check',b.id);db.command('check',b.id);
  assert.equal(db.all('commands').length,1);assert.equal(db.tasks().length,3);
  assert.equal(db.tasks().find(t=>t.id===a.id)?.status,'published');assert.equal(db.tasks().find(t=>t.id===b.id)?.status,'submitted');assert.equal(db.tasks().find(t=>t.id===c.id)?.status,'needs_action');
  assert.throws(()=>db.retryTask(b.id),/可能已提交/);db.close();
});
test('可保存已识别身份，但未确认平台资格时不创建发布任务',()=>{
 const db=new Store(':memory:');const a=db.createAccount('sohu');
 db.put('accounts',{...a,publishable:false});
 const account=db.confirmAccount(a.id,'已登录的搜狐号','https://mp.sohu.com/mpfe/v4/personalCenter/account?id=123');
 assert.equal(account.status,'ready');assert.match(account.message,/发布资格/);
 const article=db.saveArticle({title:'测试',body:'正文',audience:'客户',purpose:'介绍',checks:[]});
 assert.throws(()=>db.createBatch(article.id,[a.id],'not-eligible'),/发布资格/);assert.equal(db.tasks().length,0);db.close();
});
test('图文发布校验素材，保存独立的图片顺序和文案快照',()=>{
 const db=new Store(':memory:');const a=db.createAccount('xiaohongshu');db.confirmAccount(a.id,'测试小红书','https://www.xiaohongshu.com/user/profile/1234567890abcdef12345678');
 const article=db.saveArticle({title:'原文',body:'原始长文',audience:'客户',purpose:'介绍',checks:[]});
 assert.throws(()=>db.createBatch(article.id,[a.id],'missing-images'),/图片/);
 const post={images:['a.jpg','b.png'],title:'图文短标题',body:'图文文案'};
 db.createBatch(article.id,[a.id],'valid-images',undefined,article.revision,post);
 post.images.reverse();post.body='修改后的文案';
 assert.deepEqual(db.tasks()[0].images,['a.jpg','b.png']);assert.equal(db.tasks()[0].postBody,'图文文案');assert.equal(db.tasks()[0].snapshot.body,'原始长文');db.close();
});
test('图文草稿等待平台确认时保留账号，明确释放后才处理下一篇',()=>{
 const db=new Store(':memory:');const a=db.createAccount('douyin');db.confirmAccount(a.id,'作者','https://www.douyin.com/user/test');
 const article=db.saveArticle({title:'文章',body:'正文',audience:'客户',purpose:'介绍',checks:[]});
 db.createBatch(article.id,[a.id],'first-post',undefined,article.revision,{title:'第一篇',body:'正文',images:['a.jpg']});const first=db.claimTask()!;
 db.setTask(first.id,'needs_action','等待确认',{stage:'awaiting_platform_confirmation',manualPublicationClaim:true});
 db.createBatch(article.id,[a.id],'second-post',undefined,article.revision,{title:'第二篇',body:'正文',images:['b.jpg']});
 assert.equal(db.claimTask(),undefined);db.releaseImageTask(first.id);assert.equal(db.claimTask()?.postTitle,'第二篇');assert.equal(db.get<any>('tasks',first.id).status,'handled');db.close();
});
test('用户已提供手动发布链接后，不允许重新准备重复发布',()=>{
 const db=new Store(':memory:');const a=db.createAccount('zhihu');db.confirmAccount(a.id,'作者','https://www.zhihu.com/people/a');
 const article=db.saveArticle({title:'已手动发出',body:'正文',audience:'客户',purpose:'介绍',checks:[]});db.createBatch(article.id,[a.id],'manual');const t=db.tasks()[0];
 db.setTask(t.id,'needs_action','等待核验',{manualPublicationClaim:true});assert.throws(()=>db.retryTask(t.id),/可能已提交/);db.close();
});
