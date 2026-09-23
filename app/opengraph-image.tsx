import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getResearchLibrary } from "@/lib/server/research-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt =
  "Alhena Research Lab: ecommerce AI agents, tested on real storefronts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asset = (file: string) => fs.readFileSync(path.join(process.cwd(), "public", file));
const INK = "#0F172A", SOFT = "#334155", QUIET = "#5B6A82", RULE = "#E3E8F0", BLUE = "#0866FF";

function Check({ color }: { color: string }) {
  return <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** Social preview mirroring the homepage hero: headline, and a storefront chat widget being graded. */
export default function Image() {
  const { tools } = getResearchLibrary();
  const checks: [string, string][] = [["Right outcome under the store's policy", BLUE], ["Answer quality, 26 criteria", "#86B3FF"], ["Time to the full answer", "#F0A33A"]];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FFFFFF", color: INK, fontFamily: "DM Sans", padding: "52px 56px" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22 }}>
            <img src={`data:image/svg+xml;base64,${asset("brand/alhena-logo.svg").toString("base64")}`} alt="Alhena" width={124} height={36} />
            <span style={{ display: "flex", width: 1, height: 26, background: "#DCE3EE" }} />
            <span style={{ color: SOFT }}>Research Lab</span>
          </div>
          <div style={{ display: "flex", marginTop: 44, fontFamily: "Fraunces", fontSize: 62, lineHeight: 1.04, letterSpacing: -1.5 }}>
            Ecommerce AI agents, tested on real storefronts.
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 24, lineHeight: 1.4, color: SOFT }}>
            The same customer conversations on live stores, scored for resolution, quality and speed.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto", fontSize: 20, color: QUIET }}>
            <span style={{ display: "flex", color: BLUE, fontSize: 30, fontWeight: 600 }}>{tools.length}</span>
            <span style={{ display: "flex" }}>AI agents tested so far · evals.alhena.ai</span>
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", flex: 1, marginLeft: 36 }}>
          <div style={{ display: "flex", position: "absolute", top: 12, left: 24, width: 420, height: 280, borderRadius: 18, background: "#EEF2F8", border: `1px solid ${RULE}` }} />
          <div style={{ display: "flex", flexDirection: "column", position: "absolute", top: 0, left: 10, width: 420, height: 280, borderRadius: 18, background: "#FFFFFF", border: `1px solid ${RULE}`, padding: 18 }}>
            <div style={{ display: "flex", gap: 7 }}>{[0, 1, 2].map(i => <span key={i} style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: "#DFE5EE" }} />)}</div>
            <div style={{ display: "flex", marginTop: 16, height: 58, borderRadius: 12, background: "#EAF2FF" }} />
            <div style={{ display: "flex", gap: 12, marginTop: 14 }}>{["#F1F4F9", "#FDF1E0", "#F1F4F9"].map((c, i) => <span key={i} style={{ display: "flex", width: 116, height: 90, borderRadius: 10, background: c }} />)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", position: "absolute", top: 112, left: 84, width: 386, borderRadius: 18, background: "#FFFFFF", border: `1px solid ${RULE}`, boxShadow: "0 24px 48px -20px rgba(15,23,42,0.35)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 16px", background: INK, color: "#FFFFFF", fontSize: 17, fontWeight: 600, borderTopLeftRadius: 17, borderTopRightRadius: 17 }}>
              <span style={{ display: "flex", width: 11, height: 11, borderRadius: 6, background: "#4ADE80" }} />Store assistant
            </div>
            <div style={{ display: "flex", alignSelf: "flex-end", margin: "14px 16px 0 60px", padding: "10px 14px", borderRadius: 14, background: BLUE, color: "#FFFFFF", fontSize: 17, lineHeight: 1.35 }}>
              Can I still return a sale item I bought five weeks ago?
            </div>
            <div style={{ display: "flex", margin: "12px 60px 16px 16px", padding: "10px 14px", borderRadius: 14, background: "#F1F4F9", color: INK, fontSize: 17, lineHeight: 1.35 }}>
              That's outside the 30-day window for sale items. I can connect you with the team.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "absolute", left: 0, bottom: 0 }}>
            {checks.map(([label, color]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 999, background: "#FFFFFF", border: `1px solid ${RULE}`, boxShadow: "0 10px 24px -14px rgba(15,23,42,0.4)", fontSize: 17, fontWeight: 600 }}>
                <span style={{ display: "flex", width: 11, height: 11, borderRadius: 2, background: color }} />
                {label}
                <Check color={color === "#86B3FF" ? BLUE : color === "#F0A33A" ? "#B86F0C" : BLUE} />
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Fraunces", data: asset("fonts/fraunces-soft-500.ttf"), weight: 500, style: "normal" },
        { name: "DM Sans", data: asset("fonts/dm-sans.ttf"), weight: 400, style: "normal" },
        { name: "DM Sans", data: asset("fonts/dm-sans-semibold.ttf"), weight: 600, style: "normal" },
      ],
    },
  );
}
