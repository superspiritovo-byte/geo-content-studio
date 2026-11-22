import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveDataLocation} from '../scripts/data-location.mjs';
test('固定本机数据位置；已配置的数据库丢失时拒绝创建空工作区',()=>{
 const root=mkdtempSync(join(tmpdir(),'geo-location-'));try{const data=join(root,'local-storage');mkdirSync(data);writeFileSync(join(root,'local-data.json'),JSON.stringify({version:1,directory:data,workspaceId:'expected-workspace'}));assert.throws(()=>resolveDataLocation(root,{}),/数据库不存在/);writeFileSync(join(data,'geo.sqlite'),'fixture');assert.deepEqual(resolveDataLocation(root,{}),{directory:data,workspaceId:'expected-workspace'});const temporary=join(root,'test-storage');assert.deepEqual(resolveDataLocation(root,{GEO_DATA_DIR:temporary}),{directory:temporary,workspaceId:undefined});}finally{rmSync(root,{recursive:true,force:true});}
});
test('不接受损坏或相对路径的数据位置配置',()=>{
 const root=mkdtempSync(join(tmpdir(),'geo-location-'));try{writeFileSync(join(root,'local-data.json'),JSON.stringify({version:1,directory:'relative',workspaceId:'id'}));assert.throws(()=>resolveDataLocation(root,{}),/配置无效/);}finally{rmSync(root,{recursive:true,force:true});}
});

test('数据库工作区标识错误时拒绝打开，原记录保持不变',async()=>{
 const {Store}=await import('../src/lib/store');const root=mkdtempSync(join(tmpdir(),'geo-store-id-'));try{const file=join(root,'geo.sqlite');const db=new Store(file);db.put('config',{id:'workspace',value:'correct'});db.createKnowledge('原资料','真实内容');db.close();assert.throws(()=>new Store(file,'wrong'),/工作区标识/);const valid=new Store(file,'correct');assert.equal(valid.knowledge()[0].text,'真实内容');valid.close();}finally{rmSync(root,{recursive:true,force:true});}
});
