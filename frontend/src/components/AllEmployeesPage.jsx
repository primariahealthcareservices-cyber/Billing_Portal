// frontend/src/components/AllEmployeesPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, Search, RotateCcw } from "lucide-react";
import api from "../api/axios.js";

const STATUS_LABEL = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
const STATUS_COLOR = { pending: "#b45309", approved: "#16a34a", rejected: "#e11d48" };

const PAGE_SIZE = 25;
const ENTRIES_CHUNK = 50;

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

  // ── Debounce search input ───────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Load a page of payroll requests ─────────────────────────
  const loadPage = useCallback(async (pageNum = 1, append = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
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
      status: "approved",
      employee_entries: activeRequest.employee_entries.map((e) =>
        e.status === "pending" ? { ...e, status: "approved", action_by: "You" } : e
      ),
    });

    try {
      const res = await api.post(`/copperbook/${activeRequest.id}/approve-all-entries`, {});
      toast.success(res.data.message || "All approved.");
      const fresh = await api.get(`/copperbook/${activeRequest.id}`);
      setActiveRequest(fresh.data);
      setRequests((prev) => prev.map((r) =>
        r.id === activeRequest.id ? { ...r, status: "approved" } : r
      ));
    } catch (err) {
      setActiveRequest(prevRequest);
      toast.error(err.response?.data?.error || "Bulk approve failed.");
    } finally {
      setBulkActing(false);
    }
  };

  const pendingCount = activeRequest?.employee_entries?.filter((e) => e.status === "pending").length || 0;

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
                  placeholder="Request #, purpose, department, raiser…"
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
          <div className="card empty-state">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="card empty-state">No payroll requests yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {requests.map((r) => (
              <div
                key={r.id}
                className="card"
                style={{ padding: 16, cursor: "pointer" }}
                onClick={() => {
                  setVisibleCount(ENTRIES_CHUNK);
                  setRemarks({});
                  setActiveRequest(r);
                  api.get(`/copperbook/${r.id}`).then((res) => setActiveRequest(res.data)).catch(() => {});
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{r.request_number}</div>
                    <div style={{ color: "#64748b", fontSize: 13 }}>
                      {r.purpose} · from {r.raised_by_name}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span
                      style={{
                        background: `${STATUS_COLOR[r.status] || "#64748b"}20`,
                        color: STATUS_COLOR[r.status] || "#64748b",
                        padding: "4px 12px", borderRadius: 12, fontWeight: 600, fontSize: 12,
                      }}
                    >
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {page < pages && (
              <button
                className="btn btn-secondary"
                onClick={() => loadPage(page + 1, true)}
                disabled={loadingMore}
                style={{ alignSelf: "center", minWidth: 200 }}
              >
                {loadingMore ? <><Loader2 size={14} className="spin" /> Loading…</> : `Load More (page ${page + 1} of ${pages})`}
              </button>
            )}
          </div>
        )}

        {/* Modal */}
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
                  <h3 style={{ margin: 0 }}>{activeRequest.request_number}</h3>
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

              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <b>Description:</b> {activeRequest.description}
              </div>

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
                  {activeRequest.employee_entries?.slice(0, visibleCount).map((e) => (
                    <tr key={e.id} style={{ opacity: actingId === e.id ? 0.6 : 1 }}>
                      <td><b>{e.employee_name}</b></td>
                      <td>{e.employee_department || "—"}</td>
                      <td className="text-right">₹{e.monthly_salary.toLocaleString("en-IN")}</td>
                      <td className="text-right">₹{e.td_da.toLocaleString("en-IN")}</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>
                        ₹{e.total_amount.toLocaleString("en-IN")}
                      </td>
                      <td>
                        <span
                          style={{
                            background: `${STATUS_COLOR[e.status]}20`,
                            color: STATUS_COLOR[e.status],
                            padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                          }}
                        >
                          {STATUS_LABEL[e.status] || e.status}
                        </span>
                      </td>
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
                </tbody>
              </table>

              {activeRequest.employee_entries?.length > visibleCount && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setVisibleCount((c) => c + ENTRIES_CHUNK)}
                  style={{ marginTop: 12, alignSelf: "center", minWidth: 200 }}
                >
                  Load {Math.min(ENTRIES_CHUNK, activeRequest.employee_entries.length - visibleCount)} more
                  ({activeRequest.employee_entries.length - visibleCount} remaining)
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