import {marked} from 'marked';
const paragraphStyle='margin:0 0 16px;line-height:1.8;';
const escapeHTML=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Clipboard markup carries its own appearance; destination editors may unwrap headings and lists.
export function clipboardHTML(body:string){
 const renderer=new marked.Renderer();
 renderer.html=({text})=>escapeHTML(text);
 renderer.image=()=>'';
 renderer.link=function({href,tokens}){const label=this.parser.parseInline(tokens);return /^https?:\/\//i.test(href)?`<a href="${escapeHTML(href)}">${label}</a>`:label;};
 renderer.heading=function({depth,tokens}){const size=[30,26,23,21,19,18][depth-1];return `<h${depth} style="font-size:${size}px;font-weight:700;line-height:1.5;margin:24px 0 16px;"><strong style="font-weight:700;">${this.parser.parseInline(tokens)}</strong></h${depth}>\n`;};
 renderer.strong=function({tokens}){return `<strong style="font-weight:700;">${this.parser.parseInline(tokens)}</strong>`;};
 renderer.paragraph=function({tokens}){return `<p style="${paragraphStyle}">${this.parser.parseInline(tokens)}</p>\n`;};
 renderer.list=function({ordered,start,items}){
  const first=typeof start==='number'?start:1;
  return `<div style="margin:0 0 16px 20px;">${items.map((item,index)=>{
   const prefix=ordered?`${first+index}. `:'• ';
   const content=this.parser.parse(item.tokens);
   if(/^<p(?:\s|>)/.test(content))return content.replace(/^(<p[^>]*>)/,`$1${prefix}`);
   const block=content.search(/<(?:div|p|blockquote|pre|table|h[1-6])(?:\s|>)/);
   if(block<0)return `<p style="${paragraphStyle}">${prefix}${content}</p>`;
   return `<p style="${paragraphStyle}">${prefix}${content.slice(0,block)}</p>${content.slice(block)}`;
  }).join('\n')}</div>\n`;
 };
 return `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;font-size:16px;line-height:1.8;color:#222;">${marked.parse(body,{async:false,renderer})}</div>`;
}
