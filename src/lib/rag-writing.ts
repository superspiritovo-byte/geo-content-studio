import {buildContext,completion} from './ai';
import {ragSettings,retrieve,sourceContext,localCompletion,type Source} from './rag';
import type {Store} from './store';
export async function writingContext(db:Store,id:string|undefined,query:string):Promise<{text:string;sources:Source[];local:boolean}>{if(!ragSettings(db).enabled)return {text:buildContext(db,id),sources:[],local:false};if(!id)return {text:'未选择资料，不得编造企业事实。',sources:[],local:true};const sources=await retrieve(db,id,query);return {text:sourceContext(sources),sources,local:true};}
export async function writingCompletion(db:Store,system:string,prompt:string,local:boolean){return local?localCompletion(db,system,prompt):completion(db,system,prompt);}
