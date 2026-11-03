// Optional local UI fixture. The fixed QA port prevents writing to the user's normal workspace.
export {};
const response=await fetch('http://127.0.0.1:18081/api/articles/save',{method:'POST',headers:{'Content-Type':'application/json',origin:'http://127.0.0.1:18081'},body:JSON.stringify({title:'界面验收：企业内容运营先准备哪些资料？',body:'本文仅用于隔离环境的界面验收，不代表真实企业信息。\n\n## 先把业务说明白\n\n准备企业介绍、产品服务和适合人群，说明真实可交付的内容。\n\n## 再回答客户的问题\n\n- 整理客户常见问题。\n- 补充可验证案例。\n- 发布前核对价格与联系方式。',audience:'企业运营人员',purpose:'回答客户常见问题',checks:['核对所有企业事实','此为界面测试文章，不应公开发布']})});
if(!response.ok)throw Error(await response.text());const article=await response.json();console.log(JSON.stringify({id:article.id,editor:`http://127.0.0.1:18081/articles/${article.id}`}));
