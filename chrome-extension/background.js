import {platformAction} from './platform.js';
export const routes={
 zhihu:{home:'https://www.zhihu.com/creator',editor:'https://zhuanlan.zhihu.com/write'},
 baijiahao:{home:'https://baijiahao.baidu.com/builder/rc/settings/accountSet',editor:'https://baijiahao.baidu.com/builder/rc/edit?type=news'},
 sohu:{home:'https://mp.sohu.com/mpfe/v4/personalCenter/account?curTab=1',editor:'https://mp.sohu.com/mpfe/v4/news/addarticle'},
 xiaohongshu:{home:'https://creator.xiaohongshu.com/',editor:'https://creator.xiaohongshu.com/publish/publish'},
 douyin:{home:'https://creator.douyin.com/',editor:'https://creator.douyin.com/creator-micro/content/upload?default-tab=2'},
 bilibili:{home:'https://t.bilibili.com/',editor:'https://t.bilibili.com/'}
};
const BASE='http://127.0.0.1:18080';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,data,token){const r=await fetch(`${BASE}/api/browser/extension/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(12000)});const value=await r.json();if(!r.ok)throw Error(value.error||'本机工作台连接失败');return value;}
function allowed(platform,url){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname===new URL(routes[platform].home).hostname;}catch{return false;}}
export function sameIdentity(a,b){const normalize=value=>{const u=new URL(value);u.hash='';u.pathname=u.pathname.replace(/\/+$/,'');const params=new URLSearchParams();for(const k of ['app_id','xpt','id','uk'])if(u.searchParams.has(k))params.set(k,u.searchParams.get(k));u.search=params.toString();return u.toString().replace(/\/$/,'');};try{return normalize(a)===normalize(b);}catch{return false;}}
async function settled(tabId){for(let i=0;i<100;i++){const tab=await chrome.tabs.get(tabId);let ready=tab.status==='complete';if(!ready&&tab.url?.startsWith('https://'))try{const result=await chrome.scripting.executeScript({target:{tabId},func:()=>!!document.body&&document.readyState!=='loading'});ready=result[0]?.result===true;}catch{}if(ready){await sleep(900);return;}await sleep(250);}throw Error('平台页面加载超时，请检查当前 Chrome 标签页');}
async function run(tabId,platform,action,payload={}){const tab=await chrome.tabs.get(tabId);const u=new URL(tab.url||'');const permits=platform==='zhihu'?['www.zhihu.com','zhuanlan.zhihu.com']:platform==='bilibili'?['t.bilibili.com','www.bilibili.com']: [new URL(routes[platform].home).hostname];if(u.protocol!=='https:'||!permits.includes(u.hostname))throw Error('平台发生跳转，请完成登录或验证后重试');const result=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:platformAction,args:[platform,action,payload]});if(result.length!==1||!result[0].result)throw Error(`平台操作 ${action} 未返回可确认结果${result[0]?.error?.message?'：'+result[0].error.message:''}`);if(result[0].result.pageError)throw Error(result[0].result.pageError);return result[0].result;}
async function accountTab(platform,accountId){const key=`tab:${accountId}`;const saved=await chrome.storage.session.get(key);if(saved[key])try{const t=await chrome.tabs.get(saved[key]);if(allowed(platform,t.url))return t;}catch{}
 const candidates=(await chrome.tabs.query({})).filter(t=>allowed(platform,t.url)).sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0));const tab=candidates[0]||await chrome.tabs.create({url:routes[platform].home,active:true});await chrome.storage.session.set({[key]:tab.id});await settled(tab.id);return tab;
}
async function execute(job,token){if(!routes[job.platform]||!['login','identity','prepare'].includes(job.action)||Date.now()>job.expiresAt)throw Error('不支持或已过期的工作台操作');const p=job.payload||{};const tab=await accountTab(job.platform,p.accountId);
 if(job.action==='login'){await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});return{opened:true};}
 if(job.platform==='baijiahao'&&!new URL(tab.url).pathname.startsWith('/builder/rc/settings/accountSet')){const settings=await chrome.tabs.create({url:routes.baijiahao.home,active:true,windowId:tab.windowId});await chrome.storage.session.set({[`tab:${p.accountId}`]:settings.id});await settled(settings.id);tab.id=settings.id;tab.url=routes.baijiahao.home;}
 const identity=await run(tab.id,job.platform,'identity');
 if(job.action==='identity')return identity;
 if(!sameIdentity(identity.identity,p.identity)||identity.publishable===false)throw Error('当前 Chrome 登录账号与目标账号不符或没有发布资格；未准备文章，请切换到正确账号');
 const key=`task:${p.taskId}`;const old=await chrome.storage.session.get(key);if(old[key])throw Error('此任务已打开过准备标签页，请先检查该页面；不会重复填入或覆盖草稿');
 await api('active',{id:job.id},token);
 const editor=await chrome.tabs.create({url:'about:blank',active:true,windowId:tab.windowId});await chrome.storage.session.set({[key]:editor.id});await chrome.tabs.update(editor.id,{url:routes[job.platform].editor});await settled(editor.id);
 // Recheck identity after editor navigation (the logged-in session may have changed).
 const current=await run(tab.id,job.platform,'identity');if(!sameIdentity(current.identity,p.identity))throw Error('当前登录账号已改变，已暂停，请检查准备标签页');
 if(['xiaohongshu','douyin','bilibili'].includes(job.platform)){await run(editor.id,job.platform,'switch-image');await sleep(1200);}
 await run(editor.id,job.platform,'check-empty');
 if(p.images?.length){const files=[];for(const file of p.images){if(Date.now()>job.expiresAt)throw Error('图片准备超时，请人工检查当前页面');files.push(await api('asset',{id:job.id,file},token));}await api('active',{id:job.id},token);await run(editor.id,job.platform,'upload',{files});await sleep(2200);}
 await api('active',{id:job.id},token);
 await run(editor.id,job.platform,'fill',{title:p.title,body:p.body,html:p.html});
 await chrome.windows.update(editor.windowId,{focused:true});return{prepared:true};
}
let busy=false;
async function heartbeat(){const {token}=await chrome.storage.local.get('token');if(token)try{await api('heartbeat',{},token);await chrome.storage.local.set({lastContact:Date.now()});}catch{/* The main loop shows connection errors; no browser actions are retried here. */}}
setInterval(heartbeat,15000);
async function tick(){if(busy)return;busy=true;try{const {token,outbox}=await chrome.storage.local.get(['token','outbox']);if(!token)return;
 if(outbox){try{await api('finish',outbox,token);}catch(e){if(!/已结束|超时/.test(e.message))throw e;}await chrome.storage.local.remove('outbox');}
 const {job}=await api('poll',{},token);await chrome.storage.local.set({lastContact:Date.now(),error:''});if(!job)return;
 // An interrupted operation is never replayed: server claims once; heartbeat resumes with other jobs.
 let response;try{const result=await execute(job,token);response={id:job.id,ok:true,result};}catch(e){response={id:job.id,ok:false,error:String(e.message||e).slice(0,500)};}
 await chrome.storage.local.set({outbox:response});await api('finish',response,token);await chrome.storage.local.remove('outbox');
 }catch(e){await chrome.storage.local.set({error:String(e.message||e).slice(0,500)});}finally{busy=false;}}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{if(sender.id!==chrome.runtime.id)return;if(message.kind==='pair'){
 api('pair',{code:String(message.code||'').trim()}).then(async v=>{await chrome.storage.local.set({token:v.token,error:'',lastContact:Date.now()});await chrome.storage.local.remove('outbox');sendResponse({ok:true});tick();}).catch(e=>sendResponse({error:e.message}));return true;
 }if(message.kind==='disconnect'){chrome.storage.local.get('token').then(async({token})=>{if(token)await api('disconnect',{},token).catch(()=>{});await chrome.storage.local.remove(['token','outbox','lastContact']);sendResponse({ok:true});});return true;}if(message.kind==='wake'){tick();sendResponse({ok:true});}});
chrome.alarms.onAlarm.addListener(()=>tick());chrome.runtime.onStartup.addListener(()=>tick());chrome.runtime.onInstalled.addListener(()=>{chrome.alarms.create('geo-bridge',{periodInMinutes:0.5});tick();});chrome.alarms.create('geo-bridge',{periodInMinutes:0.5});setInterval(tick,2000);tick();
