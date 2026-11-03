import type {Page,Locator} from 'playwright';
import {platforms,type Platform} from './types';
import type {ImagePlatform} from './image-post';
import {parseCreatorIdentity} from './image-identity';
const profilePatterns:Record<ImagePlatform,RegExp>={xiaohongshu:/^https:\/\/www\.xiaohongshu\.com\/user\/profile\/[a-f\d]{24}/i,douyin:/^https:\/\/www\.douyin\.com\/user\/[\w-]+/,bilibili:/^https:\/\/space\.bilibili\.com\/\d+/};
export async function readImageIdentity(page:Page,platform:ImagePlatform){
 if(platform==='xiaohongshu'||platform==='douyin'){
  const endpoint=platform==='xiaohongshu'?'/api/galaxy/user/info':'/aweme/v1/creator/pc/user/info/';
  const expectedHost=platform==='xiaohongshu'?'creator.xiaohongshu.com':'creator.douyin.com';
  if(new URL(page.url()).hostname!==expectedHost)await page.goto(platforms[platform].home,{waitUntil:'domcontentloaded',timeout:45000});
  if(new URL(page.url()).hostname!==expectedHost)throw Error('请先完成创作者中心登录，再读取身份');
  const result=await page.evaluate(async path=>{
   const response=await fetch(path,{credentials:'same-origin',signal:AbortSignal.timeout(15000)});
   if(!response.ok)return{httpStatus:response.status};
   const value=await response.json();
   if(path==='/aweme/v1/creator/pc/user/info/'&&value.status_code===0&&value.uid&&!value.nickname){
    const detailResponse=await fetch('/aweme/v1/creator/user/info/',{credentials:'same-origin',signal:AbortSignal.timeout(15000)});
    if(detailResponse.ok){const detail=await detailResponse.json();
     const me=detail.user_profile||detail.user||detail.user_info||detail.data;
     value.detailKeys=Object.keys(detail);value.detailUserKeys=Object.keys(me||{});
     let sameAccount=me?.uid&&String(me.uid)===String(value.uid);
     if(detail.status_code===0&&me&&!me.uid){const again=await fetch(path,{credentials:'same-origin',signal:AbortSignal.timeout(15000)});if(again.ok){const current=await again.json();sameAccount=current.status_code===0&&String(current.uid)===String(value.uid);}}
     if(detail.status_code===0&&me&&sameAccount){value.nickname=me.nick_name||me.nickname;value.sec_uid=me.sec_uid;}
    }
   }
   // Only return public identity fields; never export cookies, tokens, phones or full account data.
   return {diagnostics:{keys:Object.keys(value),userKeys:Object.keys(value.user||{}),dataKeys:Object.keys(value.data||{}),detailKeys:value.detailKeys,detailUserKeys:value.detailUserKeys},code:value.code,success:value.success,status_code:value.status_code,statusCode:value.statusCode,nickname:value.nickname,uid:value.uid,sec_uid:value.sec_uid,
    user:{nickname:value.user?.nickname,uid:value.user?.uid,sec_uid:value.user?.sec_uid},
    data:{userName:value.data?.userName,userId:value.data?.userId,nickname:value.data?.nickname,uid:value.data?.uid,sec_uid:value.data?.sec_uid,
      user:{nickname:value.data?.user?.nickname,uid:value.data?.user?.uid,sec_uid:value.data?.user?.sec_uid}}};
  },endpoint);
  const identity=parseCreatorIdentity(platform,result);if(identity)return identity;
  console.info('图文身份字段诊断',JSON.stringify({platform,code:result.code,status_code:result.status_code,diagnostics:result.diagnostics,hasName:!!result.nickname,uidType:typeof result.uid}));
  // Preserve a precise, non-sensitive error rather than treating all access issues as logged out.
  if('httpStatus' in result)throw Error(`${platforms[platform].name}当前账号接口访问失败（HTTP ${result.httpStatus}），请在创作者中心检查登录或验证提示`);
 }
 if(platform==='bilibili'){
  const response=await page.context().request.get('https://api.bilibili.com/x/web-interface/nav',{timeout:15000});
  try{const value=await response.json() as any;const me=value?.data;if(value.code===0&&me?.isLogin===true&&typeof me.uname==='string'&&me.uname.trim()&&Number.isSafeInteger(me.mid)&&me.mid>0)return{name:me.uname.trim(),identity:`https://space.bilibili.com/${me.mid}`};}finally{await response.dispose();}
 }
 // Only account controls in the creator header qualify. Feed authors are never login evidence.
 const links=page.locator('header a[href], [class*="user-info"] a[href], [class*="account-info"] a[href], [class*="userInfo"] a[href]');
 const found=new Map<string,string>();
 for(let i=0;i<await links.count();i++){
  const link=links.nth(i);if(!await link.isVisible())continue;
  const href=await link.getAttribute('href');if(!href)continue;const url=new URL(href,page.url());const match=url.toString().match(profilePatterns[platform]);if(!match)continue;
  const name=(await link.innerText()).trim();if(name&&name.length<=100&&!['个人主页','我的主页','首页'].includes(name))found.set(match[0],name);
 }
 if(found.size!==1)throw Error(`${platforms[platform].name}登录身份尚不能唯一核对。请先在助手 Chrome 中登录并打开创作者账号菜单；该适配尚待真实账号验证，不会猜测账号身份。`);
 const [identity,name]=[...found][0];return{name,identity};
}
async function field(page:Page,selectors:string[]):Promise<Locator>{
 for(const selector of selectors){const candidates=page.locator(selector);const visible:Locator[]=[];for(let i=0;i<await candidates.count();i++)if(await candidates.nth(i).isVisible())visible.push(candidates.nth(i));if(visible.length===1)return visible[0];}
 throw Error('无法唯一识别图文编辑控件，已暂停；请在平台窗口检查，不会自动点击发布');
}
export async function prepareImagePost(page:Page,platform:ImagePlatform,title:string,body:string,paths:string[]){
 await page.goto(platforms[platform].editor,{waitUntil:'domcontentloaded',timeout:45000});
 if(platform!=='bilibili'){
  const tab=page.getByText(/^(上传图文|发布图文|图文)$/);const visible=tab.filter({visible:true});if(await visible.count()===1)await visible.click();
 }
 const inputs=page.locator('input[type="file"][accept*="image"]');
 if(await inputs.count()!==1)throw Error('请在平台窗口切换到图文发布；图片上传控件尚不能唯一识别，未提交');
 const input=inputs.first();if(paths.length>1&&await input.getAttribute('multiple')===null)throw Error('当前控件不支持一次上传多图，请在平台窗口确认图文模式；未提交');
 await input.setInputFiles(paths);
 if(platform!=='bilibili')await (await field(page,['input[placeholder*="标题"]','textarea[placeholder*="标题"]'])).fill(title);
 const content=await field(page,['[contenteditable="true"][data-placeholder*="正文"]','[contenteditable="true"][data-placeholder*="说"]','.tiptap','.ProseMirror','.ql-editor','textarea[placeholder*="说"]','textarea[placeholder*="正文"]','[contenteditable="true"]']);
 const text=platform==='bilibili'?`${title}\n\n${body}`:body;await content.fill(text);
 const observed=await content.evaluate(el=>el instanceof HTMLTextAreaElement?el.value:(el as HTMLElement).innerText);
 if(observed.replace(/\s/g,'')!==text.replace(/\s/g,''))throw Error('图文文案回读不一致，已暂停；请人工检查');
 await page.bringToFront();
 // Real image order, platform declarations and final submission require visual confirmation in v1.
}
