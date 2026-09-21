export async function api<T=Record<string, unknown>>(path:string, init?:RequestInit):Promise<T>{
  const response=await fetch(`/api${path}`,{...init,headers:{...(init?.body?{"Content-Type":"application/json"}:{}),...init?.headers},credentials:"same-origin",cache:"no-store"});
  const body=await response.json().catch(()=>({error:"The server could not complete this request. Please try again."})) as {error?:string}&T;
  if(!response.ok)throw new Error(body.error||"Something went wrong. Please try again.");
  return body as T;
}
export function post<T=Record<string, unknown>>(path:string,body:unknown){return api<T>(path,{method:"POST",body:JSON.stringify(body)});}
export type ReportSummary={slug:string;title:string;description:string;publishedAt:string;vendors:string[];storeCount:number;conversationCount:number;turnCount:number;criterionCount:number;protocol:string;commissionedBy?:string;scores:{vendor:string;shopping:number;support:number}[];limitations?:string[]};
export type Customer={name:string;website:string};
export type Vendor={name:string;website:string;customers:Customer[]};
export type ComparisonInput={vendors:Vendor[];notes?:string;consent:boolean};
export function score(value:number){return Number.isInteger(value)?String(value):value.toFixed(1);}
export function date(value:string){return new Intl.DateTimeFormat("en-US",{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(value));}
