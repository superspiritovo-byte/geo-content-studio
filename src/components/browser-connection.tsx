'use client';
import {useState} from 'react';
import type {AppState} from '@/lib/types';
export function BrowserConnection({state,run,busy}:{state:AppState;run:(action:string,data?:unknown)=>Promise<any>;busy:boolean}){
 const [code,setCode]=useState('');const [copied,setCopied]=useState(false);const browser=state.browser||{mode:'extension',online:false,paired:false};
 return <section className="panel" style={{marginBottom:24}}><div className="panel-title"><h2>Chrome 连接</h2><span className={`badge ${browser.online?'green':'amber'}`}>{browser.mode==='isolated'?'独立浏览器模式':browser.online?'已连接你的 Chrome':'等待 Chrome 扩展连接'}</span></div>
 <p className="description">使用你平时的 Chrome，在同一浏览器的标签页登录和准备文章；账号必须与工作台记录一致，最后一步在平台确认发布。</p>
 <label className="field"><span>浏览器方式</span><select aria-label="浏览器方式" value={browser.mode} disabled={busy} onChange={e=>run('browser/mode',{mode:e.target.value})}><option value="extension">使用现有 Chrome（扩展连接）</option><option value="isolated">独立浏览器（旧方式，会另外打开窗口）</option></select></label>
 {browser.mode==='extension'&&<><ol style={{lineHeight:1.9,paddingLeft:24}}><li>在平时使用的 Chrome 地址栏输入 <strong>chrome://extensions</strong>，打开右上角「开发者模式」。</li><li>点击「加载已解压的扩展程序」，选择下面按钮打开的 <strong>chrome-extension</strong> 文件夹。</li><li>生成配对码，点击 Chrome 工具栏中的「GEO 工作台 · Chrome 连接助手」，粘贴并连接。</li></ol>
 <div className="inline-actions" style={{flexWrap:'wrap',gap:12}}><button className="button secondary" disabled={busy} onClick={()=>run('browser/open-folder')}>打开扩展文件夹</button><button className="button" disabled={busy} onClick={async()=>{const v=await run('browser/pair-code');if(v){setCode(v.code);setCopied(false);}}}>{browser.paired?'重新生成配对码':'生成配对码'}</button>{browser.paired&&<button className="button secondary" disabled={busy} onClick={async()=>{await run('browser/disconnect');setCode('');}}>断开连接</button>}</div>
 {code&&<div className="field" style={{marginTop:16}}><span>一次性配对码 · 10 分钟有效</span><input aria-label="一次性配对码" readOnly value={code}/><button className="button secondary" onClick={async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);}catch{setCopied(false);}}}>{copied?'已复制':'复制配对码'}</button></div>}
 <p className="footnote">扩展只连接本机 127.0.0.1:18080。未连接时会暂停，不会自动另开 Chrome；原来的账号、文章和独立登录目录都保留。你平时 Chrome 中的平台若未登录，需要登录一次。</p></>}
 </section>;
}
