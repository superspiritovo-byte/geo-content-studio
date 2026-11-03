import { execFileSync } from 'node:child_process';
function dpapi(value:string,decode:boolean){
  if(process.platform!=='win32')throw Error('密钥加密功能需要 Windows 用户级 DPAPI；不会将密钥明文保存');
  const script=`Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($v); $r=[Security.Cryptography.ProtectedData]::${decode?'Unprotect':'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($r))`;
  return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:value,encoding:'utf8',windowsHide:true,timeout:15000}).trim();
}
export function encryptKey(key:string){return dpapi(Buffer.from(key,'utf8').toString('base64'),false);}
export function decryptKey(value:string){return Buffer.from(dpapi(value,true),'base64').toString('utf8');}
