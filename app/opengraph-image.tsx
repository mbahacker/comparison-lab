import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { listReports } from "@/lib/server/evidence";
import { getToolLibrary } from "@/lib/server/reuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt =
  "Alhena Research Lab: shopping and support quality, with inspectable evidence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const { tools } = getToolLibrary();
  const comparisonCount = listReports().filter(r => r.vendors.length === 2).length;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "52px 62px",
          color: "#0F172A",
          background:
            "linear-gradient(120deg, #EFF6FF 0%, #FFFFFF 48%, #F3F0FE 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 15,
              fontSize: 27,
            }}
          >
            <img
              src={`data:image/svg+xml;base64,${fs.readFileSync(path.join(process.cwd(), "public/brand/alhena-logo.svg")).toString("base64")}`}
              alt="Alhena"
              width={145}
              height={42}
            />
            <span style={{ color: "#64748B" }}>/</span>
            <span>Research Lab</span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 18px",
              borderRadius: 30,
              background: "#E5E0FA",
              color: "#5941AE",
              fontSize: 19,
            }}
          >
            PUBLISHED RESEARCH
          </div>
        </div>
        <div
          style={{ display: "flex", flexDirection: "column", marginTop: 42 }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 66,
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1.08,
            }}
          >
            Put ecommerce AI
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 66,
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1.08,
              color: "#0866FF",
            }}
          >
            to the test.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              marginTop: 20,
              color: "#475569",
            }}
          >
            Shopping and support quality. Original evidence behind every score.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 22,
            color: "#5941AE",
          }}
        >
          Evaluate one tool. Compare it across the library.
        </div>
        <div style={{ display: "flex", gap: 34, marginTop: 24 }}>
          {[
            [tools.length, "evaluated tools"],
            [comparisonCount, "comparison reports"],
            [26, "published criteria"],
          ].map(([value, label]) => (
            <div
              key={String(label)}
              style={{ display: "flex", alignItems: "baseline", gap: 9 }}
            >
              <span
                style={{
                  display: "flex",
                  color: "#0866FF",
                  fontSize: 35,
                  fontWeight: 700,
                }}
              >
                {value}
              </span>
              <span style={{ display: "flex", fontSize: 20, color: "#475569" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            paddingTop: 18,
            borderTop: "1px solid #D9E2F2",
            fontSize: 18,
            color: "#475569",
          }}
        >
          Alhena-commissioned quality studies · Selected deployments · Original capture dates
        </div>
      </div>
    ),
    size,
  );
}
