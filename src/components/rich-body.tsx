'use client';
import {useEffect,useRef} from 'react';
import {bodyToHTML,bodyToMarkdown} from '@/lib/rich-body';
function safeHTML(html:string){
 const doc=new DOMParser().parseFromString(html,'text/html');
 doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,img,svg,math').forEach(el=>el.remove());
 doc.body.querySelectorAll('*').forEach(el=>Array.from(el.attributes).forEach(a=>{if(!['href','colspan','rowspan'].includes(a.name)||(a.name==='href'&&!/^https?:\/\//i.test(a.value)))el.removeAttribute(a.name);}));
 return doc.body.innerHTML;
}
export default function RichBody({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const editor=useRef<HTMLDivElement>(null);const last=useRef<string|undefined>(undefined);
 useEffect(()=>{if(editor.current&&value!==last.current){editor.current.innerHTML=safeHTML(bodyToHTML(value));last.current=value;}},[value]);
 function changed(){if(!editor.current)return;const markdown=bodyToMarkdown(safeHTML(editor.current.innerHTML));last.current=markdown;onChange(markdown);}
 function format(command:string,arg?:string){editor.current?.focus();document.execCommand(command,false,arg);changed();}
 return <div className="rich-body-wrap"><div className="rich-body-tools" role="toolbar" aria-label="正文格式"><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('formatBlock','p')}>正文</button><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('formatBlock','h2')}>小标题</button><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('bold')}><strong>加粗</strong></button><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('insertUnorderedList')}>项目列表</button><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('insertOrderedList')}>编号列表</button></div><div ref={editor} className="markdown rich-body" contentEditable suppressContentEditableWarning role="textbox" aria-label="文章正文" aria-multiline="true" onInput={changed} onPaste={e=>{e.preventDefault();const html=e.clipboardData.getData('text/html');if(html)document.execCommand('insertHTML',false,safeHTML(html));else document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));changed();}}/><small className="rich-body-hint">直接修改文字和排版，支持 Ctrl+B 加粗；保存与发布会保留内容结构。</small></div>;
}
