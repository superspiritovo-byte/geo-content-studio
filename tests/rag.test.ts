import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chunkText,cosine,localBase,validateVectors} from '../src/lib/rag';
test('chunking bounds and complete coverage with overlap',()=>{const text='维修质保。'.repeat(400);const chunks=chunkText(text);assert.ok(chunks.length>1);assert.ok(chunks.every(c=>c.length<=700));for(let i=0;i<text.length;i+=50)assert.ok(chunks.some(c=>c.includes(text.slice(i,i+50))));});
test('loopback only, no credentials or remote host',()=>{assert.equal(localBase('http://127.0.0.1:11434'),'http://127.0.0.1:11434');for(const url of ['https://example.com','http://localhost.evil.com','http://user:pass@127.0.0.1','http://127.0.0.1/path','http://0.0.0.0'])assert.throws(()=>localBase(url));});
test('vectors reject mismatches, zero and nonfinite; cosine orders',()=>{assert.throws(()=>validateVectors([[0,0]],1));assert.throws(()=>validateVectors([[1,0],[1]],2));assert.throws(()=>validateVectors([[Infinity,1]],1));assert.throws(()=>validateVectors([[1,2]],2));assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([1,0],[0,1]),0);});
import {createServer} from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.GEO_DATA_DIR=mkdtempSync(join(tmpdir(),'geo-rag-test-'));
const {Store}=await import('../src/lib/store');
const {buildIndex,retrieve,indexStatus,ragSettings,answerQuestion}=await import('../src/lib/rag');
test('index is isolated, stale corpus rejected, failed rebuild retains old index and sources',async()=>{
 const db=new Store(':memory:');let fail=false;let digest='digest1';let answerIds=['1-1'];let onChat:(()=>void)|undefined;const requests:string[]=[];
 const server=createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;requests.push(raw);res.setHeader('Content-Type','application/json');if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'embeddinggemma:latest',digest},{name:'qwen3:1.7b',digest:'chat'}]}));return;}if(fail){res.statusCode=500;res.end('{}');return;}const b=JSON.parse(raw);if(req.url==='/api/chat'){onChat?.();res.end(JSON.stringify({message:{content:JSON.stringify({answer:'质保三个月',citationIds:answerIds})}}));return;}res.end(JSON.stringify({embeddings:b.input.map((x:string)=>x.includes('质保')?[1,0]:[0,1])}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as {port:number};db.put('config',{id:'rag',...ragSettings(db),enabled:true,baseUrl:`http://127.0.0.1:${address.port}`});
 try {const a=db.createKnowledge('甲','质保三个月'),b=db.createKnowledge('乙','乙机密');db.addDocument(a.id,'坏文件','failed','失败秘密','error');await buildIndex(db,a.id);assert.ok(indexStatus(db,a.id).ready);const sources=await retrieve(db,a.id,'质保多久');assert.match(sources[0].text,/三个月/);assert.ok(requests.every(r=>!r.includes('乙机密')&&!r.includes('失败秘密')));const result=await answerQuestion(db,a.id,'质保多久');assert.deepEqual(result.citationIds,['1-1']);onChat=()=>db.put('knowledge',{...a,text:'质保六个月'});await assert.rejects(answerQuestion(db,a.id,'质保多久'),/回答期间资料/);onChat=undefined;db.put('knowledge',a);answerIds=['fake'];await assert.rejects(answerQuestion(db,a.id,'质保多久'),/无效引用/);answerIds=[];assert.match((await answerQuestion(db,a.id,'质保多久')).answer,/无法回答/);await assert.rejects(retrieve(db,b.id,'质保'),/索引/);digest='digest2';await assert.rejects(retrieve(db,a.id,'质保'),/模型已更换/);digest='digest1';db.put('knowledge',{...a,text:'质保六个月'});assert.equal(indexStatus(db,a.id).ready,false);await assert.rejects(retrieve(db,a.id,'质保'),/资料已更新/);fail=true;await assert.rejects(buildIndex(db,a.id),/失败/);assert.equal(indexStatus(db,a.id).count,1);}
 finally{db.close();await new Promise<void>(r=>server.close(()=>r()));}
});
