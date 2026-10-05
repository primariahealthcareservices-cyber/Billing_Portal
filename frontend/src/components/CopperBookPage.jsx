// frontend/src/components/CopperBookPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Paperclip, Loader2 } from "lucide-react";
import api from "../api/axios.js";
import AllEmployeesPage from "./AllEmployeesPage.jsx";

const STATUS_LABEL = {
  pending: "Pending",
  forwarded_to_ceo: "Forwarded to CEO",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_COLOR = {
  pending: "#b45309",
  forwarded_to_ceo: "#7c3aed",
  approved: "#16a34a",
  rejected: "#e11d48",
};

const PAGE_SIZE = 25;

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

const apiOrigin = (api.defaults.baseURL || "")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");

const attachmentHref = (id) => {
  const token = localStorage.getItem("token");
  const url = `${apiOrigin}/api/copperbook/attachment/${id}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
};

export default function CopperBookPage({ onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState(false);

  const [showAllEmployees, setShowAllEmployees] = useState(false);

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); }
    catch { return {}; }
  })();
  const role = currentUser?.role || "";
  const isFinance = role === "SuperAdmin" || role === "Corporate";
  const isCEO = role === "SuperAdmin";
  const isSuperAdmin = role === "SuperAdmin" || role === "admin";

  // ── Paginated load ────────────────────────────────────────────
  const load = useCallback(async (pageNum = 1, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = { page: pageNum, per_page: PAGE_SIZE };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await api.get("/copperbook/list", { params, scope: "finance" });
      const data = res.data;
      setPages(data.pagination?.pages || 1);
      setPage(data.pagination?.page || 1);
      setRows((prev) => (append ? [...prev, ...(data.requests || [])] : data.requests || []));
    } catch {
      toast.error("Failed to load CopperBook requests.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(1, false); }, [load]);

  useEffect(() => {
    if (!openId) { setDetail(null); setRemarks(""); return; }
    setDetailLoading(true);
    api.get(`/copperbook/${openId}`)
      .then((r) => { setDetail(r.data); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [openId]);

  // ── Optimistic approve / reject / forward ─────────────────────
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
    setRows((prev) =>
      prev.map((r) => (r.id === detail.id ? { ...r, status: optimisticStatus } : r))
    );
    setActing(true);

    try {
      await api.post(`/copperbook/${detail.id}/${endpoint}`, { action, remarks: remarks.trim() });
      toast.success(`Marked ${action.replace("_", " ")}.`);
      setOpenId(null);
      setDetail(null);
      setRemarks("");
      load(1, false);
    } catch (err) {
      setDetail({ ...detail, status: prevStatus });
      setRows((prev) =>
        prev.map((r) => (r.id === detail.id ? { ...r, status: prevStatus } : r))
      );
      toast.error(err.response?.data?.error || "Action failed.");
    } finally {
      setActing(false);
    }
  };

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    forwarded_to_ceo: rows.filter((r) => r.status === "forwarded_to_ceo").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };

  const filtered = rows.filter((r) => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.request_number?.toLowerCase().includes(q) ||
      r.department?.toLowerCase().includes(q) ||
      r.purpose?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.raised_by_name?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

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

        <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {["all", "pending", "forwarded_to_ceo", "approved", "rejected"].map((s) => {
            if (s !== "all" && counts[s] === 0) return null;
            return (
              <button
                key={s}
                className={`btn ${statusFilter === s ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? `All (${counts.all})` : `${STATUS_LABEL[s]} (${counts[s]})`}
              </button>
            );
          })}

          {isSuperAdmin && (
            <button
              className="btn btn-primary"
              onClick={() => setShowAllEmployees(true)}
              style={{ marginLeft: 12 }}
            >
              👥 All Employees
            </button>
          )}

          <input
            className="form-control"
            style={{ marginLeft: "auto", maxWidth: 300 }}
            placeholder="Search request #, purpose, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="card empty-state">Loading CopperBook requests…</div>
        ) : filtered.length === 0 ? (
          <div className="card empty-state">No CopperBook requests match this filter.</div>
        ) : (
          <>
            <div className="card table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Department</th>
                    <th>Raised By</th>
                    <th>Purpose</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Assignees</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.request_number}</td>
                      <td>{r.department}</td>
                      <td>{r.raised_by_name || "—"}</td>
                      <td className="truncate" style={{ maxWidth: 240 }}>{r.purpose}</td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: r.amount ? 700 : 400,
                          color: r.amount ? "#065f46" : "#9ca3af",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.amount ? fmtMoney(r.amount) : "—"}
                      </td>
                      <td>
                        {r.assignee_names && r.assignee_names.length
                          ? r.assignee_names.join(", ")
                          : <span style={{ color: "#9ca3af" }}>
                              {r.is_payroll
                                ? "Payroll"
                                : (r.department === "General Expenses"
                                    ? "General Expense"
                                    : "Whole Dept")}
                            </span>}
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: `${STATUS_COLOR[r.status]}20`,
                            color: STATUS_COLOR[r.status],
                            fontWeight: 600,
                            padding: "3px 10px",
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        >
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5, color: "#6b7280", whiteSpace: "nowrap" }}>
                        {fmtDate(r.created_at)}
                      </td>
                      <td>
                        <button className="btn btn-secondary" onClick={() => setOpenId(r.id)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

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
          </>
        )}

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
              style={{ maxWidth: 780, width: "90%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}
            >
              {detailLoading ? (
                <div>Loading…</div>
              ) : !detail ? (
                <div>Could not load this request.</div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{detail.request_number}</h3>
                      <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
                        {detail.department} · submitted by {detail.raised_by_name} on {fmtDate(detail.created_at)}
                      </p>
                    </div>
                    <button className="btn btn-secondary" onClick={() => setOpenId(null)}>Close</button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Status</div>
                      <div style={{ fontWeight: 600, color: STATUS_COLOR[detail.status] }}>
                        {STATUS_LABEL[detail.status] || detail.status}
                      </div>
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
                    <div style={{ gridColumn: "span 2" }}>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Purpose</div>
                      <div style={{ fontWeight: 600 }}>{detail.purpose}</div>
                    </div>
                  </div>

                  {/* ✅ NEW — Amount block for General Expenses */}
                  {detail.amount !== null && detail.amount !== undefined && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Amount</div>
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
                          • Finance (<b>{detail.finance_action_by}</b>) — <b>{detail.status}</b> — {fmtDate(detail.finance_action_at)}
                          {detail.finance_remarks ? `: "${detail.finance_remarks}"` : ""}
                        </div>
                      )}
                      {detail.ceo_action_at && (
                        <div>
                          • CEO (<b>{detail.ceo_action_by}</b>) — <b>{detail.status}</b> — {fmtDate(detail.ceo_action_at)}
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
                      This request has been finalized ({STATUS_LABEL[detail.status]}).
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