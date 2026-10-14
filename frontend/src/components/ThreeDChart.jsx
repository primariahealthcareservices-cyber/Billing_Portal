// frontend/src/components/ThreeDChart.jsx
import React, { useMemo } from "react";

const COLORS = [
  "#2f5dd4", // indigo
  "#16a34a", // green
  "#d97706", // amber
  "#8b5cf6", // violet
  "#dc2626", // red
  "#0ea5e9", // sky
  "#14b8a6", // teal
  "#ec4899", // pink
];

const formatCurrency = (value) => {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
};

/* ---------- geometry helpers ---------- */
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    "M", cx, cy,
    "L", start.x, start.y,
    "A", r, r, 0, largeArc, 0, end.x, end.y,
    "Z",
  ].join(" ");
}

export default function ThreeDChart({
  data = [],
  height = 260,
  title,
  centerLabel = "Total",
}) {
  const items = useMemo(() => {
    return (data || [])
      .filter((d) => d && d.category)
      .map((d, i) => ({
        category: String(d.category),
        amount: Math.abs(Number(d.amount) || 0),
        rawAmount: Number(d.amount) || 0,
        color: d.color || COLORS[i % COLORS.length],
        displayValue: d.displayValue, // optional override (e.g. "42 entries")
      }))
      .filter((d) => d.amount > 0);
  }, [data]);

  const total = useMemo(
    () => items.reduce((s, d) => s + d.amount, 0),
    [items]
  );

  if (items.length === 0 || total === 0) {
    return (
      <div
        className="chart-empty"
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6b7280",
          fontSize: 13,
        }}
      >
        No data for chart.
      </div>
    );
  }

  const cx = 130;
  const cy = 130;
  const r = 108;
  const innerR = 62;

  let cursor = 0;
  const slices = items.map((item) => {
    const angle = (item.amount / total) * 360;
    const startAngle = cursor;
    const endAngle = cursor + angle;
    cursor = endAngle;
    return {
      ...item,
      startAngle,
      endAngle,
      percent: (item.amount / total) * 100,
    };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {title && (
        <p className="section-title" style={{ margin: 0 }}>
          {title}
        </p>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
          flexWrap: "wrap",
          minHeight: height,
        }}
      >
        {/* ---------- PIE / DONUT ---------- */}
        <svg
          width={260}
          height={260}
          viewBox="0 0 260 260"
          style={{ flex: "0 0 auto" }}
        >
          {slices.map((s, idx) => (
            <path
              key={idx}
              d={arcPath(cx, cy, r, s.startAngle, s.endAngle)}
              fill={s.color}
              stroke="#fff"
              strokeWidth={2}
              style={{
                transition: "transform 0.2s ease",
                transformOrigin: `${cx}px ${cy}px`,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.04)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <title>
                {s.category}: {formatCurrency(s.rawAmount)} ({s.percent.toFixed(1)}%)
              </title>
            </path>
          ))}

          {/* inner hole for donut */}
          <circle cx={cx} cy={cy} r={innerR} fill="#fff" />
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fontSize={11}
            fill="#6b7280"
            fontWeight={500}
          >
            {centerLabel}
          </text>
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            fontSize={14}
            fill="#111827"
            fontWeight={700}
          >
            {formatCurrency(total)}
          </text>
        </svg>

        {/* ---------- LEGEND ---------- */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minWidth: 230,
            maxWidth: 340,
          }}
        >
          {slices.map((s, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 8,
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: s.color,
                  flex: "0 0 auto",
                }}
              />
              <span style={{ fontSize: 13, color: "#334155", flex: 1 }}>
                {s.category}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111827",
                  whiteSpace: "nowrap",
                }}
              >
                {s.displayValue || formatCurrency(s.rawAmount)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  minWidth: 48,
                  textAlign: "right",
                }}
              >
                {s.percent.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}