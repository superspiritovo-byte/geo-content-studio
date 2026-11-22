import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clipboardHTML} from '../src/lib/clipboard-format';
test('复制小标题显式加粗，列表圆点和序号不依赖平台保留列表标签',()=>{
 const html=clipboardHTML('## 小标题\n\n普通正文，包含 **重点**。\n\n- **交付物边界**：正文\n- 第二项\n\n3. 第三步\n4. 第四步');
 assert.match(html,/<h2[^>]*>\s*<strong[^>]*>小标题<\/strong>/);assert.match(html,/• <strong[^>]*>交付物边界/);assert.match(html,/3\. 第三步/);assert.match(html,/4\. 第四步/);assert.doesNotMatch(html,/<(?:ul|ol|li)(?:\s|>)/);
 // Simulate a destination editor that unwraps headings/lists and drops style attributes.
 const cleaned=html.replace(/<\/?h[1-6][^>]*>/g,'').replace(/ style="[^"]*"/g,'');assert.match(cleaned,/<strong>小标题<\/strong>/);assert.match(cleaned,/• <strong>交付物边界<\/strong>/);
});
test('兼容复制保留多段和嵌套项目，原始HTML与危险链接不能变成可执行内容',()=>{
 const html=clipboardHTML('- 父项\n  - 子项\n\n  项目补充段落\n\n<script>alert(1)</script>\n\n[链接](javascript:alert(1))');
 assert.match(html,/• 父项/);assert.match(html,/• 子项/);assert.match(html,/项目补充段落/);assert.doesNotMatch(html,/<script|href="javascript:/);assert.equal((html.match(/• /g)||[]).length,2);
});
