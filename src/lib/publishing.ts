import { marked } from 'marked';
import type { Platform } from './types';
export function publicAccessFailure(status?:number){return `公开页面自动核验失败${status?`（HTTP ${status}）`:''}，无法判断平台审核状态。请以平台内容管理页为准；不要重复发布。`;}
export function normalizeIdentity(value:string){
  const u=new URL(value);u.hash='';
  const keep=['app_id','xpt','id','uk'];const params=new URLSearchParams();for(const key of keep){const v=u.searchParams.get(key);if(v)params.set(key,v);}u.search=params.toString();u.pathname=u.pathname.replace(/\/+$/,'');return u.toString().replace(/\/$/,'');
}
export function validatePublicUrl(platform:Platform,value:string){
  const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('只允许该平台的 HTTPS 公开文章链接');
  if(['xiaohongshu','douyin','bilibili'].includes(platform)){
    const valid=platform==='xiaohongshu'?u.hostname==='www.xiaohongshu.com'&&/^\/(?:explore|discovery\/item)\/[a-f\d]{24}\/?$/i.test(u.pathname):platform==='douyin'?u.hostname==='www.douyin.com'&&/^\/note\/\d+\/?$/.test(u.pathname):u.hostname==='www.bilibili.com'&&/^\/opus\/\d+\/?$/.test(u.pathname);
    if(!valid)throw Error('请使用该平台的完整公开图文链接，不支持短链接或后台链接');return u.toString();
  }
  const valid=platform==='zhihu'?u.hostname==='zhuanlan.zhihu.com'&&/^\/p\/\d+\/?$/.test(u.pathname):platform==='sohu'?u.hostname==='www.sohu.com'&&/^\/a\/\d+_\d+\/?$/.test(u.pathname):['baijiahao.baidu.com','www.baijiahao.baidu.com'].includes(u.hostname)&&u.pathname==='/s'&&/^\d+$/.test(u.searchParams.get('id')||'');
  if(!valid)throw Error('请输入该平台的公开文章链接，不支持登录页或后台地址');return u.toString();
}
export function markdownHTML(body:string){const renderer=new marked.Renderer();renderer.html=({text})=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');renderer.image=()=>'';return marked.parse(body,{async:false,renderer}) as string;}
const plain=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/[\s\u200b-\u200d\ufeff]/g,'');
export function contentMatches(title:string,body:string,observedTitle:string,observedBody:string){const expected=plain(markdownHTML(body));return plain(title)===plain(observedTitle)&&expected.length>0&&plain(observedBody).includes(expected);}
export function editorMatches(title:string,body:string,observedTitle:string,observedBody:string){return plain(title)===plain(observedTitle)&&plain(markdownHTML(body))===plain(observedBody);}
export function bylineMatches(target:string,bylineLinks:string[]){const unique=new Set(bylineLinks.map(h=>{try{return normalizeIdentity(h);}catch{return '';}}).filter(Boolean));return unique.size===1&&unique.has(normalizeIdentity(target));}
