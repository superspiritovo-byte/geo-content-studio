import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Page} from 'playwright';
import {readIdentity,selectAccountPage} from '../src/lib/adapters';

function zhihuPage({status=200,data={name:'测试作者',url_token:'en-na-42'},url='https://www.zhihu.com/people/en-na-42',own=true}:{status?:number;data?:unknown;url?:string;own?:boolean}={}){
  const locator=(selector:string):any=>({count:async()=>selector==='.ProfileHeader-name'?1:0,first(){return this;},isVisible:async()=>selector==='.ProfileHeader-name',innerText:async()=>'测试作者',nth(){return this;}});
  return {url:()=>url,isClosed:()=>false,context:()=>({request:{get:async(endpoint:string)=>{assert.equal(endpoint,'https://www.zhihu.com/api/v4/me');return{ok:()=>status===200,json:async()=>data,dispose:async()=>{}};}}}),locator,getByText:()=>({isVisible:async()=>own})} as unknown as Page;
}
test('知乎头像没有姓名链接时，从当前登录账号响应读取真实姓名与主页标识',async()=>{
  assert.deepEqual(await readIdentity(zhihuPage(),'zhihu'),{name:'测试作者',identity:'https://www.zhihu.com/people/en-na-42'});
});
test('知乎接口不可用时，自己的主页姓名和编辑个人资料共同证明身份',async()=>{
  assert.deepEqual(await readIdentity(zhihuPage({status:403}),'zhihu'),{name:'测试作者',identity:'https://www.zhihu.com/people/en-na-42'});
});
test('他人主页不能用标题冒充登录身份，缺失稳定标识的响应也不能采用',async()=>{
  await assert.rejects(()=>readIdentity(zhihuPage({status:401,own:false}),'zhihu'),/身份|标识/);
  await assert.rejects(()=>readIdentity(zhihuPage({data:{name:'假姓名'},own:false}),'zhihu'),/身份|标识/);
});
test('选择已打开的平台新标签页，不固定读取第一个空白或登录标签页',()=>{
  const page=(url:string,closed=false)=>({url:()=>url,isClosed:()=>closed});
  const blank=page('about:blank'),login=page('https://www.zhihu.com/signin'),profile=page('https://www.zhihu.com/people/self'),other=page('https://www.zhihu.com.evil.example/people/other');
  assert.equal(selectAccountPage([blank,login,profile,other],'zhihu'),profile);
  assert.equal(selectAccountPage([blank,login,page(profile.url(),true)],'zhihu'),login);
});
