import { z } from 'zod';
export const contentFormats = { long:'长文', faq:'FAQ', qa:'问答对', cards:'知识卡片' } as const;
export type ContentFormat = keyof typeof contentFormats;
const common = { title:z.string().trim().min(1).max(300),checks:z.array(z.string()).max(30) };
const text = z.string().trim().min(1);
export function formatInstruction(format:ContentFormat,count:number) {
  if(format==='long')return '返回 {"title":"标题","body":"Markdown 正文，不重复一级标题，不包含图片","checks":["需人工核对的信息"]}。';
  const item = format==='cards'
    ? '{"topic":"主题","conclusion":"核心结论","facts":["有依据的关键事实"],"boundary":"适用边界"}'
    : '{"question":"独立完整的问题","answer":"直接回答，包含有依据的解释"}';
  return `生成 ${count} ${format==='cards'?'张知识卡片':'组问答'}。每项可独立阅读。返回 {"title":"标题","items":[${item}],"checks":["需核对的信息"]}。items 数量必须为 ${count}。不编造事实、来源或效果。`;
}
export function structuredResult(format:ContentFormat,raw:unknown,count:number) {
  if(format==='long')return z.object({...common,body:text}).parse(raw);
  if(format==='cards'){
    const value=z.object({...common,items:z.array(z.object({topic:text,conclusion:text,facts:z.array(text).min(1).max(12),boundary:text})).length(count)}).parse(raw);
    return {title:value.title,checks:value.checks,body:value.items.map(i=>`## ${i.topic}\n\n${i.conclusion}\n\n${i.facts.map(f=>'- '+f).join('\n')}\n\n**适用边界**\n\n${i.boundary}`).join('\n\n')};
  }
  const value=z.object({...common,items:z.array(z.object({question:text,answer:text})).length(count)}).parse(raw);
  return {title:value.title,checks:value.checks,body:value.items.map(i=>`## ${i.question}\n\n${i.answer}`).join('\n\n')};
}
