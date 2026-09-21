import { dimensionLabel, type QualityCriterion } from "@/lib/chart-data";
const colors = ["#0866ff", "#715cd6", "#2193ab", "#d67800", "#405c97"];
export function RubricWeights({ criteria }: { criteria: QualityCriterion[] }) {
  return (
    <div className="rubric-visuals">
      {["shopping", "support"].map((mode) => {
        const rows = criteria.filter((c) => c.mode === mode);
        const dimensions = [...new Set(rows.map((c) => c.dimension))].map(
          (id) => ({
            id,
            points: rows
              .filter((c) => c.dimension === id)
              .reduce((s, c) => s + c.points, 0),
          }),
        );
        const total = dimensions.reduce((s, d) => s + d.points, 0);
        return (
          <section className="rubric-visual" key={mode}>
            <h3>
              {mode === "shopping" ? "Shopping quality" : "Support quality"}
            </h3>
            <p>
              {rows.length} criteria · {total} available points
            </p>
            <div
              className="weight-stack"
              role="img"
              aria-label={dimensions
                .map((d) => `${dimensionLabel(d.id)}: ${d.points} points`)
                .join(", ")}
            >
              {dimensions.map((d, i) => (
                <span
                  key={d.id}
                  title={`${dimensionLabel(d.id)}: ${d.points} points`}
                  style={{
                    width: `${(d.points / total) * 100}%`,
                    background: colors[i % colors.length],
                  }}
                />
              ))}
            </div>
            <ul className="weight-legend">
              {dimensions.map((d, i) => (
                <li key={d.id}>
                  <i style={{ background: colors[i % colors.length] }} />
                  <span>{dimensionLabel(d.id)}</span>
                  <strong>
                    {d.points}
                    <small> pts</small>
                  </strong>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
