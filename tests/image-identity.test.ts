import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCreatorIdentity} from '../src/lib/image-identity';
test('抖音从当前账号接口提取昵称与sec_uid，不依赖头像超链接',()=>{
 assert.deepEqual(parseCreatorIdentity('douyin',{status_code:0,user:{nickname:'测试抖音',uid:'123',sec_uid:'MS4wLjABtest'}}),{name:'测试抖音',identity:'https://www.douyin.com/user/MS4wLjABtest'});
 assert.deepEqual(parseCreatorIdentity('douyin',{status_code:0,user:{},data:{user:{nickname:'嵌套账号',sec_uid:'MS4test'}}}),{name:'嵌套账号',identity:'https://www.douyin.com/user/MS4test'});
 assert.deepEqual(parseCreatorIdentity('douyin',{status_code:0,nickname:'PC账号',uid:'123'}),{name:'PC账号',identity:'https://creator.douyin.com/account?id=123'});
});
test('小红书当前账号接口提取userName/userId，拒绝未登录与空姓名',()=>{
 assert.deepEqual(parseCreatorIdentity('xiaohongshu',{success:true,code:0,data:{userName:'测试小红书',userId:'1234567890abcdef12345678',role:'creator'}}),{name:'测试小红书',identity:'https://www.xiaohongshu.com/user/profile/1234567890abcdef12345678'});
 assert.equal(parseCreatorIdentity('xiaohongshu',{success:false,code:-100,data:{userName:'不可信',userId:'1234567890abcdef12345678'}}),undefined);
 assert.equal(parseCreatorIdentity('douyin',{status_code:8,user:{nickname:'不可信',sec_uid:'abc'}}),undefined);
 assert.equal(parseCreatorIdentity('douyin',{status_code:0,user:{nickname:'',sec_uid:'abc'}}),undefined);
});
