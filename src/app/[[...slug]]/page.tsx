import {redirect} from 'next/navigation';
import Studio from '@/components/studio';

export default async function Page({params}:{params:Promise<{slug?:string[]}>}){
  const {slug}=await params;
  if(slug?.[0]==='monitor'||slug?.[0]==='autopilot')redirect('/');
  return <Studio/>;
}
