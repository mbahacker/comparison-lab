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

export default function Image() {
  const { tools, studies } = getResearchLibrary();
  const latest = studies[0];
  const stats: [number, string][] = [
    [tools.length, tools.length === 1 ? "tool in current results" : "tools in current results"],
    ...(latest ? [[latest.sample.capturedCoreContexts, "conversations in the latest study"] as [number, string]] : []),
    [26, "published quality criteria"],
  ];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "56px 64px",
          color: "#0F172A",
          background: "#FFFFFF",
          fontFamily: "DM Sans",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26 }}>
          <img
            src={`data:image/svg+xml;base64,${asset("brand/alhena-logo.svg").toString("base64")}`}
            alt="Alhena"
            width={145}
            height={42}
          />
          <span style={{ display: "flex", width: 1, height: 30, background: "#DCE3EE" }} />
          <span style={{ color: "#334155" }}>Research Lab</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 52,
            maxWidth: 960,
            fontFamily: "Fraunces",
            fontSize: 76,
            lineHeight: 1.04,
            letterSpacing: -2,
          }}
        >
          Ecommerce AI agents, tested on real storefronts.
        </div>
        <div style={{ display: "flex", marginTop: 26, maxWidth: 900, fontSize: 27, lineHeight: 1.4, color: "#334155" }}>
          The same customer conversations, checked against each store’s policies and timed, with the evidence behind every score.
        </div>
        <div style={{ display: "flex", gap: 44, marginTop: "auto" }}>
          {stats.map(([value, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ display: "flex", color: "#0866FF", fontSize: 38, fontWeight: 600 }}>{value}</span>
              <span style={{ display: "flex", fontSize: 21, color: "#5B6A82" }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 26, height: 8, width: "100%" }}>
          <span style={{ display: "flex", width: "40%", background: "#0866FF" }} />
          <span style={{ display: "flex", width: "35%", background: "#86B3FF", marginLeft: 3 }} />
          <span style={{ display: "flex", width: "25%", background: "#F0A33A", marginLeft: 3 }} />
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
