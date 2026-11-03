import {markdownHTML} from './publishing';
import type {Platform} from './types';
export type ImagePlatform='xiaohongshu'|'douyin'|'bilibili';
export function isImagePlatform(p:Platform):p is ImagePlatform{return ['xiaohongshu','douyin','bilibili'].includes(p);}
export const imageLimits={xiaohongshu:{title:20,body:1000},douyin:{title:30,body:1000},bilibili:{title:100,body:2000}};
export function captionText(markdown:string){return markdownHTML(markdown).replace(/<li>/g,'• ').replace(/<\/(?:p|h[1-6]|li|ul|ol|blockquote)>/g,'\n').replace(/<br\s*\/?>/g,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\n{3,}/g,'\n\n').trim();}
export function validateImagePost(platform:ImagePlatform,title:string,body:string,images:string[]){
 if(!images.length)throw Error('图文作品至少需要 1 张图片');
 if(images.length>9)throw Error('首版图文最多支持 9 张图片');
 const limit=imageLimits[platform];
 if(!title.trim()||Array.from(title).length>limit.title)throw Error(`图文标题请控制在 ${limit.title} 字以内`);
 if(!body.trim()||Array.from(body).length>limit.body)throw Error(`图文正文请控制在 ${limit.body} 字以内，请编辑专用文案；系统不会截断文章`);
}
