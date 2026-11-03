import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'GEO 精准获客平台',description:'从企业资料到专业内容，在一个工作台完成。'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
