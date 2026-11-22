import {extensionFolder} from '@/lib/extension-files';
import {bridgeState,createPairCode,pairExtension,authenticateExtension,claimBrowserJob,finishBrowserJob,browserJob,setBrowserMode,disconnectExtension} from '@/lib/browser-bridge';
import {spawn} from 'node:child_process';
import {ragSettings,ragSettingsSchema,indexStatus,buildIndex,removeIndex,retrieve,answerQuestion,ollama} from '@/lib/rag';
import {writingContext,writingCompletion} from '@/lib/rag-writing';
import { formatInstruction, structuredResult } from '@/lib/content-format';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import mammoth from 'mammoth';
import { store, dataDir } from '@/lib/store';
import { encryptKey } from '@/lib/secrets';
import {validatePublicUrl} from '@/lib/publishing';
import { articleSchema, buildContext, completion, topicSchema, writingSystem } from '@/lib/ai';
import type { Account, Article, Knowledge, Platform, Topic, Task, Command } from '@/lib/types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const key=z.string().uuid();
const text=z.string().trim().min(1);
const db=()=>store();
type RouteContext={params:Promise<{path:string[]}>};
async function indexSavedKnowledge(id:string){if(!ragSettings(db()).enabled)return {};try{await buildIndex(db(),id);return {};}catch(e){return {indexError:e instanceof Error?e.message:'索引建立失败，请重试'};}}
function fail(message:string,status=400){return NextResponse.json({error:message},{status});}
function local(req:NextRequest){const host=req.headers.get('host')||'';return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);}
async function body(req:NextRequest,max=1024*1024){
  const reader=req.body?.getReader();if(!reader)throw Error('缺少请求内容');const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('请求内容超过大小限制');}chunks.push(value);}return Buffer.concat(chunks);
}
export async function GET(req:NextRequest,ctx:RouteContext){
  if(!local(req))return fail('仅允许本机访问',403);
  const p=(await ctx.params).path;
  if(p.join('/')==='state'){
    const {encryptedKey,...settings}=db().settings();
    return NextResponse.json({storage:{directory:dataDir,workspaceId:db().get<{value:string}>('config','workspace')?.value||null},browser:bridgeState(db()),rag:{settings:ragSettings(db()),indexes:db().knowledge().map(k=>({id:k.id,...indexStatus(db(),k.id)}))},knowledge:db().knowledge(),documents:db().documents().map(({path,...d})=>d),topics:db().topics(),articles:db().articles(),accounts:db().accounts(),tasks:db().tasks(),commands:db().all<Command>('commands').slice(0,30),settings:{...settings,hasKey:!!encryptedKey},worker:db().worker()},{headers:{'Cache-Control':'no-store'}});
  }
  if(p[0]==='covers'&&p[1]&&/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(p[1])){const path=join(dataDir,'covers',p[1]);if(!existsSync(path))return fail('封面不存在',404);return new NextResponse(readFileSync(path),{headers:{'Content-Type':p[1].endsWith('.png')?'image/png':p[1].endsWith('.webp')?'image/webp':'image/jpeg','X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=3600'}});}
  return fail('接口不存在',404);
}
const extensionOrigin=(req:NextRequest)=>/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.get('origin')||'');
const cors=(req:NextRequest)=>({'Access-Control-Allow-Origin':req.headers.get('origin')||'', 'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Vary':'Origin','Access-Control-Allow-Private-Network':'true'});
export async function OPTIONS(req:NextRequest){if(!local(req)||!extensionOrigin(req))return fail('扩展来源无效',403);return new NextResponse(null,{status:204,headers:cors(req)});}
export async function POST(req:NextRequest,ctx:RouteContext){
  const extensionAction=(await ctx.params).path.join('/');
  if(extensionAction.startsWith('browser/extension/')){
    if(!local(req)||!extensionOrigin(req))return fail('扩展来源无效',403);
    const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:cors(req)});
    try{
      const input=JSON.parse((await body(req)).toString('utf8'));const origin=req.headers.get('origin')!;
      if(extensionAction==='browser/extension/pair'){const v=z.object({code:z.string().regex(/^[a-f0-9]{32}$/)}).parse(input);return reply({token:pairExtension(db(),v.code,origin)});}
      authenticateExtension(db(),(req.headers.get('authorization')||'').replace(/^Bearer /,''),origin);
      if(extensionAction==='browser/extension/heartbeat')return reply({ok:true});
      if(extensionAction==='browser/extension/disconnect'){disconnectExtension(db());return reply({ok:true});}
      if(extensionAction==='browser/extension/active'){const v=z.object({id:key}).parse(input);const job=browserJob(db(),v.id);if(!job||job.status!=='running'||Date.now()>job.expiresAt)throw Error('Chrome 操作已结束或超时，请停止当前操作');return reply({ok:true});}
      if(extensionAction==='browser/extension/poll')return reply({job:claimBrowserJob(db())||null});
      if(extensionAction==='browser/extension/finish'){
        const v=z.object({id:key,ok:z.boolean(),error:z.string().max(500).optional(),result:z.object({opened:z.boolean().optional(),prepared:z.boolean().optional(),name:z.string().trim().min(1).max(100).optional(),identity:z.url().max(1000).optional(),publishable:z.boolean().optional()}).optional()}).parse(input);
        finishBrowserJob(db(),v.id,v);return reply({ok:true});
      }
      if(extensionAction==='browser/extension/asset'){
        const v=z.object({id:key,file:z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|webp)$/)}).parse(input);const job=browserJob(db(),v.id);
        const files=job?.payload.images as string[]|undefined;
        if(!job||job.status!=='running'||Date.now()>job.expiresAt||!files?.includes(v.file))throw Error('此任务无权读取该图片');
        return reply({base64:readFileSync(join(dataDir,'covers',v.file)).toString('base64'),name:v.file,type:v.file.endsWith('.png')?'image/png':v.file.endsWith('.webp')?'image/webp':'image/jpeg'});
      }
      return reply({error:'接口不存在'},404);
    }catch(e){return reply({error:e instanceof Error?e.message:'扩展操作失败'},400);}
  }

  if(!local(req)||req.headers.get('origin')!==`http://${req.headers.get('host')}`)return fail('请求来源无效，请从本机工作台操作',403);
  const action=(await ctx.params).path.join('/');
  try{
    if(action==='knowledge/upload'||action==='covers'){
      const buffer=await body(req,82*1024*1024);const form=await new Response(buffer,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();
      if(action==='covers'){
        const f=form.get('file');if(!(f instanceof File)||f.size>8*1024*1024)throw Error('请选择不超过 8MB 的封面');
        const bytes=Buffer.from(await f.arrayBuffer());
        const ext=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null;
        if(!ext)throw Error('封面只支持 PNG、JPEG 或 WebP');
        mkdirSync(join(dataDir,'covers'),{recursive:true});const filename=`${randomUUID()}.${ext}`;writeFileSync(join(dataDir,'covers',filename),bytes);return NextResponse.json({filename});
      }
      const name=text.max(120).parse(form.get('name'));const pasted=z.string().max(500000).parse(form.get('text')||'');
      const files=form.getAll('files').filter((f):f is File=>f instanceof File&&f.size>0);
      if(files.length>10||files.some(f=>f.size>8*1024*1024))throw Error('最多 10 个文件，每个不超过 8MB');
      if(files.some(f=>!['.txt','.md','.markdown','.docx'].includes(extname(f.name).toLowerCase())))throw Error('仅支持 TXT、Markdown 和 DOCX 文件');
      if(!pasted.trim()&&!files.length)throw Error('请上传文件或粘贴资料内容');
      const k=db().createKnowledge(name,pasted);mkdirSync(join(dataDir,'documents'),{recursive:true});
      for(const f of files){const bytes=Buffer.from(await f.arrayBuffer());const file=join(dataDir,'documents',randomUUID()+extname(f.name).toLowerCase());writeFileSync(file,bytes);
        try{const extracted=extname(f.name).toLowerCase()==='.docx'?(await mammoth.extractRawText({buffer:bytes})).value:new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!extracted.trim())throw Error('文件没有可提取文字');db().addDocument(k.id,f.name,'ready',extracted,'',file);}
        catch{db().addDocument(k.id,f.name,'failed','','无法提取文字，请使用 UTF-8 文本或有效 DOCX 后重新上传',file);}
      }return NextResponse.json({...k,...await indexSavedKnowledge(k.id)});
    }
    const input=JSON.parse((await body(req,4*1024*1024)).toString('utf8'));
    if(action==='rag/settings'){const v=ragSettingsSchema.parse(input);db().put('config',{...v,id:'rag'});return NextResponse.json({ok:true});}
    if(action==='rag/test'){const s=ragSettings(db());const tags=await ollama(s,'/api/tags');return NextResponse.json({models:(tags.models||[]).map((m:{name:string})=>m.name),message:'本机 Ollama 已连接'});}
    if(action==='rag/index'||action==='rag/search'||action==='rag/answer'){
      const v=z.object({knowledgeId:key,question:text.max(2000).optional()}).parse(input);
      if(action==='rag/index')return NextResponse.json(await buildIndex(db(),v.knowledgeId));
      if(!v.question)throw Error('请输入问题');
      return NextResponse.json(action==='rag/search'?{sources:await retrieve(db(),v.knowledgeId,v.question)}:await answerQuestion(db(),v.knowledgeId,v.question));
    }
    if(action==='knowledge/update'){const v=z.object({id:key,name:text.max(120),text:z.string().max(500000)}).parse(input);const old=db().get<Knowledge>('knowledge',v.id);if(!old)throw Error('资料不存在');const updated=db().put('knowledge',{...old,...v,updatedAt:new Date().toISOString()});return NextResponse.json({...updated,...await indexSavedKnowledge(v.id)});}
    if(action==='knowledge/delete'){const {id}=z.object({id:key}).parse(input);for(const d of db().documents().filter(d=>d.knowledgeId===id)){if(d.path&&existsSync(d.path))unlinkSync(d.path);db().remove('documents',d.id);}db().remove('knowledge',id);removeIndex(db(),id);return NextResponse.json({ok:true});}
    if(action==='topics/generate'){
      const v=z.object({knowledgeId:key.optional(),audience:text.max(200),purpose:text.max(200)}).parse(input);
      const context=await writingContext(db(),v.knowledgeId,`${v.audience} ${v.purpose}`);const result=topicSchema.parse(awaitModel(await writingCompletion(db(),writingSystem,`${context.text}\n目标读者：${v.audience}\n目的：${v.purpose}\n推荐 6 个值得回答的问题。返回 {"topics":[{"title":"题目","reason":"为什么写","checks":["写前核对事项"]}]}。`,context.local)));
      const topics=result.topics.map(t=>db().put<Topic>('topics',{...t,...v,knowledgeId:v.knowledgeId||'',id:randomUUID(),favorite:false}));return NextResponse.json(topics);
    }
    if(action==='topics/favorite'){const {id}=z.object({id:key}).parse(input);const t=db().get<Topic>('topics',id);if(!t)throw Error('选题不存在');return NextResponse.json(db().put('topics',{...t,favorite:!t.favorite}));}
    if(action==='articles/generate'){
      const v=z.object({knowledgeId:key.optional(),title:text.max(300),audience:text.max(200),purpose:text.max(200),requirements:z.string().max(5000).optional(),contentFormat:z.enum(['long','faq','qa','cards']).default('long'),itemCount:z.number().int().min(1).max(8).optional()}).parse(input);const s=db().settings();
      const count=v.itemCount??(v.contentFormat==='faq'?5:3);
      const context=await writingContext(db(),v.knowledgeId,`${v.title} ${v.requirements||""}`);const result=structuredResult(v.contentFormat,awaitModel(await writingCompletion(db(),writingSystem,`${context.text}\n题目：${v.title}\n读者：${v.audience}\n目的：${v.purpose}\n长度约 ${s.length} 字，语气：${s.tone}\n额外要求：${v.requirements||'无'}\n${formatInstruction(v.contentFormat,count)}`,context.local)),count);
      return NextResponse.json(db().saveArticle({...v,...result,retrievalSources:context.sources}));
    }
    if(action==='articles/save'){const v=z.object({id:key.optional(),knowledgeId:key.optional(),title:text.max(300),body:text.max(500000),contentFormat:z.enum(['long','faq','qa','cards']).optional(),audience:z.string().max(200),purpose:z.string().max(200),checks:z.array(z.string()).max(30)}).parse(input);return NextResponse.json(db().saveArticle(v));}
    if(action==='articles/delete'){const {id}=z.object({id:key}).parse(input);if(db().tasks().some(t=>t.articleId===id))throw Error('文章已有发布记录，请保留以便核对历史');db().remove('articles',id);return NextResponse.json({ok:true});}
    if(action==='accounts/add'){const {platform}=z.object({platform:z.enum(['zhihu','baijiahao','sohu','xiaohongshu','douyin','bilibili'])}).parse(input);return NextResponse.json(db().createAccount(platform as Platform));}
    if(action==='accounts/confirm'){const {id}=z.object({id:key}).parse(input);const a=db().get<Account>('accounts',id);if(!a?.observedIdentity||!a.observedName||a.status!=='observed')throw Error('请先在平台登录，并读取到可验证的账号身份');return NextResponse.json(db().confirmAccount(id,a.observedName,a.observedIdentity));}
    if(action==='accounts/remove'){const {id}=z.object({id:key}).parse(input);if(db().tasks().some(t=>t.accountId===id&&['queued','publishing','submitted','needs_action'].includes(t.status)))throw Error('该账号仍有未解决的发布任务，请先核对结果');db().remove('accounts',id);return NextResponse.json({ok:true});}
    if(action==='accounts/login'||action==='accounts/observe'){const {id}=z.object({id:key}).parse(input);if(!db().get<Account>('accounts',id))throw Error('账号不存在');if(!db().worker().online)throw Error('发布助手未连接，请使用启动脚本');if(bridgeState(db()).mode==='extension'&&!bridgeState(db()).online)throw Error('Chrome 扩展未连接，请到设置页加载扩展并配对');return NextResponse.json(db().command(action.endsWith('login')?'login':'observe',id));}
    if(action==='browser/pair-code')return NextResponse.json({code:createPairCode(db()),folder:extensionFolder()});
    if(action==='browser/mode'){const v=z.object({mode:z.enum(['extension','isolated'])}).parse(input);setBrowserMode(db(),v.mode);return NextResponse.json({ok:true});}
    if(action==='browser/disconnect'){disconnectExtension(db());return NextResponse.json({ok:true});}
    if(action==='browser/open-folder'){if(process.platform!=='win32')throw Error('请手动打开项目中的 chrome-extension 文件夹');spawn('explorer.exe',[extensionFolder()],{windowsHide:true,detached:true,stdio:'ignore'}).unref();return NextResponse.json({ok:true});}
    if(action==='settings/save'){
      const v=z.object({baseUrl:z.url().max(1000),model:text.max(200),apiKey:z.string().max(5000).optional(),contextLimit:z.number().int().min(8192).max(2000000),length:z.string().regex(/^\d{2,5}$/),tone:text.max(500)}).parse(input);
      const u=new URL(v.baseUrl);if(u.username||u.password||u.search||u.hash||!['https:','http:'].includes(u.protocol))throw Error('接口地址格式无效');if(u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw Error('非本机 AI 接口请使用 HTTPS');
      db().saveSettings({baseUrl:v.baseUrl.replace(/\/+$/,''),model:v.model,encryptedKey:v.apiKey?encryptKey(v.apiKey):db().settings().encryptedKey,contextLimit:v.contextLimit,length:v.length,tone:v.tone});return NextResponse.json({ok:true});
    }
    if(action==='settings/test'){await completion(db(),'回复 OK。','连接测试',true);return NextResponse.json({ok:true,message:'模型连接成功'});}
    if(action==='publish'){
      const v=z.object({articleId:key,reviewedRevision:key,accountIds:z.array(key).min(1).max(20),requestId:key,cover:z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|webp)$/).optional(),confirmed:z.literal(true),imagePost:z.object({images:z.array(z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|webp)$/)).min(1).max(9),title:text.max(100),body:text.max(2000)}).optional()}).parse(input);
      if(!db().worker().online)throw Error('发布助手未连接，请先启动助手');if(bridgeState(db()).mode==='extension'&&!bridgeState(db()).online)throw Error('Chrome 扩展未连接，请先在设置页完成配对');if(v.cover&&!existsSync(join(dataDir,'covers',v.cover)))throw Error('封面不存在，请重新上传');
      if(v.imagePost?.images.some(file=>!existsSync(join(dataDir,'covers',file))))throw Error('图文图片不存在，请重新上传');
      return NextResponse.json(db().createBatch(v.articleId,v.accountIds,v.requestId,v.cover,v.reviewedRevision,v.imagePost));
    }
    if(action==='tasks/confirm-publication'){const v=z.object({id:key,url:z.url().max(2000),confirmed:z.literal(true)}).parse(input);return NextResponse.json(db().confirmPublication(v.id,v.url));}
    if(action==='tasks/release'){const v=z.object({id:key,confirmed:z.literal(true)}).parse(input);return NextResponse.json(db().releaseImageTask(v.id));}
    if(action==='tasks/check'||action==='tasks/retry'){
      const v=z.object({id:key,url:z.url().optional()}).parse(input);const t=db().get<Task>('tasks',v.id);if(!t)throw Error('发布任务不存在');
      if(!db().worker().online)throw Error('发布助手未连接');
      if(action==='tasks/retry'){db().retryTask(v.id);return NextResponse.json({ok:true});}
      if(t.status==='manually_confirmed')throw Error('此记录已人工确认；请直接打开已保存链接查看，人工确认记录不会被自动检查覆盖');
      if(['queued','publishing'].includes(t.status))throw Error('发布任务正在处理，请稍后核验');
      if(v.url){const url=validatePublicUrl(t.platform,v.url);db().put('tasks',{...t,publicUrl:url,manualPublicationClaim:true,message:t.status==='published'?t.message:'已提供手动发布的文章链接，等待自动核验；此状态不代表平台正在审核，系统不会再次提交。'});}
      return NextResponse.json(db().command('check',v.id,v.url));
    }
    return fail('接口不存在',404);
  }catch(e){if(e instanceof z.ZodError)return fail('请检查必填字段、格式及长度限制');if(e instanceof SyntaxError)return fail('请求格式错误');return fail(e instanceof Error?e.message:'操作失败，请重试');}
}
import { parseModelJSON as awaitModel } from '@/lib/ai';
