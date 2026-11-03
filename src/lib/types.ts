export type Platform = 'zhihu' | 'baijiahao' | 'sohu' | 'xiaohongshu' | 'douyin' | 'bilibili';
export const platforms: Record<Platform, {name:string; home:string; editor:string; cover:boolean; host:string}> = {
  xiaohongshu:{name:'小红书',home:'https://creator.xiaohongshu.com/',editor:'https://creator.xiaohongshu.com/publish/publish',cover:false,host:'xiaohongshu.com'},
  douyin:{name:'抖音',home:'https://creator.douyin.com/',editor:'https://creator.douyin.com/creator-micro/content/upload?default-tab=2',cover:false,host:'douyin.com'},
  bilibili:{name:'哔哩哔哩',home:'https://t.bilibili.com/',editor:'https://t.bilibili.com/',cover:false,host:'bilibili.com'},
  zhihu:{name:'知乎',home:'https://www.zhihu.com/creator',editor:'https://zhuanlan.zhihu.com/write',cover:false,host:'zhihu.com'},
  baijiahao:{name:'百家号',home:'https://baijiahao.baidu.com/builder/rc/home',editor:'https://baijiahao.baidu.com/builder/rc/edit?type=news',cover:true,host:'baidu.com'},
  sohu:{name:'搜狐号',home:'https://mp.sohu.com/mpfe/v4/personalCenter/account?curTab=1',editor:'https://mp.sohu.com/mpfe/v4/news/addarticle',cover:false,host:'sohu.com'},
};
export type Knowledge = {id:string; name:string; text:string; updatedAt:string};
export type Document = {id:string; knowledgeId:string; name:string; status:'ready'|'failed'; text:string; error:string; path?:string};
export type Topic = {id:string;knowledgeId:string;title:string;audience:string;purpose:string;reason:string;checks:string[];favorite:boolean};
export type Article = {id:string;revision:string;knowledgeId?:string;title:string;body:string;audience:string;purpose:string;checks:string[];updatedAt:string};
export type Account = {id:string;platform:Platform;name:string;identity:string;status:'new'|'observed'|'ready'|'expired';observedName?:string;observedIdentity?:string;message:string;publishable?:boolean};
export type TaskStatus = 'queued'|'publishing'|'submitted'|'published'|'needs_action'|'failed'|'handled';
export type Task = {id:string;batchId:string;articleId:string;accountId:string;platform:Platform;accountName:string;identity:string;snapshot:Article;cover?:string;images?:string[];postTitle?:string;postBody?:string;status:TaskStatus;stage:string;message:string;updatedAt:string;publicUrl?:string;submissionAttempt:boolean;manualPublicationClaim?:boolean;fingerprint:string};
export type Command = {id:string;kind:'login'|'observe'|'check'|'retry';target:string;url?:string;status:'queued'|'running'|'done'|'failed';message:string};
export type Settings = {baseUrl:string;model:string;encryptedKey:string;contextLimit:number;length:string;tone:string};
export type AppState = {knowledge:Knowledge[];documents:Document[];topics:Topic[];articles:Article[];accounts:Account[];tasks:Task[];commands:Command[];settings:Omit<Settings,'encryptedKey'>&{hasKey:boolean};worker:{online:boolean;heartbeat?:string;message?:string}};
