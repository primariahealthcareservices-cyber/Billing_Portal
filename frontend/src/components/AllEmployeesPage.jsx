// frontend/src/components/AllEmployeesPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, Search, RotateCcw } from "lucide-react";
import api from "../api/axios.js";

const STATUS_LABEL = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  forwarded_to_ceo: "Forwarded to CEO",
  partially_approved: "Partially Approved",
};
const STATUS_COLOR = {
  pending: "#b45309",
  approved: "#16a34a",
  rejected: "#e11d48",
  forwarded_to_ceo: "#2563eb",
  partially_approved: "#7c3aed",
};

const ENTRY_TABS = [
  ["pending", "Pending", "#b45309"],
  ["approved", "Approved", "#16a34a"],
  ["rejected", "Rejected", "#e11d48"],
];

const PAGE_SIZE = 25;
const ENTRIES_CHUNK = 50;

// ── Formatters ──────────────────────────────────────────────────
const fmtMoney = (v) =>
  v === null || v === undefined || v === ""
    ? "—"
    : `₹ ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const sumOf = (arr) => arr.reduce((s, e) => s + (Number(e.total_amount) || 0), 0);

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
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
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

function StatusPill({ status }) {
  const color = STATUS_COLOR[status] || "#64748b";
  return (
    <span
      style={{
        background: `${color}20`,
        color,
        padding: "3px 10px",
        borderRadius: 12,
        fontWeight: 600,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export default function AllEmployeesPage({ onBack }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // ── Applied filters ─────────────────────────────────────────
  const [period, setPeriod] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [activeRequest, setActiveRequest] = useState(null);
  const [actingId, setActingId] = useState(null);
  const [bulkActing, setBulkActing] = useState(false);
  const [remarks, setRemarks] = useState({});
  const [visibleCount, setVisibleCount] = useState(ENTRIES_CHUNK);
  const [entryTab, setEntryTab] = useState("pending");

  // ── Debounce search input ───────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Load a page of payroll requests ─────────────────────────
  const loadPage = useCallback(async (pageNum = 1, append = false, silent = false) => {
    if (!silent) {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
    }
    try {
      const params = { payroll: "1", page: pageNum, per_page: PAGE_SIZE };
      if (fromDate) params.start_date = fromDate;
      if (toDate) params.end_date = toDate;
      if (search) params.search = search;

      const res = await api.get("/copperbook/list", { params });
      const data = res.data;
      setPages(data.pagination?.pages || 1);
      setPage(data.pagination?.page || 1);
      setRequests((prev) => (append ? [...prev, ...(data.requests || [])] : data.requests || []));
    } catch (err) {
      toast.error("Failed to load payroll requests.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [fromDate, toDate, search]);

  useEffect(() => { loadPage(1, false); }, [loadPage]);

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
    setPeriod("all");
    setFromDate("");
    setToDate("");
    setSearchInput("");
    setSearch("");
  };

  // ── Keep the list row in sync with the open request ────────────
  const syncListRow = () => { loadPage(1, false, true); };

  // ── Per-entry approve/reject with optimistic UI ────────────────
  const act = async (entryId, action) => {
    if (!activeRequest) return;
    setActingId(entryId);

    const prevRequest = activeRequest;
    const nextEntries = activeRequest.employee_entries.map((e) =>
      e.id === entryId
        ? { ...e, status: action === "approve" ? "approved" : "rejected",
            remarks: remarks[entryId] || e.remarks || null,
            action_by: "You" }
        : e
    );
    setActiveRequest({ ...activeRequest, employee_entries: nextEntries });

    try {
      await api.post(`/copperbook/employee-entry/${entryId}/action`, {
        action,
        remarks: remarks[entryId] || "",
      });
      toast.success(`Entry ${action === "approve" ? "approved" : "rejected"}.`);
      const fresh = await api.get(`/copperbook/${activeRequest.id}`);
      setActiveRequest(fresh.data);
      syncListRow(fresh.data);
    } catch (err) {
      setActiveRequest(prevRequest);
      toast.error(err.response?.data?.error || "Action failed.");
    } finally {
      setActingId(null);
    }
  };

  // ── Bulk approve all pending in this request ───────────────────
  const approveAll = async () => {
    if (!activeRequest) return;
    setBulkActing(true);

    const prevRequest = activeRequest;
    setActiveRequest({
      ...activeRequest,
      employee_entries: activeRequest.employee_entries.map((e) =>
        e.status === "pending" ? { ...e, status: "approved", action_by: "You" } : e
      ),
    });

    try {
      const res = await api.post(`/copperbook/${activeRequest.id}/approve-all-entries`, {});
      toast.success(res.data.message || "All approved.");
      const fresh = await api.get(`/copperbook/${activeRequest.id}`);
      setActiveRequest(fresh.data);
      syncListRow(fresh.data);
      setEntryTab("approved");
    } catch (err) {
      setActiveRequest(prevRequest);
      toast.error(err.response?.data?.error || "Bulk approve failed.");
    } finally {
      setBulkActing(false);
    }
  };

  const openRequest = (r) => {
    setVisibleCount(ENTRIES_CHUNK);
    setRemarks({});
    setEntryTab("pending");
    setActiveRequest(r);
    api
      .get(`/copperbook/${r.id}`)
      .then((res) => {
        setActiveRequest(res.data);
        const es = res.data.employee_entries || [];
        if (!es.some((e) => e.status === "pending")) {
          setEntryTab(es.some((e) => e.status === "approved") ? "approved" : "rejected");
        }
      })
      .catch(() => {});
  };

  // ── Derived data for the open request ──────────────────────────
  const allEntries = activeRequest?.employee_entries || [];
  const groups = {
    pending: allEntries.filter((e) => e.status === "pending"),
    approved: allEntries.filter((e) => e.status === "approved"),
    rejected: allEntries.filter((e) => e.status === "rejected"),
  };
  const pendingCount = groups.pending.length;
  const entriesTotal = sumOf(allEntries);
  const tabEntries = groups[entryTab] || [];
  const tabLabel = ENTRY_TABS.find(([k]) => k === entryTab)?.[1] || "";

  return (
    <div className="page">
      <main className="page-main" style={{ paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button className="btn btn-secondary" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArrowLeft size={16} /> Back
          </button>
          <h2 style={{ margin: 0 }}>👥 All Employees — Payroll Requests</h2>
        </div>

        {/* ── Filter Panel ─────────────────────────────────────── */}
        <p className="section-title" style={{ marginBottom: 8 }}>Filter Panel</p>
        <div className="card" style={{ marginBottom: 16 }}>
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

        {/* ── Requests table ───────────────────────────────────── */}
        {loading ? (
          <div className="card empty-state">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="card empty-state">No payroll requests yet.</div>
        ) : (
          <>
            <div className="card table-wrap">
              {/* widths: 110 Request | 150 BU | 175 Amount | 150 Cat | auto Purpose | 140 Raised | 150 Status | 120 Created */}
              <table className="data-table" style={{ minWidth: 1200, width: "100%", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 110 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 175 }} />
                  <col style={{ width: 150 }} />
                  <col />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 120 }} />
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
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.row_key || r.id} style={{ cursor: "pointer" }} onClick={() => openRequest(r)}>
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
                      <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.purpose}>
                        {r.purpose}
                      </td>
                      <td>{r.raised_by_name || "—"}</td>
                      <td>
                        <StatusPill status={r.status} />
                        {r.status === "partially_approved" && (
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, whiteSpace: "nowrap" }}>
                            ✓ {r.approved_count ?? 0} · ✕ {r.rejected_count ?? 0}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12.5, color: "#6b7280", whiteSpace: "nowrap" }}>
                        {fmtDate(r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {page < pages && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => loadPage(page + 1, true)}
                  disabled={loadingMore}
                  style={{ minWidth: 200 }}
                >
                  {loadingMore ? <><Loader2 size={14} className="spin" /> Loading…</> : `Load More (page ${page + 1} of ${pages})`}
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Modal ────────────────────────────────────────────── */}
        {activeRequest && (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 1000, padding: 20,
            }}
            onClick={() => setActiveRequest(null)}
          >
            <div
              className="card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 1000, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    {activeRequest.request_number}
                    <StatusPill status={activeRequest.status} />
                  </h3>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
                    {activeRequest.purpose} · from {activeRequest.raised_by_name}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {pendingCount > 0 && (
                    <button
                      className="btn btn-primary"
                      onClick={approveAll}
                      disabled={bulkActing}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      {bulkActing ? <><Loader2 size={14} className="spin" /> Approving…</> : `✅ All Approved (${pendingCount})`}
                    </button>
                  )}
                  <button className="btn btn-secondary" onClick={() => setActiveRequest(null)}>Close</button>
                </div>
              </div>

              {/* Summary strip */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                {[
                  ["Business Unit", activeRequest.business_unit || activeRequest.department || "—"],
                  ["Category", activeRequest.category || "—"],
                  ["Grand Total", fmtMoney(activeRequest.amount ?? (entriesTotal || null))],
                  ["Approved Amount", fmtMoney(sumOf(groups.approved))],
                  ["Rejected Amount", fmtMoney(sumOf(groups.rejected))],
                  ["Created", fmtDate(activeRequest.created_at)],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
                    <div style={{ fontWeight: 700, marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <b>Description:</b> {activeRequest.description}
              </div>

              {/* Tabs: Pending / Approved / Rejected */}
              {allEntries.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  {ENTRY_TABS.map(([key, label, color]) => (
                    <button
                      key={key}
                      onClick={() => { setEntryTab(key); setVisibleCount(ENTRIES_CHUNK); }}
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
              )}

              {allEntries.length > 0 ? (
                tabEntries.length === 0 ? (
                  <div className="empty-state">No {tabLabel.toLowerCase()} entries.</div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Department</th>
                        <th className="text-right">Monthly Salary</th>
                        <th className="text-right">TD/DA</th>
                        <th className="text-right">Total</th>
                        <th>Status</th>
                        <th>Remarks</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabEntries.slice(0, visibleCount).map((e) => (
                        <tr key={e.id} style={{ opacity: actingId === e.id ? 0.6 : 1 }}>
                          <td><b>{e.employee_name}</b></td>
                          <td>{e.employee_department || "—"}</td>
                          <td className="text-right">₹{Number(e.monthly_salary || 0).toLocaleString("en-IN")}</td>
                          <td className="text-right">₹{Number(e.td_da || 0).toLocaleString("en-IN")}</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>
                            ₹{Number(e.total_amount || 0).toLocaleString("en-IN")}
                          </td>
                          <td><StatusPill status={e.status} /></td>
                          <td>
                            <input
                              className="form-control"
                              placeholder="Optional"
                              value={remarks[e.id] ?? e.remarks ?? ""}
                              onChange={(ev) => setRemarks((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                              disabled={e.status !== "pending"}
                              style={{ minWidth: 130 }}
                            />
                          </td>
                          <td>
                            {e.status === "pending" ? (
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  className="btn btn-primary"
                                  disabled={actingId === e.id || bulkActing}
                                  onClick={() => act(e.id, "approve")}
                                >
                                  ✓
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  disabled={actingId === e.id || bulkActing}
                                  onClick={() => act(e.id, "reject")}
                                  style={{ background: "#fee2e2", color: "#b91c1c", borderColor: "#fecaca" }}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: "#64748b", fontSize: 12 }}>{e.action_by || "—"}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f8fafc" }}>
                        <td colSpan={4} className="text-right" style={{ fontWeight: 600 }}>
                          {tabLabel} Total:
                        </td>
                        <td className="text-right" style={{ fontWeight: 700 }}>
                          {fmtMoney(sumOf(tabEntries))}
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tbody>
                  </table>
                )
              ) : (
                <div className="empty-state">
                  General payroll expense — no per-employee entries.
                </div>
              )}

              {tabEntries.length > visibleCount && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setVisibleCount((c) => c + ENTRIES_CHUNK)}
                  style={{ marginTop: 12, alignSelf: "center", minWidth: 200 }}
                >
                  Load {Math.min(ENTRIES_CHUNK, tabEntries.length - visibleCount)} more
                  ({tabEntries.length - visibleCount} remaining)
                </button>
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