import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bodyToHTML,bodyToMarkdown} from '../src/lib/rich-body';
test('排版编辑保留标题、粗体及列表，保存后可再次还原排版',()=>{
 const html=bodyToHTML('## 小标题\n\n正常正文，含 **重点**。\n\n- 第一项\n- 第二项');
 assert.match(html,/<h2>/);assert.match(html,/<strong>重点<\/strong>/);assert.match(html,/<ul>/);assert.doesNotMatch(html,/##|\*\*/);
 const saved=bodyToMarkdown(html.replace('第一项','改过的第一项'));
 const restored=bodyToHTML(saved);assert.match(restored,/<h2>/);assert.match(restored,/改过的第一项/);assert.match(restored,/<strong>/);assert.match(restored,/<ul>/);
});
