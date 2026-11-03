import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIdentity, validatePublicUrl, contentMatches,editorMatches,bylineMatches,publicAccessFailure} from '../src/lib/publishing';
test('公开页面访问失败不能推断平台审核状态',()=>{
 assert.match(publicAccessFailure(403),/403/);
 assert.doesNotMatch(publicAccessFailure(403),/仍在审核/);
 assert.match(publicAccessFailure(403),/无法判断/);
});
test('拒绝外部网址、私网地址、平台登录页面和伪装域名',()=>{
  for(const url of ['http://127.0.0.1/a/1','https://sohu.com.evil.org/a/1','https://mp.sohu.com/login','https://user:pass@www.sohu.com/a/123_456'])assert.throws(()=>validatePublicUrl('sohu',url));
  assert.equal(validatePublicUrl('zhihu','https://zhuanlan.zhihu.com/p/123456'), 'https://zhuanlan.zhihu.com/p/123456');
});
test('作者标识去掉跟踪参数，但保留百家号稳定作者 ID',()=>{
  assert.equal(normalizeIdentity('https://www.zhihu.com/people/author-a?utm_source=test'),'https://www.zhihu.com/people/author-a');
  assert.equal(normalizeIdentity('https://author.baidu.com/home?from=bjh&app_id=123'),'https://author.baidu.com/home?app_id=123');
});
test('核验标题和完整正文，部分匹配不算成功',()=>{
  assert.equal(contentMatches('企业介绍','## 产品\n\n真实介绍。','企业介绍','产品 真实介绍。'),true);
  assert.equal(contentMatches('企业介绍','## 产品\n\n真实介绍。','企业介绍','产品'),false);
  assert.equal(contentMatches('企业介绍','正文','另一个标题','正文'),false);
});
test('编辑器必须完整回读正文与标题，不允许仅开头匹配',()=>{
  const body='这是开头。'.repeat(30)+'最后一句不能丢失。';
  assert.equal(editorMatches('原题',body,'原题',body.slice(0,80)),false);
  assert.equal(editorMatches('原题',body,'标题错误',body),false);
  assert.equal(editorMatches('原题',body,'原题',body),true);
});
test('署名区作者必须唯一匹配，正文或评论中的链接不作证据',()=>{
  const target='https://www.zhihu.com/people/target';
  assert.equal(bylineMatches(target,[]),false);
  assert.equal(bylineMatches(target,['https://www.zhihu.com/people/other']),false);
  assert.equal(bylineMatches(target,[target,'https://www.zhihu.com/people/other']),false);
  assert.equal(bylineMatches(target,[target,target+'?utm_source=foo']),true);
});
