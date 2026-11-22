'use client';
import {useState} from 'react';
import type {AppState} from '@/lib/types';
import type {Source} from '@/lib/rag';
const defaults={enabled:false,baseUrl:'http://127.0.0.1:11434',embeddingModel:'embeddinggemma',chatModel:'qwen3:1.7b'};
export default function RagPanel({state,run,busy}:{state:AppState;run:(action:string,data?:unknown)=>Promise<any>;busy:boolean}){
 const [form,setForm]=useState(state.rag?.settings||defaults),[id,setId]=useState(''),[question,setQuestion]=useState(''),[result,setResult]=useState<{answer?:string;sources:Source[];citationIds?:string[]}>(),[notice,setNotice]=useState('');
 const saved=state.rag?.settings||defaults,dirty=JSON.stringify(form)!==JSON.stringify(saved),status=state.rag?.indexes.find(x=>x.id===id);
 const change=(name:string,value:unknown)=>setForm(f=>({...f,[name]:value}));
 return <section className="panel" style={{marginTop:24,padding:28}}><h2>本机资料问答 · RAG</h2><p className="description">向量索引和问答均在本机运行。开启后，选题与文章也使用本机模型；不会使用在线 AI 接口。</p>
 <label className="field"><span><input type="checkbox" checked={form.enabled} onChange={e=>change('enabled',e.target.checked)}/> 选题与写作使用本机 RAG</span></label>
 <div className="two-column"><label className="field"><span>本机 Ollama 地址</span><input value={form.baseUrl} onChange={e=>change('baseUrl',e.target.value)}/></label><label className="field"><span>向量模型</span><input value={form.embeddingModel} onChange={e=>change('embeddingModel',e.target.value)}/></label><label className="field"><span>本机问答／写作模型</span><input value={form.chatModel} onChange={e=>change('chatModel',e.target.value)}/></label></div>
 <p><button className="button" disabled={busy} onClick={async()=>{if(await run('rag/settings',form))setNotice('本机设置已保存');}}>保存本机设置</button> <button className="button secondary" disabled={busy||dirty} onClick={async()=>{const r=await run('rag/test');if(r)setNotice(`${r.message}；已安装：${r.models.join('、')||'暂无模型'}`);}}>检查本机模型</button></p>
 <details><summary>首次安装与隐私说明</summary><p>安装 Ollama 后，在终端执行以下命令下载模型。下载只获取模型文件；资料不用于下载请求。</p><pre>ollama pull embeddinggemma{'\n'}ollama pull qwen3:1.7b</pre><p>先启动 Ollama。启用本机模式后，上传和保存资料会自动建立索引；失败时资料仍会保存，可在此手动重试。问答始终本机处理；只有勾选并保存“选题与写作使用本机 RAG”，原有写作才从在线切为本机。原在线密钥仍保留。向量相似度不代表答案正确率。</p></details>
 <hr/><label className="field"><span>选择企业资料（每家独立检索）</span><select value={id} onChange={e=>{setId(e.target.value);setResult(undefined);}}><option value="">请选择企业资料</option>{state.knowledge.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
 {!state.knowledge.length&&<p>请先在上方添加企业资料，可粘贴一段文字开始。</p>}
 {id&&<p>{status?.ready?'索引已建立（提问时会校验模型）':'尚未建立索引或资料已更新'} · {status?.count||0} 个片段 {status?.updatedAt&&`· ${new Date(status.updatedAt).toLocaleString()}`}</p>}
 <button className="button secondary" disabled={busy||dirty||!id} onClick={async()=>{const r=await run('rag/index',{knowledgeId:id});if(r){setNotice(`已建立索引：${r.count} 个片段`);setResult(undefined);}}}>{busy?'处理中…':'建立／重建本机索引'}</button>
 <label className="field" style={{marginTop:20}}><span>问资料一个问题</span><textarea rows={3} maxLength={2000} value={question} onChange={e=>{setQuestion(e.target.value);setResult(undefined);}} placeholder="例如：设备修好后，质保多久？"/></label>
 <p><button className="button" disabled={busy||dirty||!id||!question.trim()||!status?.ready} onClick={async()=>{setResult(undefined);const r=await run('rag/answer',{knowledgeId:id,question});if(r)setResult(r);}}>{busy?'正在处理…':'本机检索并回答'}</button> <button className="button secondary" disabled={busy||dirty||!id||!question.trim()||!status?.ready} onClick={async()=>{setResult(undefined);const r=await run('rag/search',{knowledgeId:id,question});if(r)setResult(r);}}>只看检索片段</button></p>
 {dirty&&<p className="warning-text">配置已修改，请先保存。</p>}{notice&&<p role="status">{notice}</p>}
 {result?.answer&&<div className="notice" style={{whiteSpace:'pre-wrap'}}>{result.answer}</div>}
 {result?.sources.map(s=><details key={s.id} open><summary>[{s.id}] {s.name} {result.citationIds?.includes(s.id)?'· 回答引用':''} · 相似度 {s.score?.toFixed(3)}</summary><p style={{whiteSpace:'pre-wrap'}}>{s.text}</p></details>)}
 </section>;
}
