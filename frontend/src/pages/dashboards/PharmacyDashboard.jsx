import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Package,
  TrendingUp,
  Calendar,
  AlertCircle,
  Plus,
  ShoppingCart,
  Truck,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import api from "../../api/axios.js";

// =========================================================
// MAIN DASHBOARD COMPONENT (Content Only)
// =========================================================
export default function PharmacyDashboard() {
  const [stats, setStats] = useState({
    totalItems: 0,
    totalValue: 0,
    expiringSoon: 0,
    lowStock: 0,
  });
  const [expiryData, setExpiryData] = useState([]);
  const [lowStockData, setLowStockData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/pharmacy/dashboard-summary");
      const data = res.data;

      setStats({
        totalItems: data.totalItems || 0,
        totalValue: data.totalValue || 0,
        expiringSoon: data.expiringSoon || 0,
        lowStock: data.lowStock?.length || 0,
      });
      setExpiryData(data.expiry || []);
      setLowStockData(data.lowStock || []);
    } catch (err) {
      toast.error("Failed to load pharmacy dashboard data.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { transition: { staggerChildren: 0.1 } },
  };
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 300 } },
  };

  // Reusable Stat Card Component
  const StatCard = ({ title, value, icon: Icon, color, subtitle }) => (
    <motion.div variants={itemVariants} className="overview-stat-card">
      <div
        className="overview-stat-icon"
        style={{ background: `${color}15`, color: color }}
      >
        <Icon size={24} />
      </div>
      <div className="overview-stat-info">
        <span className="overview-stat-label">{title}</span>
        <span className="overview-stat-value">
          {typeof value === "number" && title.includes("Value")
            ? `₹${value.toFixed(0)}`
            : value}
        </span>
        {subtitle && (
          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
            {subtitle}
          </span>
        )}
      </div>
    </motion.div>
  );

  // Loading State
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "60vh",
        }}
      >
        <div className="spinner" />
      </div>
    );
  }

  // Main Render
  return (
    <div className="pharmacy-dashboard-content">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="overview-header"
      >
        <div className="overview-icon-wrapper">
          <Package size={24} />
        </div>
        <h1 className="overview-title">Overview</h1>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="overview-stats-grid"
      >
        <StatCard
          title="Total Items"
          value={stats.totalItems}
          icon={Package}
          color="#10b981"
        />
        <StatCard
          title="Stock Value"
          value={stats.totalValue}
          icon={TrendingUp}
          color="#6366f1"
        />
        <StatCard
          title="Expiring Soon"
          value={stats.expiringSoon}
          icon={Calendar}
          color="#f59e0b"
          subtitle="within 30 days"
        />
        <StatCard
          title="Low Stock Items"
          value={stats.lowStock}
          icon={AlertCircle}
          color="#ef4444"
        />
      </motion.div>

      {/* Main Grid */}
      <div className="overview-grid">
        {/* Expiry Overview Chart */}
        <div className="overview-card">
          <div className="overview-card-header">
            <Calendar size={18} className="text-muted" />
            <h3>Expiry Overview (Top 10)</h3>
          </div>
          <div className="overview-card-body">
            {expiryData.length === 0 ? (
              <div className="overview-empty">No expiry data</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={expiryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
                  <XAxis dataKey="medicine" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip formatter={(v) => `${v} units`} />
                  <Bar
                    dataKey="quantity"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Low Stock Items List */}
        <div className="overview-card">
          <div className="overview-card-header">
            <AlertCircle size={18} className="text-warning" />
            <h3>Low Stock Items</h3>
          </div>
          <div className="overview-card-body" style={{ display: "block" }}>
            {lowStockData.length === 0 ? (
              <div className="overview-empty">All items are well stocked</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {lowStockData.map((item, i) => (
                  <li
                    key={i}
                    style={{
                      padding: "12px 0",
                      borderBottom: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "13.5px",
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{item.medicine}</span>
                    <span style={{ color: "#ef4444", fontWeight: 600 }}>
                      Stock: {item.stock} / Reorder: {item.reorder}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="overview-card">
        <div className="overview-card-header">
          <Zap size={18} className="text-muted" />
          <h3>Quick Actions</h3>
        </div>
        <div className="overview-card-body">
          <div className="quick-actions-grid">
            <button
              className="quick-action-btn"
              onClick={() =>
                (window.location.href = "/dashboard/pharmacy/sales/new")
              }
            >
              <ShoppingCart size={20} />
              New Sale
            </button>
            <button
              className="quick-action-btn"
              onClick={() =>
                (window.location.href = "/dashboard/pharmacy/purchases/new")
              }
            >
              <Truck size={20} />
              New Purchase
            </button>
            <button
              className="quick-action-btn"
              onClick={() =>
                (window.location.href = "/dashboard/pharmacy/medicines")
              }
            >
              <Plus size={20} />
              Add Medicine
            </button>
          </div>
        </div>
      </div>

      {/* Spinner Styles */}
      <style>{`
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e2e8f0;
          border-top: 4px solid #10b981;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}