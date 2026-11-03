export function parseCreatorIdentity(platform:'douyin'|'xiaohongshu',value:unknown):{name:string;identity:string}|undefined{
 if(!value||typeof value!=='object')return;
 const raw=value as any;
 if(platform==='douyin'){
  if(raw.status_code!==0&&raw.statusCode!==0)return;
  const me=raw.nickname?raw:raw.user?.nickname?raw.user:raw.data?.user?.nickname?raw.data.user:raw.data;
  if(!me||typeof me.nickname!=='string'||!me.nickname.trim()||me.nickname.trim().length>100)return;
  if(typeof me.sec_uid==='string'&&/^[\w.-]+$/.test(me.sec_uid))return{name:me.nickname.trim(),identity:`https://www.douyin.com/user/${me.sec_uid}`};
  const uid=typeof me.uid==='string'?me.uid:typeof me.uid==='number'&&Number.isSafeInteger(me.uid)?String(me.uid):'';
  if(/^\d+$/.test(uid))return{name:me.nickname.trim(),identity:`https://creator.douyin.com/account?id=${uid}`};
 }else{
  if(raw.success===false||raw.code!==0)return;
  const me=raw.data;
  if(!me||typeof me.userName!=='string'||!me.userName.trim()||me.userName.trim().length>100||typeof me.userId!=='string'||!/^[\w-]+$/.test(me.userId))return;
  return{name:me.userName.trim(),identity:/^[a-f\d]{24}$/i.test(me.userId)?`https://www.xiaohongshu.com/user/profile/${me.userId}`:`https://creator.xiaohongshu.com/account?id=${me.userId}`};
 }
}
