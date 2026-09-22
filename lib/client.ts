export async function api<T=Record<string, unknown>>(path:string, init?:RequestInit):Promise<T>{
  const response=await fetch(`/api${path}`,{...init,headers:{...(init?.body?{"Content-Type":"application/json"}:{}),...init?.headers},credentials:"same-origin",cache:"no-store"});
  const body=await response.json().catch(()=>({error:"The server could not complete this request. Please try again."})) as {error?:string}&T;
  if(!response.ok)throw new Error(body.error||"Something went wrong. Please try again.");
  return body as T;
}
export function post<T=Record<string, unknown>>(path:string,body:unknown){return api<T>(path,{method:"POST",body:JSON.stringify(body)});}
export type ReportSummary={slug:string;title:string;description:string;publishedAt:string;vendors:string[];providerWebsites?:string[];kind?:'tool'|'comparison';captureStartAt?:string;captureEndAt?:string;storeCount:number;conversationCount:number;turnCount:number;criterionCount:number;protocol:string;commissionedBy?:string;hasHtml?:boolean;scores:{vendor:string;shopping:number;support:number}[];limitations?:string[]};
export type ToolSummary={id:string;name:string;website:string;reportSlug:string;evaluatedAt:string;oldestCaptureAt:string;expiresAt:string;fresh:boolean;scores:{shopping:number;support:number};storeCount:number;conversationCount:number;turnCount:number;customers:{name:string;website:string;shopping:number;support:number;capturedAt:string;oldestCaptureAt?:string}[];limitations:string[];protocol:string;comparisonSlugs?:string[]};
export type Customer={name:string;website:string};
export type Vendor={name:string;website:string;customers:Customer[]};
export type ComparisonInput={vendors:Vendor[];notes?:string;consent:boolean};
export function score(value:number){return Number.isInteger(value)?String(value):value.toFixed(1);}
export function date(value:string){return new Intl.DateTimeFormat("en-US",{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(value));}
/** Capture range in UTC: "Sep 21–22, 2026", "Sep 30 – Oct 2, 2026" or a single day. */
export function captureRange(startAt:string,endAt:string){
  const start=new Date(startAt),end=new Date(endAt);
  const format=(d:Date,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat("en-US",{...options,timeZone:"UTC"}).format(d);
  const full=(d:Date)=>format(d,{month:"short",day:"numeric",year:"numeric"});
  if(full(start)===full(end))return full(end);
  if(start.getUTCFullYear()!==end.getUTCFullYear())return `${full(start)} – ${full(end)}`;
  if(start.getUTCMonth()===end.getUTCMonth())return `${format(start,{month:"short",day:"numeric"})}–${format(end,{day:"numeric"})}, ${end.getUTCFullYear()}`;
  return `${format(start,{month:"short",day:"numeric"})} – ${full(end)}`;
}
