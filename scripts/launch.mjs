import {spawn} from 'node:child_process';
import {mkdirSync,openSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const port=Number(process.env.PORT||18080);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT must be an integer between 1024 and 65535');
const check=net.createServer();
await new Promise((resolve,reject)=>{check.once('error',()=>reject(Error(`Port ${port} is already in use. Close the existing instance or set PORT.`)));check.listen(port,'127.0.0.1',()=>check.close(resolve));});
const dataDir=process.env.GEO_DATA_DIR||join(process.env.LOCALAPPDATA||root,'GEOStudio','data');
mkdirSync(join(dataDir,'logs'),{recursive:true});
const children=[];let stopping=false;
function start(name,args){const log=openSync(join(dataDir,'logs',`${name}.log`),'a');const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore',log,log]});children.push(child);child.on('error',e=>{console.error(e.message);stop(1);});child.on('exit',code=>{if(!stopping){console.error(`${name} stopped (${code}). See ${dataDir}/logs/${name}.log`);stop(code||1);}});}
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();setTimeout(()=>process.exit(code),1500);}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
start('web',[join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)]);
start('worker',[join(root,'node_modules/tsx/dist/cli.mjs'),join(root,'src/worker.ts')]);
const url=`http://127.0.0.1:${port}`;
console.log(`GEO Studio starting: ${url}\nLocal data: ${dataDir}\nPress Ctrl+C to stop.`);
for(let i=0;i<40;i++){try{const r=await fetch(`${url}/api/state`);if(r.ok){console.log(`Ready: ${url}`);break;}}catch{}await new Promise(r=>setTimeout(r,500));}
