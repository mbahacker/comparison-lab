import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "See which AI agent gets your shoppers the right answer. Alhena Research Lab.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asset = (file: string) => fs.readFileSync(path.join(process.cwd(), "public", file));

/**
 * Social preview. Previews render as small thumbnails, so it carries one large sentence on
 * Alhena blue and a small brand line, nothing that needs zooming to read.
 */
export default function Image() {
  const mark = asset("brand/alhena-mark.svg").toString("utf8").replace(/#0866FF/gi, "#FFFFFF");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "76px 84px 64px", background: "#0866FF", color: "#FFFFFF", fontFamily: "DM Sans" }}>
        <div style={{ display: "flex", fontFamily: "Fraunces", fontSize: 92, lineHeight: 1.02, letterSpacing: -2 }}>
          See which AI agent gets your shoppers the right answer.
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img src={`data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`} alt="" width={36} height={42} />
            <span style={{ display: "flex", fontWeight: 600 }}>Alhena Research Lab</span>
          </div>
          <span style={{ display: "flex", color: "#CFE0FF" }}>evals.alhena.ai</span>
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
