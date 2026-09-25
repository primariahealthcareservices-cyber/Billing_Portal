// frontend/src/components/ThreeDChart.jsx
import React, { useEffect, useRef, useMemo } from "react";

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

export default function ThreeDChart({ data = [], height = 260 }) {
  const containerRef = useRef(null);

  // Normalize incoming data: only keep items with a numeric amount.
  const items = useMemo(() => {
    return (data || [])
      .filter((d) => d && Number.isFinite(Number(d.amount)))
      .map((d) => ({
        category: String(d.category || "—"),
        amount: Number(d.amount),
      }));
  }, [data]);

  // Re-run entrance animation whenever the data changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const bars = container.querySelectorAll(".bar-3d");
    bars.forEach((bar, i) => {
      bar.classList.remove("animate");
      // Force reflow so re-adding the class replays the animation
      void bar.offsetWidth;
      bar.style.animationDelay = `${i * 0.06}s`;
      bar.classList.add("animate");
    });
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="chart-empty" style={{ height }}>
        No data for 3D chart.
      </div>
    );
  }

  // Scale bars to a maximum height.
  const maxAbs = Math.max(...items.map((d) => Math.abs(d.amount)), 1);
  const maxBarHeight = height - 90; // reserve space for label + top face

  return (
    <div
      ref={containerRef}
      className="chart-3d-wrap"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        height,
        padding: "20px 12px 28px",
        perspective: "900px",
        gap: "clamp(8px, 2vw, 22px)",
        overflowX: "auto",
      }}
    >
      {items.map((item, index) => {
        const barHeight =
          maxAbs === 0 ? 10 : Math.max(10, (Math.abs(item.amount) / maxAbs) * maxBarHeight);
        const color = COLORS[index % COLORS.length];
        const label =
          item.category.length > 12
            ? item.category.slice(0, 10) + "…"
            : item.category;

        return (
          <div
            key={`${item.category}-${index}`}
            className="bar-3d"
            style={{
              position: "relative",
              width: 46,
              flex: "0 0 auto",
              transformStyle: "preserve-3d",
              transform: "rotateX(-18deg) rotateY(12deg)",
              transition: "transform 0.25s ease",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform =
                "rotateX(-18deg) rotateY(12deg) scale(1.06)";
              const tip = e.currentTarget.querySelector(".bar-tip");
              if (tip) tip.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform =
                "rotateX(-18deg) rotateY(12deg)";
              const tip = e.currentTarget.querySelector(".bar-tip");
              if (tip) tip.style.opacity = "0";
            }}
          >
            {/* ---------- FRONT FACE ---------- */}
            <div
              className="bar-front"
              style={{
                height: barHeight,
                width: "100%",
                backgroundColor: color,
                borderRadius: "4px 4px 0 0",
                boxShadow: `0 6px 18px ${color}40, inset 0 -8px 12px rgba(0,0,0,0.15)`,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 6,
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.2,
                transition: "height 0.5s ease",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* subtle sheen */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "40%",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0))",
                  pointerEvents: "none",
                }}
              />
              <span style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)", zIndex: 1 }}>
                {formatCurrency(item.amount)}
              </span>
            </div>

            {/* ---------- RIGHT SIDE FACE (depth) ---------- */}
            <div
              className="bar-side"
              style={{
                position: "absolute",
                top: 0,
                right: -10,
                width: 10,
                height: barHeight,
                background: `linear-gradient(180deg, ${color}, ${shade(color, -0.25)})`,
                transform: "skewY(-25deg)",
                transformOrigin: "top left",
                borderTopRightRadius: 4,
                transition: "height 0.5s ease",
              }}
            />

            {/* ---------- TOP FACE ---------- */}
            <div
              className="bar-top"
              style={{
                position: "absolute",
                top: -6,
                left: -10,
                width: "calc(100% + 10px)",
                height: 10,
                background: shade(color, 0.15),
                transform: "skewX(-55deg)",
                transformOrigin: "bottom left",
                borderTopLeftRadius: 4,
                borderTopRightRadius: 2,
              }}
            />

            {/* ---------- HOVER TOOLTIP ---------- */}
            <div
              className="bar-tip"
              style={{
                position: "absolute",
                bottom: barHeight + 18,
                left: "50%",
                transform: "translateX(-50%) translateZ(30px)",
                background: "#111827",
                color: "#fff",
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 6,
                whiteSpace: "nowrap",
                opacity: 0,
                pointerEvents: "none",
                transition: "opacity 0.2s ease",
                boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                zIndex: 10,
              }}
            >
              <div style={{ fontWeight: 600 }}>{item.category}</div>
              <div style={{ opacity: 0.85 }}>{formatCurrency(item.amount)}</div>
            </div>

            {/* ---------- X-AXIS LABEL ---------- */}
            <div
              style={{
                marginTop: 10,
                textAlign: "center",
                fontSize: 11,
                color: "#475569",
                fontWeight: 500,
                maxWidth: 70,
                lineHeight: 1.2,
              }}
            >
              {label}
            </div>
          </div>
        );
      })}

      <style>
        {`
          .bar-3d {
            opacity: 0;
            animation: popIn 0.5s ease forwards;
          }
          .bar-3d.animate {
            animation: popIn 0.5s ease forwards;
          }
          @keyframes popIn {
            0%   { opacity: 0; transform: rotateX(-18deg) rotateY(12deg) scale(0.6); }
            70%  { opacity: 1; transform: rotateX(-18deg) rotateY(12deg) scale(1.05); }
            100% { opacity: 1; transform: rotateX(-18deg) rotateY(12deg) scale(1); }
          }
        `}
      </style>
    </div>
  );
}

/* ---------- color helper ---------- */
function shade(hex, amount) {
  // amount: -1 .. 1 (negative darkens, positive lightens)
  const h = hex.replace("#", "");
  const num = parseInt(
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h,
    16
  );
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;

  const adjust = (v) => {
    if (amount >= 0) return Math.round(v + (255 - v) * amount);
    return Math.round(v * (1 + amount));
  };

  r = Math.min(255, Math.max(0, adjust(r)));
  g = Math.min(255, Math.max(0, adjust(g)));
  b = Math.min(255, Math.max(0, adjust(b)));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}