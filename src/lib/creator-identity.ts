export function parseBaijiaAccount(text:string):{name:string;identity:string}|undefined{
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const ids=[...text.matchAll(/百家号\s*ID\s*[:：]?\s*(\d{6,25})/gi)].map(m=>m[1]);
 if(new Set(ids).size!==1)return;
 const index=lines.findIndex(s=>/百家号\s*ID/i.test(s));
 const name=lines[index-1];
 if(!name||name.length>100||/^(账号信息|基础信息|百家号|修改|编辑|切换)$/.test(name))return;
 // Account ID is not assumed to be a public app_id. Keep a distinct private identity.
 return {name,identity:`https://baijiahao.baidu.com/builder/rc/settings/accountSet?id=${ids[0]}`};
}
export function sohuCreatorRequired(url:string){try{const u=new URL(url);return u.protocol!=='https:'||u.hostname!=='mp.sohu.com'||!/^\/mpfe\//.test(u.pathname);}catch{return true;}}
export function parseSohuAccounts(value:unknown):{name:string;identity:string;publishable?:boolean}[]{
 if(!value||typeof value!=='object')return [];
 const response=value as {code?:unknown;data?:{data?:unknown}};
 if(response.code!==2000000||!Array.isArray(response.data?.data))return [];
 const result=new Map<string,{name:string;identity:string;publishable?:boolean}>();
 for(const entry of response.data.data){
  if(!entry||typeof entry!=='object')continue;
  const items=Array.isArray(entry.accountInfos)?entry.accountInfos:[entry];
  for(const item of items){
   if(!item||typeof item.nickName!=='string'||!item.nickName.trim()||item.nickName.trim().length>100)continue;
   const id=typeof item.id==='string'?item.id:typeof item.id==='number'&&Number.isSafeInteger(item.id)?String(item.id):'';
   if(!/^\d+$/.test(id))continue;
   result.set(id,{name:item.nickName.trim(),identity:`https://mp.sohu.com/mpfe/v4/personalCenter/account?id=${id}`,...(item.status===1?{}:{publishable:false})});
  }
 }
 return [...result.values()];
}
