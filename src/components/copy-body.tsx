'use client';
import {Copy} from 'lucide-react';
import {markdownHTML} from '@/lib/publishing';

export default function CopyBody({body,notify}:{body:string;notify:(message:string)=>void}){
 async function copy(){
  const doc=new DOMParser().parseFromString(markdownHTML(body),'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,img').forEach(el=>el.remove());
  doc.body.querySelectorAll('*').forEach(el=>{for(const attr of Array.from(el.attributes)){
   if(attr.name.startsWith('on')||!['href','colspan','rowspan'].includes(attr.name))el.removeAttribute(attr.name);
   else if(attr.name==='href'&&!/^https?:\/\//i.test(attr.value))el.removeAttribute(attr.name);
  }});
  const html=doc.body.innerHTML;
  const block=document.createElement('div');block.innerHTML=html;block.style.cssText='position:fixed;left:-10000px;top:0;white-space:normal';
  document.body.appendChild(block);const plain=block.innerText;
  const selection=window.getSelection();const previous=selection&&selection.rangeCount?selection.getRangeAt(0).cloneRange():null;
  const focused=document.activeElement as HTMLElement|null;
  try{
   if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
    try{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);notify('已复制带格式的正文，粘贴到平台正文区即可；标题单独填写。');return;}catch{/* Try the browser selection-based rich text copy. */}
   }
   const range=document.createRange();range.selectNodeContents(block);selection?.removeAllRanges();selection?.addRange(range);
   if(!document.execCommand('copy'))throw Error('copy failed');
   notify('已复制带格式的正文，粘贴到平台正文区即可；标题单独填写。');
  }catch{notify('浏览器未允许带格式复制，请允许剪贴板权限后重试。');}
  finally{block.remove();selection?.removeAllRanges();if(previous)selection?.addRange(previous);focused?.focus();}
 }
 return <button className="text-button" onClick={copy}><Copy size={16}/>复制带格式正文</button>;
}
