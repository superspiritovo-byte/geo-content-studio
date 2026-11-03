import TurndownService from 'turndown';
import {markdownHTML} from './publishing';
export function bodyToHTML(markdown:string){return markdownHTML(markdown);}
export function bodyToMarkdown(html:string){return new TurndownService({headingStyle:'atx',bulletListMarker:'-',codeBlockStyle:'fenced'}).turndown(html);}
