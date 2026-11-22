import {existsSync,readFileSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
export function resolveDataLocation(root,env=process.env){
 const file=join(root,'local-data.json');let config;
 if(existsSync(file)){
  config=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  if(config.version!==1||typeof config.directory!=='string'||!isAbsolute(config.directory)||typeof config.workspaceId!=='string'||!config.workspaceId)throw Error('本机数据位置配置无效，请先修复 local-data.json，不能创建空工作区');
 }
 const directory=env.GEO_DATA_DIR||config?.directory||join(env.LOCALAPPDATA||root,'GEOStudio','data');
 const configured=!!config&&resolve(/*turbopackIgnore: true*/ directory).toLowerCase()===resolve(/*turbopackIgnore: true*/ config.directory).toLowerCase();
 if(configured&&!existsSync(join(directory,'geo.sqlite')))throw Error('已配置的工作区数据库不存在，已停止启动以避免显示空数据：'+directory);
 return {directory,workspaceId:configured?config.workspaceId:undefined};
}
