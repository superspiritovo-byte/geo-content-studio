import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBaijiaAccount,sohuCreatorRequired,parseSohuAccounts} from '../src/lib/creator-identity';
test('百家号设置页提取独立姓名与数字ID，不要求姓名超链接',()=>{
 assert.deepEqual(parseBaijiaAccount('账号信息\nfixture-author\n百家号ID: 123456789012345\n还没有任何签名哦'),{name:'fixture-author',identity:'https://baijiahao.baidu.com/builder/rc/settings/accountSet?id=123456789012345'});
});
test('重复展示同一ID可接受；多个账号ID或缺失姓名不猜测',()=>{
 assert.equal(parseBaijiaAccount('账号信息\n百家号ID: 123456789'),undefined);
 assert.equal(parseBaijiaAccount('账号信息\n甲\n百家号ID: 123456789\n乙\n百家号ID: 987654321'),undefined);
});
test('搜狐个人资料页不能冒充搜狐号发布后台',()=>{
 assert.equal(sohuCreatorRequired('https://www.sohu.com/ucenter/editInfo'),true);
 assert.equal(sohuCreatorRequired('https://mp.sohu.com/mpfe/v4/contentManagement/news'),false);
});
test('搜狐新版账号列表按稳定ID和已通过状态识别，支持组织分组',()=>{
 assert.deepEqual(parseSohuAccounts({code:2000000,data:{data:[{accountInfos:[{id:123,nickName:'测试搜狐号',status:1}]}]}}),[{name:'测试搜狐号',identity:'https://mp.sohu.com/mpfe/v4/personalCenter/account?id=123'}]);
 assert.deepEqual(parseSohuAccounts({code:2000000,data:{data:[{id:123,nickName:'未审核',status:0}]}}),[{name:'未审核',identity:'https://mp.sohu.com/mpfe/v4/personalCenter/account?id=123',publishable:false}]);
 assert.deepEqual(parseSohuAccounts({code:401,data:{data:[{id:123,nickName:'不能信任',status:1}]}}),[]);
});
