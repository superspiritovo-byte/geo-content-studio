import {isImagePlatform} from './image-post';
import {readImageIdentity} from './image-adapters';
import type { Page, Locator } from 'playwright';
import type { Platform } from './types';
import { platforms } from './types';
import { normalizeIdentity, markdownHTML, editorMatches } from './publishing';
import {parseBaijiaAccount,sohuCreatorRequired,parseSohuAccounts} from './creator-identity';
export type Identity={name:string;identity:string;publishable?:boolean};
const identityPattern:Record<Exclude<Platform,'xiaohongshu'|'douyin'|'bilibili'>,RegExp>={zhihu:/^https:\/\/www\.zhihu\.com\/people\/[^/?]+/,baijiahao:/^https:\/\/author\.baidu\.com\/home(?:\/[^?]+|\?.*(?:app_id|uk)=)/,sohu:/^https:\/\/mp\.sohu\.com\/profile\?.*xpt=/};
const selectors:Record<Exclude<Platform,'xiaohongshu'|'douyin'|'bilibili'>,{title:string[];body:string[];publish:RegExp}>={
  zhihu:{title:['textarea[placeholder*="标题"]','textarea.Input','input[placeholder*="标题"]'],body:['.DraftEditor-root [contenteditable="true"]','.public-DraftEditor-content','.ProseMirror','.tiptap','[contenteditable="true"][role="textbox"]','[contenteditable="true"]'],publish:/^发布$/},
  baijiahao:{title:['input[placeholder*="标题"]','textarea[placeholder*="标题"]','[contenteditable="true"][data-placeholder*="标题"]'],body:['.ProseMirror','[contenteditable="true"][role="textbox"]','body.view'],publish:/^发布$/},
  sohu:{title:['input[placeholder*="标题"]','textarea[placeholder*="标题"]'],body:['.ql-editor','.ProseMirror','[contenteditable="true"]'],publish:/^发布$/},
};
const accountHosts:Record<Platform,string[]>={zhihu:['www.zhihu.com','zhuanlan.zhihu.com'],baijiahao:['baijiahao.baidu.com'],sohu:['mp.sohu.com','www.sohu.com'],xiaohongshu:['creator.xiaohongshu.com','www.xiaohongshu.com'],douyin:['creator.douyin.com','www.douyin.com'],bilibili:['t.bilibili.com','space.bilibili.com','www.bilibili.com']};
export function selectAccountPage<T extends {url():string;isClosed():boolean}>(pages:T[],platform:Platform):T|undefined{
  return [...pages].reverse().find(page=>{if(page.isClosed())return false;try{const u=new URL(page.url());return u.protocol==='https:'&&accountHosts[platform].includes(u.hostname);}catch{return false;}});
}
async function readZhihuIdentity(page:Page):Promise<Identity|undefined>{
  // This authenticated endpoint identifies the session owner, rather than any author in a feed.
  let response:Awaited<ReturnType<Page['request']['get']>>|undefined;
  try{
    response=await page.context().request.get('https://www.zhihu.com/api/v4/me',{timeout:8000,maxRetries:0});
    if(response.ok()){
      const raw:unknown=await response.json();
      const me=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
      if(typeof me.name==='string'&&me.name.trim()&&me.name.trim().length<=100&&typeof me.url_token==='string'&&/^[a-zA-Z0-9_-]+$/.test(me.url_token)){
        return {name:me.name.trim(),identity:`https://www.zhihu.com/people/${me.url_token}`};
      }
    }
  }catch{/* API restrictions do not mean the user is logged out. Try verified own-profile UI. */}
  finally{await response?.dispose().catch(()=>{});}
  const u=new URL(page.url());
  const profile=/^\/people\/([a-zA-Z0-9_-]+)(?:\/.*)?$/.exec(u.pathname);
  if(u.hostname==='www.zhihu.com'&&profile){
    const name=page.locator('.ProfileHeader-name');
    const own=await page.getByText('编辑个人资料',{exact:true}).isVisible().catch(()=>false);
    if(own&&await name.count()===1&&await name.isVisible()){
      const value=(await name.innerText()).trim();
      if(value&&value.length<=100)return {name:value,identity:`https://www.zhihu.com/people/${profile[1]}`};
    }
  }
}
export async function readIdentity(page:Page,platform:Platform):Promise<Identity>{
  let host:string;try{const u=new URL(page.url());host=u.protocol==='https:'?u.hostname:'';}catch{host='';}
  if(!accountHosts[platform].includes(host))throw Error('请先打开对应平台窗口完成登录，再读取账号身份');
  if(isImagePlatform(platform))return readImageIdentity(page,platform);
  if(platform==='zhihu'){const identity=await readZhihuIdentity(page);if(identity)return identity;}
  if(platform==='sohu'){
    // Endpoint and grouping schema are used by the official current creator frontend.
    if(sohuCreatorRequired(page.url()))await page.goto(platforms.sohu.home,{waitUntil:'domcontentloaded',timeout:45000});
    if(new URL(page.url()).hostname!=='mp.sohu.com')throw Error('搜狐号尚未完成登录，请在已打开的创作者后台登录后读取身份。');
    // Match the official client's auth headers inside the browser. Credentials never leave the page.
    const raw=await page.evaluate(async()=>{
      const headers:Record<string,string>={};
      const ticket=localStorage.getItem('ticket');if(ticket)headers.ticket=ticket;
      for(const name of ['mpToken','mp-cv']){
        const item=document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
        if(item)headers[name]=decodeURIComponent(item.slice(name.length+1));
      }
      const response=await fetch('/mpbp/bp/account/listV2',{headers,credentials:'same-origin',signal:AbortSignal.timeout(15000)});
      const value=await response.json();
      return {code:value.code,data:{total:value.data?.total,data:Array.isArray(value.data?.data)?value.data.data.map((e:any)=>Array.isArray(e?.accountInfos)?{accountInfos:e.accountInfos.map((a:any)=>({id:a?.id,nickName:a?.nickName,status:a?.status}))}:{id:e?.id,nickName:e?.nickName,status:e?.status}):[]}};
    });
        const identities=parseSohuAccounts(raw);
        if(identities.length===1)return identities[0];
        if(identities.length>1)throw Error('此搜狐登录拥有多个可用搜狐号，请先在搜狐号后台选择目标账号；系统不会猜测发布身份。');
        if(raw.code===1211)throw Error('搜狐号登录凭证已失效或尚未完成创作者登录。已打开搜狐号后台，请完成登录后重新读取，无需修改普通搜狐昵称。');
        throw Error(`搜狐号接口尚未返回审核通过的创作者账号（响应代码 ${String(raw.code??'未知')}，账号总数 ${String(raw.data?.total??'未知')}）。请在搜狐号后台检查登录、账号选择及审核状态；普通搜狐昵称不能代替发布身份。`);
  }
  if(platform==='baijiahao'){
    const settings='https://baijiahao.baidu.com/builder/rc/settings/accountSet';
    if(!page.url().startsWith(settings))await page.goto(settings,{waitUntil:'domcontentloaded',timeout:45000});
    try{await page.getByText('账号信息',{exact:true}).first().waitFor({state:'visible',timeout:15000});}catch{throw Error('百家号账号设置尚未加载，请在助手窗口完成百家号登录后再读取；无需寻找公开主页链接。');}
    const identity=parseBaijiaAccount(await page.locator('body').innerText());
    if(identity)return identity;
    throw Error('已进入百家号设置，但未能唯一核对账号名称和百家号ID；请关闭遮挡账号信息的弹窗后重试。');
  }
  // Only inspect the creator account controls. Never select an arbitrary article author from a feed.
  const roots=['header','nav','[class*="account"]','[class*="user-info"]','[class*="userInfo"]','[class*="UserInfo"]','[class*="Avatar"]'];
  const found=new Map<string,string>();
  for(const root of roots){
    const links=page.locator(`${root} a[href]`);for(let i=0;i<Math.min(await links.count(),25);i++){
      const a=links.nth(i);if(!await a.isVisible())continue;const href=await a.getAttribute('href');if(!href)continue;
      const url=new URL(href,page.url()).toString();if(!identityPattern[platform].test(url))continue;
      const images=a.locator('img');
      const alt=await images.count()>0?await images.first().getAttribute('alt',{timeout:1500}).catch(()=>''):'';
      const name=((await a.innerText()).trim()||(await a.getAttribute('aria-label'))||alt||'').trim();
      if(name&&name.length<100&&!['首页','个人主页','创作中心','头像'].includes(name))found.set(normalizeIdentity(url),name);
    }
  }
  if(found.size!==1)throw Error('账号身份尚未识别，这不代表没有登录。请在助手打开的平台窗口进入自己的个人主页，再点击读取身份；系统不会把他人主页当作登录账号。');
  const [identity,name]=[...found.entries()][0];return {identity,name};
}
async function uniqueVisible(page:Page,candidates:string[]):Promise<Locator>{
  for(const selector of candidates){const list=page.locator(selector);const visible:Locator[]=[];for(let i=0;i<await list.count();i++)if(await list.nth(i).isVisible())visible.push(list.nth(i));if(visible.length===1)return visible[0];}
  throw Error('平台编辑器结构无法确认，请在已打开的窗口人工检查；系统没有点击发布');
}
async function articleFields(page:Page,platform:Platform){
  if(isImagePlatform(platform))throw Error("图文请使用图文准备流程");
  const titleField=await uniqueVisible(page,selectors[platform].title);
  let editor:Locator|undefined;
  try{editor=await uniqueVisible(page,selectors[platform].body);}catch{
    for(const frame of page.frames().slice(1)){const candidate=frame.locator('body[contenteditable="true"]');if(await candidate.count()===1&&await candidate.isVisible()){if(editor)throw Error('检测到多个正文编辑器，需要人工处理');editor=candidate;}}
  }
  if(!editor)throw Error('未找到可确认的正文编辑器，请人工处理');
  return {titleField,editor};
}
async function assertReadback(page:Page,platform:Platform,title:string,body:string){
  const {titleField,editor}=await articleFields(page,platform);
  const observedTitle=await titleField.evaluate(el=>el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement?el.value:(el as HTMLElement).innerText);
  const observedBody=await editor.innerText();
  if(!editorMatches(title,body,observedTitle,observedBody))throw Error('完整标题或正文回读不一致，未点击发布；请检查平台编辑器');
}
export async function fillArticle(page:Page,platform:Platform,title:string,body:string,coverPath?:string){
  await page.goto(platforms[platform].editor,{waitUntil:'domcontentloaded',timeout:45000});
  const {titleField,editor}=await articleFields(page,platform);await titleField.fill(title);
  const html=markdownHTML(body);await editor.focus();
  await editor.evaluate((el,markup)=>{const doc=el.ownerDocument;doc.execCommand('selectAll',false);doc.execCommand('insertHTML',false,markup);el.dispatchEvent(new Event('input',{bubbles:true}));},html);
  await assertReadback(page,platform,title,body);
  if(coverPath){const inputs=page.locator('input[type="file"][accept*="image"]');if(await inputs.count()!==1)throw Error('封面上传位置不唯一，请在平台窗口选择封面后人工提交；系统未点击发布');await inputs.setInputFiles(coverPath);}
  const challenge=page.getByText(/请完成验证|安全验证|拖动滑块|扫码登录|请先登录/);if(await challenge.first().isVisible().catch(()=>false))throw Error('平台需要登录或人工验证，请在平台窗口完成处理');
}
export async function submitArticle(page:Page,platform:Platform,title:string,body:string){
  if(isImagePlatform(platform))throw Error("图文需在平台窗口确认发布");
  await assertReadback(page,platform,title,body);
  const button=page.getByRole('button',{name:selectors[platform].publish,exact:true});if(await button.count()!==1||!await button.isVisible()||!await button.isEnabled())throw Error('未找到唯一且可用的发布按钮，请在平台窗口人工确认');
  await button.click({timeout:15000});
  // A click is only a submission attempt, never evidence of publication.
}
export const publicSelectors:Record<Exclude<Platform,'xiaohongshu'|'douyin'|'bilibili'>,{byline:string;body:string;identity:RegExp}>={
  zhihu:{byline:'.Post-Header .AuthorInfo a[href], .Post-Author .AuthorInfo a[href], .Post-Author .UserLink a[href]',body:'article .Post-RichTextContainer, article .RichText',identity:identityPattern.zhihu},
  baijiahao:{byline:'.author-info a[href], [class*="authorInfo"] a[href], [class*="author-info"] a[href]',body:'#article-content, .article-content, [class*="article-content"]',identity:identityPattern.baijiahao},
  sohu:{byline:'#user-info a[href], .user-info h4 a[href], .author-info a[href]',body:'#mp-editor, article.article',identity:identityPattern.sohu},
};
