// frontend/src/components/CopperBookPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Paperclip, Loader2, Search, RotateCcw } from "lucide-react";
import api from "../api/axios.js";
import AllEmployeesPage from "./AllEmployeesPage.jsx";

const STATUS_LABEL = {
  pending: "Pending",
  forwarded_to_ceo: "Forwarded to CEO",
  approved: "Approved",
  rejected: "Rejected",
  partially_approved: "Partially Approved",
};

const STATUS_COLOR = {
  pending: "#b45309",
  forwarded_to_ceo: "#7c3aed",
  approved: "#16a34a",
  rejected: "#e11d48",
  partially_approved: "#2563eb",
};

const ENTRY_TABS = [
  ["pending", "Pending", "#b45309"],
  ["approved", "Approved", "#16a34a"],
  ["rejected", "Rejected", "#e11d48"],
];

const CHIPS = ["all", "pending", "forwarded_to_ceo", "approved", "rejected"];
const EMPTY_SUMMARY = {
  all: { count: 0, amount: 0 },
  pending: { count: 0, amount: 0 },
  forwarded_to_ceo: { count: 0, amount: 0 },
  approved: { count: 0, amount: 0 },
  rejected: { count: 0, amount: 0 },
};

const PAGE_SIZE = 25;

// ── Date helpers ────────────────────────────────────────────────
const fmtLocalDate = (d) => {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

const getPeriodRange = (period) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let start, end;

  if (period === "week") {
    const day = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diff = day === 0 ? -6 : 1 - day; // Monday-start week
    start = new Date(today);
    start.setDate(today.getDate() + diff);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (period === "month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (period === "quarter") {
    const q = Math.floor(today.getMonth() / 3);
    start = new Date(today.getFullYear(), q * 3, 1);
    end = new Date(today.getFullYear(), q * 3 + 3, 0);
  } else if (period === "year") {
    start = new Date(today.getFullYear(), 0, 1);
    end = new Date(today.getFullYear(), 11, 31);
  } else {
    return { start: "", end: "" };
  }
  return { start: fmtLocalDate(start), end: fmtLocalDate(end) };
};

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const fmtMoney = (v) => {
  const n = Number(v || 0);
  return `₹ ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const sumOf = (arr) => arr.reduce((s, e) => s + (Number(e.total_amount) || 0), 0);

const apiOrigin = (api.defaults.baseURL || "")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");

const attachmentHref = (id) => {
  const token = localStorage.getItem("token");
  const url = `${apiOrigin}/api/copperbook/attachment/${id}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
};

// ── Filter button style ─────────────────────────────────────────
const chipStyle = {
  padding: "8px 16px",
  borderRadius: 20,
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const chipActiveStyle = {
  ...chipStyle,
  background: "#2f5dd4",
  borderColor: "#2f5dd4",
  color: "#ffffff",
  fontWeight: 600,
};

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || "#64748b";
  return (
    <span
      className="badge"
      style={{
        background: `${color}20`,
        color,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 12,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export default function CopperBookPage({ onBack }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [viewTotal, setViewTotal] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // ── Applied filters ─────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState("all");
  const [period, setPeriod] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState(false);
  const [entryTab, setEntryTab] = useState("pending");

  const [showAllEmployees, setShowAllEmployees] = useState(false);

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); }
    catch { return {}; }
  })();
  const role = currentUser?.role || "";
  const isFinance = role === "SuperAdmin" || role === "Corporate";
  const isCEO = role === "SuperAdmin";
  const isSuperAdmin = role === "SuperAdmin" || role === "admin";

  // ── Debounce search input ───────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Paginated load ────────────────────────────────────────────
  const load = useCallback(async (pageNum = 1, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = { page: pageNum, per_page: PAGE_SIZE };
      if (statusFilter !== "all") params.status = statusFilter;
      if (fromDate) params.start_date = fromDate;
      if (toDate) params.end_date = toDate;
      if (search) params.search = search;

      const res = await api.get("/copperbook/list", { params });
      const data = res.data;
      setPages(data.pagination?.pages || 1);
      setPage(data.pagination?.page || 1);
      setTotalRows(data.pagination?.total || 0);
      setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });
      setViewTotal(Number(data.view_total) || 0);
      setRows((prev) => (append ? [...prev, ...(data.requests || [])] : data.requests || []));
    } catch {
      toast.error("Failed to load CopperBook requests.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [statusFilter, fromDate, toDate, search]);

  useEffect(() => { load(1, false); }, [load]);

  useEffect(() => {
    if (!openId) { setDetail(null); setRemarks(""); return; }
    setDetailLoading(true);
    api.get(`/copperbook/${openId}`)
      .then((r) => { setDetail(r.data); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [openId]);

  // ── Filter handlers ─────────────────────────────────────────
  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod === "custom") return;
    const { start, end } = getPeriodRange(newPeriod);
    setFromDate(start);
    setToDate(end);
  };

  const handleFromChange = (v) => {
    setFromDate(v);
    setPeriod("custom");
  };

  const handleToChange = (v) => {
    setToDate(v);
    setPeriod("custom");
  };

  const resetFilters = () => {
    setStatusFilter("all");
    setPeriod("all");
    setFromDate("");
    setToDate("");
    setSearchInput("");
    setSearch("");
  };

  // ── Open a row: land on the entry tab that matches the row's status ──
  const openRow = (r) => {
    setEntryTab(["approved", "rejected"].includes(r.status) ? r.status : "pending");
    setOpenId(r.id);
  };

  // ── Approve / reject / forward ────────────────────────────────
  const doAction = async (endpoint, action) => {
    if (!detail) return;
    if (action === "reject" && !remarks.trim()) {
      toast.error("Rejection reason is required.");
      return;
    }
    const prevStatus = detail.status;
    const optimisticStatus =
      action === "approve" ? "approved"
      : action === "reject" ? "rejected"
      : "forwarded_to_ceo";

    setDetail({ ...detail, status: optimisticStatus });
    setActing(true);

    try {
      await api.post(`/copperbook/${detail.id}/${endpoint}`, { action, remarks: remarks.trim() });
      toast.success(`Marked ${action.replace("_", " ")}.`);
      setOpenId(null);
      setDetail(null);
      setRemarks("");
      load(1, false); // list rows are split per status, so reload instead of patching
    } catch (err) {
      setDetail({ ...detail, status: prevStatus });
      toast.error(err.response?.data?.error || "Action failed.");
    } finally {
      setActing(false);
    }
  };

  // Chip counts come from the server and cover ALL pages, not just loaded rows
  const counts = Object.fromEntries(CHIPS.map((c) => [c, summary[c]?.count || 0]));
  const chipTitle = statusFilter === "all" ? "All" : STATUS_LABEL[statusFilter];

  // ── Modal: per-employee entries grouped by status ─────────────
  const allEntries = detail?.employee_entries || [];
  const groups = {
    pending: allEntries.filter((e) => e.status === "pending"),
    approved: allEntries.filter((e) => e.status === "approved"),
    rejected: allEntries.filter((e) => e.status === "rejected"),
  };
  const tabEntries = groups[entryTab] || [];

  if (showAllEmployees) {
    return <AllEmployeesPage onBack={() => setShowAllEmployees(false)} />;
  }

  return (
    <div className="page">
      <main className="page-main" style={{ paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {onBack && (
            <button className="btn btn-secondary" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <h2 style={{ margin: 0 }}>📘 CopperBook</h2>
          <span style={{ color: "#6b7280", fontSize: 14 }}>
            Cross-portal requests from StaffPortal awaiting approval
          </span>
        </div>

        {/* ── Filter Panel ─────────────────────────────────────── */}
        <p className="section-title" style={{ marginBottom: 8 }}>Filter Panel</p>
        <div className="card" style={{ marginBottom: 16 }}>

          {/* Row 1 — Status chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {CHIPS.map((s) => {
              if (s !== "all" && counts[s] === 0 && statusFilter !== s) return null;
              const label = s === "all" ? `All (${counts.all})` : `${STATUS_LABEL[s]} (${counts[s]})`;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  style={statusFilter === s ? chipActiveStyle : chipStyle}
                >
                  {label}
                </button>
              );
            })}

            {isSuperAdmin && (
              <button
                className="btn btn-primary"
                onClick={() => setShowAllEmployees(true)}
                style={{ marginLeft: "auto" }}
              >
                Salaries
              </button>
            )}
          </div>

          {/* Row 2 — Period + date range + search */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
              <label className="form-label">Period</label>
              <select
                className="form-control"
                value={period}
                onChange={(e) => handlePeriodChange(e.target.value)}
              >
                <option value="all">All Time</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">From</label>
              <input
                type="date"
                className="form-control"
                value={fromDate}
                onChange={(e) => handleFromChange(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">To</label>
              <input
                type="date"
                className="form-control"
                value={toDate}
                onChange={(e) => handleToChange(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
              <label className="form-label">Search</label>
              <div style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
                <input
                  className="form-control"
                  style={{ paddingLeft: 32 }}
                  placeholder="Request #, purpose, department, category, raiser…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>

            <button type="button" className="btn btn-secondary" onClick={resetFilters} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <RotateCcw size={15} /> Reset
            </button>
          </div>
        </div>

        {loading ? (
          <div className="card empty-state">Loading CopperBook requests…</div>
        ) : rows.length === 0 ? (
          <div className="card empty-state">No CopperBook requests match this filter.</div>
        ) : (
          <div className="card table-wrap">
            <table className="data-table" style={{ minWidth: 1200, width: "100%", tableLayout: "fixed" }}>
              {/* widths: 110 Request | 150 BU | 175 Amount | 150 Cat | auto Purpose | 140 Raised | 150 Status | 170 Created | 90 Open */}
              <colgroup>
                <col style={{ width: 110 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 175 }} />
                <col style={{ width: 150 }} />
                <col />
                <col style={{ width: 140 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 90 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Business Unit</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Category</th>
                  <th>Purpose</th>
                  <th>Raised By</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row_key || r.id}>
                    <td style={{ fontWeight: 600 }}>{r.request_number}</td>
                    <td>{r.business_unit || r.department || "—"}</td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: r.amount ? 700 : 400,
                        color: r.amount ? "#065f46" : "#9ca3af",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.amount ? fmtMoney(r.amount) : "—"}
                      {r.is_split && (
                        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>
                          of {fmtMoney(r.request_amount)}
                        </div>
                      )}
                    </td>
                    <td>{r.category || "—"}</td>
                    <td
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={r.purpose}
                    >
                      {r.purpose}
                    </td>
                    <td>{r.raised_by_name || "—"}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ fontSize: 12.5, color: "#6b7280", whiteSpace: "nowrap" }}>
                      {fmtDate(r.created_at)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-secondary" onClick={() => openRow(r)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* ── Totals row (aligned under the Amount column) ── */}
              <tfoot>
                <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                  <td colSpan={2} style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                    Total ({chipTitle})
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontWeight: 800,
                      fontSize: 15,
                      color: "#065f46",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtMoney(viewTotal)}
                  </td>
                  <td colSpan={6} style={{ fontSize: 12.5, color: "#6b7280" }}>
                    {totalRows} {totalRows === 1 ? "row" : "rows"} across all pages
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* ── Total banner with Approved / Rejected / Pending split ── */}
            <div
              style={{
                marginTop: 12,
                padding: "14px 20px",
                borderRadius: 10,
                background: "linear-gradient(90deg, #ecfdf5 0%, #f0fdf4 100%)",
                border: "1px solid #a7f3d0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#047857", letterSpacing: 0.4 }}>
                  TOTAL AMOUNT — {statusFilter === "all" ? "ALL ENTRIES" : chipTitle.toUpperCase()}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  Calculated across all {totalRows} {totalRows === 1 ? "row" : "rows"} matching your filters
                </div>
              </div>

              {statusFilter === "all" && (
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
                  {["approved", "rejected", "pending", "forwarded_to_ceo"].map((s) =>
                    summary[s]?.count > 0 ? (
                      <div key={s}>
                        <div style={{ color: STATUS_COLOR[s], fontWeight: 600, fontSize: 12 }}>
                          {STATUS_LABEL[s]}
                        </div>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          {fmtMoney(summary[s].amount)}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              )}

              <div style={{ fontSize: 24, fontWeight: 800, color: "#065f46", whiteSpace: "nowrap" }}>
                {fmtMoney(viewTotal)}
              </div>
            </div>

            {page < pages && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => load(page + 1, true)}
                  disabled={loadingMore}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  {loadingMore ? (
                    <><Loader2 size={14} className="spin" /> Loading…</>
                  ) : (
                    `Load More (page ${page + 1} of ${pages})`
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Detail modal */}
        {openId && (
          <div
            className="modal-overlay"
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
            }}
            onClick={() => setOpenId(null)}
          >
            <div
              className="modal card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 900, width: "92%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}
            >
              {detailLoading ? (
                <div>Loading…</div>
              ) : !detail ? (
                <div>Could not load this request.</div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                    <div>
                      <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                        {detail.request_number}
                        <StatusBadge status={detail.status} />
                      </h3>
                      <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
                        {detail.department} · submitted by {detail.raised_by_name} on {fmtDate(detail.created_at)}
                      </p>
                    </div>
                    <button className="btn btn-secondary" onClick={() => setOpenId(null)}>Close</button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Business Unit</div>
                      <div style={{ fontWeight: 600 }}>{detail.business_unit || detail.department}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Category</div>
                      <div style={{ fontWeight: 600 }}>{detail.category || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Route</div>
                      <div>
                        {detail.is_payroll
                          ? "Payroll (per-employee)"
                          : (detail.department === "General Expenses"
                              ? "General Expense"
                              : (detail.assignee_names && detail.assignee_names.length
                                  ? detail.assignee_names.join(", ")
                                  : "Whole Department"))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Purpose</div>
                      <div style={{ fontWeight: 600 }}>{detail.purpose}</div>
                    </div>
                  </div>

                  {detail.amount !== null && detail.amount !== undefined && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                        {detail.is_payroll && allEntries.length > 0 ? "Grand Total" : "Amount"}
                      </div>
                      <div
                        style={{
                          background: "#ecfdf5",
                          color: "#065f46",
                          padding: "12px 16px",
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: 20,
                          border: "1px solid #a7f3d0",
                          display: "inline-block",
                          minWidth: 180,
                        }}
                      >
                        {fmtMoney(detail.amount)}
                      </div>
                    </div>
                  )}

                  {/* ── Payroll: amounts + entries split by status ── */}
                  {detail.is_payroll && allEntries.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Employee Entries</div>

                      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                        {ENTRY_TABS.map(([key, label, color]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setEntryTab(key)}
                            style={{
                              padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 600,
                              border: `1px solid ${color}`,
                              background: entryTab === key ? color : "transparent",
                              color: entryTab === key ? "#fff" : color,
                            }}
                          >
                            {label} ({groups[key].length}) · {fmtMoney(sumOf(groups[key]))}
                          </button>
                        ))}
                      </div>

                      {tabEntries.length === 0 ? (
                        <div className="empty-state">No {entryTab} entries.</div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table className="data-table" style={{ width: "100%" }}>
                            <thead>
                              <tr>
                                <th>Employee</th>
                                <th>Department</th>
                                <th style={{ textAlign: "right" }}>Monthly Salary</th>
                                <th style={{ textAlign: "right" }}>TD/DA</th>
                                <th style={{ textAlign: "right" }}>Total</th>
                                <th>Status</th>
                                <th>Remarks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tabEntries.map((e) => (
                                <tr key={e.id}>
                                  <td><b>{e.employee_name}</b></td>
                                  <td>{e.employee_department || "—"}</td>
                                  <td style={{ textAlign: "right" }}>₹{Number(e.monthly_salary || 0).toLocaleString("en-IN")}</td>
                                  <td style={{ textAlign: "right" }}>₹{Number(e.td_da || 0).toLocaleString("en-IN")}</td>
                                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                                    ₹{Number(e.total_amount || 0).toLocaleString("en-IN")}
                                  </td>
                                  <td><StatusBadge status={e.status} /></td>
                                  <td style={{ fontSize: 12.5, color: "#475569" }}>{e.remarks || "—"}</td>
                                </tr>
                              ))}
                              <tr style={{ background: "#f8fafc" }}>
                                <td colSpan={4} style={{ textAlign: "right", fontWeight: 600 }}>
                                  {ENTRY_TABS.find(([k]) => k === entryTab)?.[1]} Total:
                                </td>
                                <td style={{ textAlign: "right", fontWeight: 700 }}>
                                  {fmtMoney(sumOf(tabEntries))}
                                </td>
                                <td colSpan={2}></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Description</div>
                    <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>
                      {detail.description}
                    </div>
                  </div>

                  {detail.remarks && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Remarks (from raiser)</div>
                      <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>
                        {detail.remarks}
                      </div>
                    </div>
                  )}

                  {detail.attachments && detail.attachments.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Attachments</div>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {detail.attachments.map((a) => (
                          <li key={a.id} style={{ marginBottom: 4 }}>
                            <a
                              href={attachmentHref(a.id)}
                              target="_blank"
                              rel="noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#2563eb" }}
                            >
                              <Paperclip size={14} /> {a.filename}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Approval Trail</div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: "#334155" }}>
                      <div>• Submitted by <b>{detail.raised_by_name}</b> — {fmtDate(detail.created_at)}</div>
                      {detail.finance_action_at && (
                        <div>
                          • Finance (<b>{detail.finance_action_by}</b>) — <b>{STATUS_LABEL[detail.status] || detail.status}</b> — {fmtDate(detail.finance_action_at)}
                          {detail.finance_remarks ? `: "${detail.finance_remarks}"` : ""}
                        </div>
                      )}
                      {detail.ceo_action_at && (
                        <div>
                          • CEO (<b>{detail.ceo_action_by}</b>) — <b>{STATUS_LABEL[detail.status] || detail.status}</b> — {fmtDate(detail.ceo_action_at)}
                          {detail.ceo_remarks ? `: "${detail.ceo_remarks}"` : ""}
                        </div>
                      )}
                    </div>
                  </div>

                  {detail.status === "pending" && isFinance && (
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16, marginTop: 16 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Your remarks (required for reject)</div>
                      <textarea
                        className="form-control"
                        rows={3}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Enter remarks / reason…"
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        <button
                          className="btn btn-primary"
                          disabled={acting}
                          onClick={() => doAction("finance-action", "approve")}
                        >
                          {acting ? "…" : "✅ Approve"}
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={acting}
                          onClick={() => doAction("finance-action", "forward_to_ceo")}
                        >
                          ➡️ Forward to CEO
                        </button>
                        <button
                          className="btn btn-danger"
                          disabled={acting || !remarks.trim()}
                          onClick={() => doAction("finance-action", "reject")}
                        >
                          ❌ Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {detail.status === "forwarded_to_ceo" && isCEO && (
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16, marginTop: 16 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>CEO remarks (required for reject)</div>
                      <textarea
                        className="form-control"
                        rows={3}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Enter CEO decision remarks…"
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        <button
                          className="btn btn-primary"
                          disabled={acting}
                          onClick={() => doAction("ceo-action", "approve")}
                        >
                          ✅ CEO Approve
                        </button>
                        <button
                          className="btn btn-danger"
                          disabled={acting || !remarks.trim()}
                          onClick={() => doAction("ceo-action", "reject")}
                        >
                          ❌ CEO Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {detail.status === "forwarded_to_ceo" && !isCEO && (
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, marginTop: 12, color: "#b45309", fontSize: 13 }}>
                      ⏳ Waiting for CEO decision.
                    </div>
                  )}

                  {detail.status !== "pending" && detail.status !== "forwarded_to_ceo" && (
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, marginTop: 12, color: "#6b7280", fontSize: 13 }}>
                      This request has been finalized ({STATUS_LABEL[detail.status] || detail.status}).
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}