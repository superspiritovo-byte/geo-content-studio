// Runs in the selected platform page. No extension or local connection credentials enter this world.
export async function platformAction(platform, action, payload = {}) {
 try {
 const hosts={zhihu:['www.zhihu.com','zhuanlan.zhihu.com'],baijiahao:['baijiahao.baidu.com'],sohu:['mp.sohu.com'],xiaohongshu:['creator.xiaohongshu.com','www.xiaohongshu.com'],douyin:['creator.douyin.com','www.douyin.com'],bilibili:['t.bilibili.com','www.bilibili.com','space.bilibili.com']};
 if(location.protocol!=='https:'||!hosts[platform]?.includes(location.hostname))throw Error('平台页面不匹配，请先在对应创作者后台登录');
 const json=async(path,options={})=>{const r=await fetch(path,{credentials:'include',signal:AbortSignal.timeout(15000),...options});if(!r.ok)throw Error(`平台当前账号接口访问失败（HTTP ${r.status}），请检查平台页面`);return r.json();};
 const name=v=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=100?v.trim():null;
 const id=v=>typeof v==='string'?v:typeof v==='number'&&Number.isSafeInteger(v)?String(v):'';
 if(action==='identity'){
  if(platform==='zhihu'){
   if(location.hostname!=='www.zhihu.com')throw Error('请在知乎创作者中心读取账号');
   try{const me=await json('/api/v4/me');if(name(me.name)&&/^[\w-]+$/.test(me.url_token||''))return{name:name(me.name),identity:`https://www.zhihu.com/people/${me.url_token}`};}catch{}
   const own=[...document.querySelectorAll('button,a')].some(n=>n.textContent.trim()==='编辑个人资料');const me=document.querySelector('.ProfileHeader-name');const match=location.pathname.match(/^\/people\/([\w-]+)/);if(own&&me&&match&&name(me.textContent))return{name:name(me.textContent),identity:`https://www.zhihu.com/people/${match[1]}`};
  }
  if(platform==='baijiahao'){
   if(!location.pathname.startsWith('/builder/rc/settings/accountSet'))throw Error('请在百家号账号设置页读取身份');
   const text=document.body.innerText;const ids=[...text.matchAll(/百家号\s*ID\s*[:：]?\s*(\d{6,25})/gi)].map(m=>m[1]);const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const index=lines.findIndex(x=>/百家号\s*ID/i.test(x));const n=lines[index-1];if(new Set(ids).size===1&&name(n)&&!/^(账号信息|基础信息|百家号|修改|编辑|切换)$/.test(n))return{name:n,identity:`https://baijiahao.baidu.com/builder/rc/settings/accountSet?id=${ids[0]}`};
  }
  if(platform==='sohu'){
   const headers={};const ticket=localStorage.getItem('ticket');if(ticket)headers.ticket=ticket;for(const key of ['mpToken','mp-cv']){const item=document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(key+'='));if(item)headers[key]=decodeURIComponent(item.slice(key.length+1));}
   const value=await json('/mpbp/bp/account/listV2',{headers});const found=new Map();if(value.code===2000000)for(const entry of value.data?.data||[]){for(const a of entry.accountInfos||[entry])if(name(a.nickName)&&/^\d+$/.test(id(a.id)))found.set(id(a.id),{name:name(a.nickName),identity:`https://mp.sohu.com/mpfe/v4/personalCenter/account?id=${id(a.id)}`,publishable:a.status===1});}if(found.size===1)return [...found.values()][0];if(found.size>1)throw Error('当前登录有多个搜狐号，请在后台选择目标账号，无法唯一确认');
  }
  if(platform==='xiaohongshu'){
   if(location.hostname!=='creator.xiaohongshu.com')throw Error('请在小红书创作者中心读取身份');const v=await json('/api/galaxy/user/info');const me=v.data;if(v.code===0&&v.success!==false&&name(me?.userName)&&/^[\w-]+$/.test(me?.userId||''))return{name:name(me.userName),identity:/^[a-f\d]{24}$/i.test(me.userId)?`https://www.xiaohongshu.com/user/profile/${me.userId}`:`https://creator.xiaohongshu.com/account?id=${me.userId}`};
  }
  if(platform==='douyin'){
   if(location.hostname!=='creator.douyin.com')throw Error('请在抖音创作者中心读取身份');const v=await json('/aweme/v1/creator/pc/user/info/');if(v.status_code===0){let n=name(v.nickname),sec=v.sec_uid;if(!n){const detail=await json('/aweme/v1/creator/user/info/');const me=detail.user_profile||detail.user||detail.user_info||detail.data;const again=await json('/aweme/v1/creator/pc/user/info/');if(detail.status_code===0&&id(again.uid)===id(v.uid)&&(!me?.uid||id(me.uid)===id(v.uid))){n=name(me?.nick_name||me?.nickname);sec=me?.sec_uid;}}if(n&&/^[\w.-]+$/.test(sec||''))return{name:n,identity:`https://www.douyin.com/user/${sec}`};if(n&&/^\d+$/.test(id(v.uid)))return{name:n,identity:`https://creator.douyin.com/account?id=${id(v.uid)}`};}
  }
  if(platform==='bilibili'){const v=await json('https://api.bilibili.com/x/web-interface/nav');const me=v.data;if(v.code===0&&me?.isLogin===true&&name(me.uname)&&/^\d+$/.test(id(me.mid)))return{name:name(me.uname),identity:`https://space.bilibili.com/${id(me.mid)}`};}
  throw Error('尚未唯一识别当前登录账号，请在该创作者页面完成登录后重新读取；不会使用页面中的其他作者身份');
 }
 const docs=[];const collect=doc=>{docs.push(doc);for(const frame of doc.querySelectorAll('iframe'))try{if(frame.contentDocument)collect(frame.contentDocument);}catch{}};collect(document);
 const query=selector=>docs.flatMap(doc=>[...doc.querySelectorAll(selector)]);
 const visible=el=>{if(!el.getClientRects().length||el.ownerDocument.defaultView.getComputedStyle(el).visibility==='hidden')return false;const frame=el.ownerDocument.defaultView.frameElement;return !frame||visible(frame);};
 const input=el=>el.tagName==='INPUT'||el.tagName==='TEXTAREA';
 const hasImages=()=>query('input[type="file"]').some(el=>el.files?.length)||query('.ant-upload-list img,.el-upload-list img,[class*="upload"] img,[class*="Upload"] img,img[src^="blob:"],.image-item img,.img-item img').some(visible);

 const unique=(selectors,visibleOnly=true)=>{for(const s of selectors){const els=query(s).filter(el=>!visibleOnly||visible(el));if(els.length===1)return els[0];}throw Error('编辑控件尚不能唯一识别，请在平台页面检查；没有点击发布');};
 const normalized=s=>s.replace(/[\s\u200b-\u200d\ufeff]/g,'');
 const set=(el,value,html)=>{el.focus();if(input(el)){const win=el.ownerDocument.defaultView;const proto=el.tagName==='INPUT'?win.HTMLInputElement.prototype:win.HTMLTextAreaElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}else{const doc=el.ownerDocument;const range=doc.createRange();range.selectNodeContents(el);const selection=doc.getSelection();selection.removeAllRanges();selection.addRange(range);const dt=new DataTransfer();dt.setData('text/plain',value);if(html)dt.setData('text/html',html);const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt});const handled=!el.dispatchEvent(event);if(!handled){if(!doc.execCommand(html?'insertHTML':'insertText',false,html||value))throw Error('编辑器未接受正文，请人工检查');}el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));}};
 if(action==='switch-image'){const tabs=[...document.querySelectorAll('button,a,span,div')].filter(el=>visible(el)&&/^(上传图文|发布图文|图文)$/.test(el.textContent.trim())&&el.children.length===0);if(tabs.length===1)tabs[0].click();return{opened:true};}
 if(action==='check-empty'){if(hasImages()||query('textarea,input[placeholder*="标题"],[contenteditable="true"]').filter(visible).some(el=>normalized(el.value||el.innerText||'')))throw Error('该页面已有文字或图片草稿，为避免覆盖请先自行处理；未填入正文或图片');return{opened:true};}
 if(action==='upload'){
  const el=unique(['input[type="file"][accept*="image"]'],false);if(hasImages())throw Error('页面已有图片，请先自行处理，未替换上传内容');if(payload.files.length>1&&!el.multiple)throw Error('该上传控件不支持多图，请切换到图文模式');const dt=new DataTransfer();for(const f of payload.files){const bytes=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));dt.items.add(new File([bytes],f.name,{type:f.type}));}el.files=dt.files;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return{opened:true};
 }
 if(action==='fill'){
  const isImage=['xiaohongshu','douyin','bilibili'].includes(platform);
  const titles=['textarea[placeholder*="标题"]','input[placeholder*="标题"]','[contenteditable="true"][data-placeholder*="标题"]'];
  const bodies=platform==='zhihu'?['.DraftEditor-root [contenteditable="true"]','.public-DraftEditor-content','.ProseMirror','.tiptap','[contenteditable="true"][role="textbox"]']:platform==='sohu'?['.ql-editor','.ProseMirror','[contenteditable="true"]']:['body.view','body[contenteditable="true"]','[contenteditable="true"][data-placeholder*="正文"]','[contenteditable="true"][data-placeholder*="说"]','.tiptap','.ProseMirror','.ql-editor','textarea[placeholder*="正文"]','textarea[placeholder*="说"]','[contenteditable="true"]'];
  const title=platform==='bilibili'?null:unique(titles);const body=unique(bodies);const text=el=>input(el)?el.value:el.innerText;
  let expected=platform==='bilibili'?`${payload.title}\n\n${payload.body}`:payload.body;
  if(normalized(text(body))||title&&normalized(text(title)))throw Error('该页面已有草稿内容，为避免覆盖请先自行处理；没有改动正文或点击发布');
  let html=payload.html;
  if(html){const doc=new DOMParser().parseFromString(html,'text/html');const allowed=new Set(['P','BR','H1','H2','H3','H4','H5','H6','STRONG','B','EM','I','UL','OL','LI','BLOCKQUOTE','PRE','CODE','HR','TABLE','THEAD','TBODY','TR','TH','TD','A']);for(const el of [...doc.body.querySelectorAll('*')]){if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue;}for(const a of [...el.attributes])if(!(el.tagName==='A'&&a.name==='href'&&/^https?:\/\//i.test(a.value)))el.removeAttribute(a.name);}html=doc.body.innerHTML;if(!isImage)expected=doc.body.textContent||'';}
  if(title)set(title,payload.title);set(body,expected,isImage?undefined:html);
  await new Promise(r=>setTimeout(r,700));
  if(title&&normalized(text(title))!==normalized(payload.title)||normalized(text(body))!==normalized(expected))throw Error('正文或标题回读不一致，请在当前标签页人工核对；没有点击发布');
  return{prepared:true};
 }
 throw Error('不支持的页面操作');
 }catch(e){return {pageError:String(e.message||e)};}
}
