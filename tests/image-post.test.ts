import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateImagePost,captionText,isImagePlatform} from '../src/lib/image-post';
import {validatePublicUrl} from '../src/lib/publishing';
test('新平台图文需要图片，图片和文案超限不能截断后发送',()=>{
 for(const platform of ['xiaohongshu','douyin','bilibili'] as const){assert.equal(isImagePlatform(platform),true);assert.throws(()=>validateImagePost(platform,'标题','说明',[]),/图片/);}
 assert.throws(()=>validateImagePost('xiaohongshu','长'.repeat(21),'说明',['a.jpg']),/标题/);
 assert.throws(()=>validateImagePost('xiaohongshu','题目','长'.repeat(1001),['a.jpg']),/正文/);
 assert.throws(()=>validateImagePost('bilibili','题目','说明',Array(10).fill('a.jpg')),/9/);
 assert.match(captionText('## 标题\n\n**重点**\n\n- 一项'),/标题/);assert.doesNotMatch(captionText('## 标题\n\n**重点**\n\n- 一项'),/##|\*\*/);
});
test('新平台只接受对应图文公开链接',()=>{
 assert.match(validatePublicUrl('douyin','https://www.douyin.com/note/123'),/note/);
 assert.match(validatePublicUrl('bilibili','https://www.bilibili.com/opus/123'),/opus/);
 assert.match(validatePublicUrl('xiaohongshu','https://www.xiaohongshu.com/explore/1234567890abcdef12345678'),/explore/);
 assert.throws(()=>validatePublicUrl('douyin','https://www.bilibili.com/opus/123'));
});
