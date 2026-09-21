import {AdminReview} from "@/components/lab/admin-review";
export const metadata={title:"Review request",robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){return <AdminReview token={(await params).token}/>;}
