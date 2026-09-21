import {ReportExplorer} from "@/components/lab/report-explorer";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return {title:slug.replaceAll("-"," ")};}
export default async function Page({params}:{params:Promise<{slug:string}>}){return <ReportExplorer slug={(await params).slug}/>;}
