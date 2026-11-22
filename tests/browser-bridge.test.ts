import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.GEO_DATA_DIR=mkdtempSync(join(tmpdir(),'geo-bridge-test-'));
const {Store}=await import('../src/lib/store');
const bridge=await import('../src/lib/browser-bridge');
const origin='chrome-extension://'+'a'.repeat(32);
test('扩展配对只能用一次，绑定来源，任务只领取一次且回执不能覆盖',()=>{
 const db=new Store(':memory:');const code=bridge.createPairCode(db);const token=bridge.pairExtension(db,code,origin);
 assert.throws(()=>bridge.pairExtension(db,code,origin),/配对/);assert.throws(()=>bridge.authenticateExtension(db,token,'chrome-extension://'+'b'.repeat(32)),/凭据/);
 bridge.authenticateExtension(db,token,origin);const job=bridge.enqueueBrowserJob(db,'login','zhihu');
 const first=bridge.claimBrowserJob(db);assert.equal(first?.id,job.id);assert.equal(bridge.claimBrowserJob(db),undefined);
 bridge.finishBrowserJob(db,job.id,{ok:true,result:{opened:true}});assert.throws(()=>bridge.finishBrowserJob(db,job.id,{ok:false,error:'late'}),/结束/);
 assert.equal(bridge.browserJob(db,job.id)?.status,'done');bridge.disconnectExtension(db);assert.throws(()=>bridge.authenticateExtension(db,token,origin),/凭据/);db.close();
});
test('扩展离线不创建可重播任务，超时回执无效，重新配对作废旧任务',()=>{
 const db=new Store(':memory:');assert.throws(()=>bridge.enqueueBrowserJob(db,'login','zhihu'),/连接/);
 const token=bridge.pairExtension(db,bridge.createPairCode(db),origin);bridge.authenticateExtension(db,token,origin);
 const job=bridge.enqueueBrowserJob(db,'identity','zhihu');bridge.cancelBrowserJob(db,job.id,'超时');assert.equal(bridge.claimBrowserJob(db),undefined);assert.throws(()=>bridge.finishBrowserJob(db,job.id,{ok:true,result:{}}),/结束/);
 const next=bridge.enqueueBrowserJob(db,'login','zhihu');bridge.pairExtension(db,bridge.createPairCode(db),origin);assert.equal(bridge.browserJob(db,next.id)?.status,'failed');db.close();
});
