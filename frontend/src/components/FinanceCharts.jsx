// frontend/src/components/FinanceCharts.jsx
import React, { useMemo } from "react";
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
  "#2f5dd4", "#16a34a", "#d97706", "#8b5cf6",
  "#dc2626", "#0ea5e9", "#ec4899",
];
const OTHERS_COLOR = "#9ca3af";
const MAX_SLICES = 6;
const MAX_LABEL_CHARS = 28;

// Aggregate the pie data: keep top N, group the rest as "Others"
const buildPieData = (categoryBreakdown) => {
  if (!Array.isArray(categoryBreakdown) || categoryBreakdown.length === 0) return [];

  const cleaned = categoryBreakdown
    .map((c) => ({
      category: c.category || "Uncategorized",
      amount: Number(c.amount) || 0,
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (cleaned.length <= MAX_SLICES) return cleaned;

  const top = cleaned.slice(0, MAX_SLICES);
  const rest = cleaned.slice(MAX_SLICES);
  const othersTotal = rest.reduce((s, c) => s + c.amount, 0);
  if (othersTotal > 0) {
    top.push({ category: `Others (${rest.length})`, amount: othersTotal });
  }
  return top;
};

const formatCurrency = (v) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v || 0);

const truncate = (s, n) =>
  s.length > n ? s.slice(0, n - 1) + "…" : s;

export default function FinanceCharts({ trend, categoryBreakdown }) {
  const pieData = useMemo(() => buildPieData(categoryBreakdown), [categoryBreakdown]);
  const totalPie = useMemo(
    () => pieData.reduce((s, d) => s + d.amount, 0),
    [pieData]
  );

  return (
    <div className="chart-grid">
      <div className="card chart-card">
        <h3>Income vs Expenses Trend</h3>
        {trend && trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={2} name="Income" />
              <Line type="monotone" dataKey="expenses" stroke="#dc2626" strokeWidth={2} name="Expenses" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="chart-empty">No data for the selected date range.</div>
        )}
      </div>

      <div className="card chart-card" style={{ minHeight: 460 }}>
        <h3>By Category</h3>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                           <Pie
                data={pieData}
                dataKey="amount"
                nameKey="category"
                cx="50%"
                cy="40%"
                outerRadius={90}
                innerRadius={45}
                paddingAngle={2}
                labelLine={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                label={({ percent, x, y, textAnchor }) => {
                  if (percent < 0.03) return null; // hide tiny slices
                  return (
                    <text
                      x={x}
                      y={y}
                      textAnchor={textAnchor}
                      dominantBaseline="central"
                      fontSize={12}
                      fontWeight={600}
                      fill="#374151"
                    >
                      {`${(percent * 100).toFixed(0)}%`}
                    </text>
                  );
                }}
              >
                {pieData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={
                      entry.category.startsWith("Others")
                        ? OTHERS_COLOR
                        : PIE_COLORS[idx % PIE_COLORS.length]
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, name) => [formatCurrency(v), name]}
              />
              <Legend
                layout="horizontal"
                align="center"
                verticalAlign="bottom"
                iconType="circle"
                wrapperStyle={{ fontSize: 12, lineHeight: "18px", paddingTop: 12 }}
                formatter={(value, entry) => {
                  const amount = entry?.payload?.amount || 0;
                  const pct = totalPie > 0 ? ((amount / totalPie) * 100).toFixed(1) : "0";
                  return `${truncate(value, MAX_LABEL_CHARS)} — ${formatCurrency(amount)} (${pct}%)`;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="chart-empty">No data for the selected date range.</div>
        )}
      </div>
    </div>
  );
}