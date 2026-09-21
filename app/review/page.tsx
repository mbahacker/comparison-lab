import {AdminReview} from "@/components/lab/admin-review";
export const metadata={title:"Review request",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}){return <AdminReview token={(await searchParams).token||""}/>;}
