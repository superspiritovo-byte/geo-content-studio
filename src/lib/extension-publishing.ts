import {z} from 'zod';
import type {Store} from './store';
import type {Task,Platform} from './types';
import {requestBrowser} from './browser-bridge';
import {normalizeIdentity,markdownHTML} from './publishing';
import {isImagePlatform} from './image-post';
export function validateBrowserIdentity(platform:Platform,value:unknown){const v=z.object({name:z.string().trim().min(1).max(100),identity:z.url().max(1000),publishable:z.boolean().optional()}).parse(value);const u=new URL(v.identity);const valid=u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(platform==='zhihu'?u.hostname==='www.zhihu.com'&&/^\/people\/[\w-]+\/?$/.test(u.pathname):platform==='baijiahao'?u.hostname==='baijiahao.baidu.com'&&u.pathname==='/builder/rc/settings/accountSet'&&/^\d+$/.test(u.searchParams.get('id')||''):platform==='sohu'?u.hostname==='mp.sohu.com'&&u.pathname==='/mpfe/v4/personalCenter/account'&&/^\d+$/.test(u.searchParams.get('id')||''):platform==='xiaohongshu'?u.hostname==='www.xiaohongshu.com'&&/^\/user\/profile\/[a-f\d]{24}$/i.test(u.pathname)||u.hostname==='creator.xiaohongshu.com'&&u.pathname==='/account'&&/^[\w-]+$/.test(u.searchParams.get('id')||''):platform==='douyin'?u.hostname==='www.douyin.com'&&/^\/user\/[\w.-]+$/.test(u.pathname)||u.hostname==='creator.douyin.com'&&u.pathname==='/account'&&/^\d+$/.test(u.searchParams.get('id')||''):u.hostname==='space.bilibili.com'&&/^\/\d+\/?$/.test(u.pathname));if(!valid)throw Error('扩展返回的账号标识不能唯一核对，请在平台重新读取');return {...v,identity:normalizeIdentity(v.identity)};}
export async function prepareInChrome(db:Store,task:Task,request:typeof requestBrowser=requestBrowser){
 const identity=validateBrowserIdentity(task.platform,await request(db,'identity',task.platform,{accountId:task.accountId}));
 if(identity.identity!==normalizeIdentity(task.identity)||identity.publishable===false)throw Error('当前 Chrome 登录账号与目标账号不符或发布资格未确认；未准备文章');
 // Before opening an editor, prevent retry after a crash or partial upload, and keep this account reserved.
 db.setTask(task.id,'publishing','正在当前 Chrome 的标签页准备内容；最终发布由你确认',{stage:'awaiting_platform_confirmation',manualPublicationClaim:true});
 const image=isImagePlatform(task.platform);
 const result=await request(db,'prepare',task.platform,{taskId:task.id,accountId:task.accountId,identity:task.identity,title:image?task.postTitle:task.snapshot.title,body:image?task.postBody:task.snapshot.body,html:image?undefined:markdownHTML(task.snapshot.body),images:image?task.images:task.cover?[task.cover]:[]});
 if(!result||typeof result!=='object'||!(result as {prepared?:boolean}).prepared)throw Error('Chrome 未确认内容准备完成，请检查平台标签页；没有自动发布');
 db.setTask(task.id,'needs_action','内容已在你的 Chrome 标签页准备好。请核对正文、图片及声明后在平台点击发布；发布后可在这里填写链接并人工确认。',{stage:'awaiting_platform_confirmation',manualPublicationClaim:true});
}
