import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {dataDir} from './store';
export function extensionFolder(){const folder=join(dataDir,'chrome-extension');mkdirSync(folder,{recursive:true});for(const file of ['manifest.json','background.js','platform.js','popup.html','popup.js','icon.png'])writeFileSync(join(folder,file),readFileSync(join(process.cwd(),'chrome-extension',file)));return folder;}
