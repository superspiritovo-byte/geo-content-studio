import {test} from 'node:test';
import assert from 'node:assert/strict';
import {structuredResult} from '../src/lib/content-format';

test('结构化生成严格校验数量，卡片保留事实与边界', () => {
  const result=structuredResult('cards',{title:'知识卡',items:[{topic:'范围',conclusion:'支持维修',facts:['事实'],boundary:'仅限已核实型号'}],checks:['核对型号']},1);
  assert.match(result.body,/仅限已核实型号/);
  assert.throws(()=>structuredResult('faq',{title:'问题',items:[{question:'Q',answer:'A'}],checks:[]},2));
});
