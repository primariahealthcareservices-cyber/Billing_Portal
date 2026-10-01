// frontend/src/components/Navbar.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { LogOut, LayoutDashboard, Bell, BookOpen, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import toast from "react-hot-toast";
import api from "../api/axios.js";

const POLL_MS = 30000; // refresh every 30s

export default function Navbar({ title, roleColor = "#2f5dd4", onCopperBook }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoFailed, setLogoFailed] = useState(false);

  // ── Notifications ─────────────────────────────────────────────
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const dropdownRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      setLoadingNotifs(true);
      const res = await api.get("/notifications/my");
      const list = res.data.notifications || [];
      setNotifications(list);
    } catch (err) {
      console.warn("Failed to load notifications:", err?.message);
    } finally {
      setLoadingNotifs(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const t = setInterval(fetchNotifications, POLL_MS);
    return () => clearInterval(t);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markOne = async (n) => {
    if (!n.is_read) {
      try {
        await api.put(`/notifications/${n.id}/read`);
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
        );
      } catch (err) {
        console.warn("Mark read failed", err?.message);
      }
    }
    // If it's a CopperBook notification → open CopperBook page
    if (n.related_type === "copperbook" && onCopperBook) {
      setNotifOpen(false);
      onCopperBook();
    }
  };

  const markAllRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((prev) => prev.map((x) => ({ ...x, is_read: true })));
      toast.success("All notifications marked as read.");
    } catch (err) {
      toast.error("Failed to mark all as read.");
    }
  };

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully.");
    navigate("/");
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="navbar-brand">
          {!logoFailed ? (
            <img
              src="/primaria.png"
              alt="Company Logo"
              onError={() => setLogoFailed(true)}
              style={{ height: 36, width: "auto", maxWidth: 140, objectFit: "contain", flexShrink: 0 }}
            />
          ) : (
            <div className="navbar-icon" style={{ background: roleColor }}>
              <LayoutDashboard size={18} />
            </div>
          )}
          <div className="navbar-titles">
            <p className="navbar-title">{title}</p>
            <p className="navbar-subtitle">Finance Hub</p>
          </div>
        </div>

        <div className="navbar-user" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* ── CopperBook button ── */}
          {onCopperBook && (
            <button
              onClick={onCopperBook}
              title="Open CopperBook"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                background: "rgba(37, 99, 235, 0.1)",
                color: "#2563eb",
                border: "1px solid rgba(37, 99, 235, 0.25)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              <BookOpen size={16} />
              CopperBook
            </button>
          )}

          {/* ── Notifications bell ── */}
          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button
              onClick={() => setNotifOpen((o) => !o)}
              title="Notifications"
              style={{
                position: "relative",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 8,
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#334155",
              }}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    background: "#e11d48",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 999,
                    padding: "1px 6px",
                    minWidth: 16,
                    textAlign: "center",
                    lineHeight: "14px",
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: 380,
                  maxHeight: 480,
                  overflowY: "auto",
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.15)",
                  zIndex: 2000,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    borderBottom: "1px solid #e2e8f0",
                    position: "sticky",
                    top: 0,
                    background: "#fff",
                  }}
                >
                  <strong style={{ fontSize: 14 }}>Notifications</strong>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        cursor: "pointer",
                        fontSize: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Check size={12} /> Mark all read
                    </button>
                  )}
                </div>

                {loadingNotifs && notifications.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                    Loading…
                  </div>
                ) : notifications.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => markOne(n)}
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid #f1f5f9",
                        cursor: "pointer",
                        background: n.is_read ? "#fff" : "#eff6ff",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          color: "#0f172a",
                          fontWeight: n.is_read ? 400 : 600,
                          marginBottom: 2,
                        }}
                      >
                        {n.message}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── User info + avatar + logout ── */}
          <div className="navbar-user-info">
            <p className="navbar-user-name">{user?.name}</p>
            <p className="navbar-user-meta">
              {user?.role} · {user?.email}
            </p>
          </div>
          <div className="navbar-avatar">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}