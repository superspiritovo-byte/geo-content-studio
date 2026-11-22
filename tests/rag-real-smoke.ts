import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
process.env.GEO_DATA_DIR=mkdtempSync(join(tmpdir(),'geo-rag-real-'));
const {Store}=await import('../src/lib/store');
const {buildIndex,retrieve,answerQuestion,ragDefaults}=await import('../src/lib/rag');
const {writingContext,writingCompletion}=await import('../src/lib/rag-writing');
const {articleSchema,parseModelJSON,writingSystem}=await import('../src/lib/ai');
const db=new Store();
try{db.put('config',{id:'rag',...ragDefaults,enabled:true});const a=db.createKnowledge('测试企业甲（虚构）','伺服驱动器维修后的质保期为三个月。质保期内，同一故障免费返修。进水或人为损坏不在免费返修范围内。');db.createKnowledge('测试企业乙（隔离验证）','企业乙秘密口令：不应出现于甲的检索。质保十年。');const idx=await buildIndex(db,a.id);const sources=await retrieve(db,a.id,'修好后又坏了，多久能免费修');assert.ok(sources.length);assert.ok(sources.every(s=>!s.text.includes('企业乙')&&!s.text.includes('十年')));const answer=await answerQuestion(db,a.id,'维修后的质保期多久？');assert.ok(answer.citationIds.length);assert.match(answer.answer,/三|3/);const context=await writingContext(db,a.id,'维修后的质保说明');const article=articleSchema.parse(parseModelJSON(await writingCompletion(db,writingSystem,`${context.text}\n写一段150字以内的维修质保说明，只使用上述资料。返回 {"title":"标题","body":"正文","checks":[]}`,context.local)));assert.ok(article.body);const report={temporaryDataDir:process.env.GEO_DATA_DIR,indexCount:idx.count,sources:sources.map(s=>({id:s.id,name:s.name,score:s.score})),answer,article};writeFileSync('test-results/rag-real-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}finally{db.close();}
