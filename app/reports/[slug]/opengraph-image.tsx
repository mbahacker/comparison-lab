import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getReport } from "@/lib/server/evidence";
import { ApiError } from "@/lib/server/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt =
  "Published comparison: shopping and support quality, sample size, and full evidence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let data: ReturnType<typeof getReport>;
  try {
    data = getReport(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const report = data.report;
  const title = String(report.title).slice(0, 140);
  const date = new Date(report.publishedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "50px 60px",
          color: "#0F172A",
          background:
            "linear-gradient(120deg, #EFF6FF 0%, #FFFFFF 52%, #F3F0FE 100%)",
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
            <span>Comparison Lab</span>
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
            QUALITY PILOT
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 21,
            color: "#64748B",
            marginTop: 44,
          }}
        >
          {date} · Published report
        </div>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 90 ? 43 : title.length > 55 ? 52 : 65,
            lineHeight: 1.1,
            letterSpacing: -2,
            fontWeight: 700,
            marginTop: 16,
            minHeight: 105,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: "#475569",
            marginTop: 8,
          }}
        >
          Shopping and support quality. Inspect every answer.
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 34 }}>
          {[
            [report.storeCount, "storefronts", "#EFF6FF", "#0866FF"],
            [report.turnCount, "live test turns", "#F3F0FE", "#715CD6"],
            [report.criterionCount, "published criteria", "#EAF8FB", "#15778C"],
          ].map(([value, label, background, color]) => (
            <div
              key={String(label)}
              style={{
                display: "flex",
                flexDirection: "column",
                width: 346,
                padding: "17px 24px",
                borderRadius: 18,
                background: String(background),
              }}
            >
              <span
                style={{
                  display: "flex",
                  fontSize: 46,
                  fontWeight: 700,
                  color: String(color),
                }}
              >
                {value}
              </span>
              <span
                style={{
                  display: "flex",
                  fontSize: 20,
                  color: "#475569",
                  marginTop: 4,
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            paddingTop: 20,
            borderTop: "1px solid #D9E2F2",
            fontSize: 18,
            color: "#475569",
          }}
        >
          Commissioned by{" "}
          {String(report.commissionedBy || "Comparison Lab / Alhena").slice(
            0,
            55,
          )}{" "}
          · Selected deployments · Quality scores only
        </div>
      </div>
    ),
    size,
  );
}
