// frontend/src/components/FinanceCharts.jsx
import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const PIE_COLORS = [
  "#2f5dd4", // indigo
  "#16a34a", // green
  "#d97706", // amber
  "#8b5cf6", // violet
  "#dc2626", // red
  "#0ea5e9", // sky
  "#14b8a6", // teal
  "#ec4899", // pink
  "#84cc16", // lime
  "#f97316", // orange
];

const formatCurrency = (value) => {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
};

const RADIAN = Math.PI / 180;

/* -------- Custom label for pie slices -------- */
const renderPieLabel = (props) => {
  const { cx, cy, midAngle, outerRadius, percent, name, value } = props;
  if (!percent || percent < 0.05) return null;

  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);

  const sx = cx + (outerRadius + 6) * cos;
  const sy = cy + (outerRadius + 6) * sin;
  const mx = cx + (outerRadius + 28) * cos;
  const my = cy + (outerRadius + 28) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? "start" : "end";

  const trimmed = name && name.length > 14 ? `${name.slice(0, 12)}…` : name;

  return (
    <g>
      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
        stroke="#9ca3af"
        fill="none"
        strokeWidth={1}
      />
      <circle cx={sx} cy={sy} r={2} fill="#9ca3af" />
      <text
        x={ex + (cos >= 0 ? 6 : -6)}
        y={ey - 6}
        textAnchor={textAnchor}
        fill="#111827"
        fontSize={12}
        fontWeight={600}
      >
        {trimmed}
      </text>
      <text
        x={ex + (cos >= 0 ? 6 : -6)}
        y={ey + 8}
        textAnchor={textAnchor}
        fill="#6b7280"
        fontSize={11}
      >
        {`${(percent * 100).toFixed(1)}% · ${formatCurrency(value)}`}
      </text>
    </g>
  );
};

/* -------- Tooltip -------- */
const PieTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontWeight: 600, color: "#111827", marginBottom: 2 }}>
        {item.category || item.name}
      </div>
      <div style={{ color: "#6b7280" }}>
        Amount:{" "}
        <strong style={{ color: "#111827" }}>
          {formatCurrency(item.amount ?? item.value)}
        </strong>
      </div>
    </div>
  );
};

/* -------- Custom HTML Legend --------
 * Renders as a responsive flex-wrap list underneath the pie.
 * Wraps cleanly, never overflows the card, and always shows every category.
 */
const CustomLegend = ({ data }) => (
  <ul
    style={{
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      alignItems: "center",
      gap: "6px 14px",
      padding: "8px 0 0",
      margin: 0,
      listStyle: "none",
    }}
  >
    {data.map((entry, idx) => {
      const color = PIE_COLORS[idx % PIE_COLORS.length];
      return (
        <li
          key={`${entry.category}-${idx}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "#374151",
            lineHeight: 1.4,
            maxWidth: "100%",
          }}
          title={entry.category}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: color,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 180,
            }}
          >
            {entry.category}
          </span>
        </li>
      );
    })}
  </ul>
);

export default function FinanceCharts({ trend, categoryBreakdown }) {
  const pieData = React.useMemo(() => {
    return (categoryBreakdown || [])
      .filter((c) => c && Number(c.amount) > 0)
      .map((c) => ({
        name: c.category || "Uncategorized",
        category: c.category || "Uncategorized",
        value: Number(c.amount) || 0,
        amount: Number(c.amount) || 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [categoryBreakdown]);

  return (
    <div className="chart-grid">
      {/* ============ TREND ============ */}
      <div className="card chart-card">
        <h3>Income vs Expenses Trend</h3>
        {trend && trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend />
              <Line
                type="monotone"
                dataKey="income"
                stroke="#16a34a"
                strokeWidth={2}
                name="Income"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                stroke="#dc2626"
                strokeWidth={2}
                name="Expenses"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="chart-empty">No data for the selected date range.</div>
        )}
      </div>

      {/* ============ BY CATEGORY ============ */}
      <div className="card chart-card">
        <h3>By Category</h3>
        {pieData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart margin={{ top: 24, right: 60, bottom: 0, left: 60 }}>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  innerRadius={0}
                  paddingAngle={1}
                  labelLine={false}
                  label={renderPieLabel}
                  isAnimationActive={false}
                >
                  {pieData.map((_, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={PIE_COLORS[idx % PIE_COLORS.length]}
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* ✅ Custom legend below the chart — wraps cleanly */}
            <CustomLegend data={pieData} />
          </>
        ) : (
          <div className="chart-empty">No data for the selected date range.</div>
        )}
      </div>
    </div>
  );
}