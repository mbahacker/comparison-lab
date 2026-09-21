import {RequestStatus} from "@/components/lab/request-status";
export const metadata={title:"Request status",robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){return <RequestStatus id={(await params).id}/>;}
