"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {ArrowRight,Search,FileText,ArrowUpRight,Check,RefreshCw} from "lucide-react";
import {api,ReportSummary,score,date} from "@/lib/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

export function ReportLibrary(){
 const [reports,setReports]=useState<ReportSummary[]>([]),[q,setQ]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const load=()=>{setLoading(true);setError("");api<{reports:ReportSummary[]}>("/reports").then(d=>setReports(d.reports)).catch(e=>setError(e.message)).finally(()=>setLoading(false));};
 useEffect(()=>{load();},[]);
 const shown=reports.filter(r=>`${r.title} ${r.description} ${r.vendors.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
 return <main id="main" className="shell library">
   <div className="page-heading"><div><p className="eyebrow">THE REPORT LIBRARY</p><h1>Compare the answers.<br/><span>Inspect the evidence.</span></h1><p className="intro">AI shopping and support, evaluated against a published rubric.<br className="desktop-only"/> Every score links back to the conversation that produced it.</p></div><Link href="/request" className="button primary">Request a comparison <ArrowUpRight size={18}/></Link></div>
   <div className="library-tools"><div className="section-label">Published reports <span>{reports.length.toString().padStart(2,"0")}</span></div><div className="search-wrap"><Search size={18}/><Input aria-label="Search reports" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search companies or reports"/></div></div>
   {loading&&<div className="empty-state" role="status">Loading published reports…</div>}
   {error&&<div className="error-box" role="alert">{error}<Button variant="outline" onClick={load}><RefreshCw size={16}/>Try again</Button></div>}
   {!loading&&!error&&shown.length===0&&<div className="empty-state"><FileText/><h2>{q?"No matching reports":"The first report is on its way"}</h2><p>{q?"Try a company name or clear your search.":"You can submit a comparison for review now."}</p>{q&&<Button variant="outline" onClick={()=>setQ("")}>Clear search</Button>}</div>}
   <div className="report-list">{shown.map(r=><article className="report-card" key={r.slug}>
     <div className="report-card-main"><div className="report-meta"><span className="pill">QUALITY PILOT</span><span>{date(r.publishedAt)}</span></div><h2><Link href={`/reports/${r.slug}`}>{r.title}</Link></h2><p>{r.description}</p><div className="report-facts"><span><b>{r.storeCount}</b> storefronts</span><span><b>{r.conversationCount}</b> conversations</span><span><b>{r.criterionCount}</b> criteria</span></div><Link href={`/reports/${r.slug}`} className="text-link">Explore report <ArrowRight size={18}/></Link></div>
     <div className="score-preview"><p className="eyebrow">AVERAGE QUALITY SCORE <span>/ 100</span></p><table><thead><tr><th>Provider</th><th>Shopping</th><th>Support</th></tr></thead><tbody>{r.scores.map(v=><tr key={v.vendor}><td>{v.vendor}</td><td>{score(v.shopping)}</td><td>{score(v.support)}</td></tr>)}</tbody></table><p>Selected storefronts. Quality only.<br/>Read the methodology and limitations.</p></div>
   </article>)}</div>
   <div className="library-bottom"><div><span className="small-icon"><Check size={18}/></span><div><h3>The method stays visible.</h3><p>Fixed questions, published criteria, separate AI judging and audit. Read the limits alongside the results.</p><Link href="/methodology">Explore the rubric <ArrowRight size={16}/></Link></div></div><div><span className="small-icon"><FileText size={18}/></span><div><h3>Have a comparison in mind?</h3><p>Verify your work email, enter two providers and three customer storefronts for each. We review every request.</p><Link href="/request">Submit a request <ArrowRight size={16}/></Link></div></div></div>
 </main>;
}
