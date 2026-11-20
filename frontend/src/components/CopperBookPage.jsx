// frontend/src/components/CopperBookPage.jsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Paperclip, Loader2, Search, RotateCcw, Trash2, Edit, ArrowUp, ArrowDown, X } from "lucide-react";
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
  capital_equity: { count: 0, amount: 0 },
  expenses: { amount: 0 },
};
const EMPTY_EQUITY = {
  capital_equity: 0,
  opening_balance: 0,
  approved: 0,
  rejected: 0,
  balance: 0,
};
const EMPTY_PERSONAL_TOTALS = { total_given: 0, total_paid: 0, balance: 0, employees: 0 };

const PAGE_SIZE = 25;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const fmtDateOnly = (d) => {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

const fmtMonthLabel = (m) => {
  if (!m) return "—";
  const match = /^(\d{4})-(\d{2})$/.exec(String(m));
  if (!match) return m;
  const dt = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  if (isNaN(dt)) return m;
  return dt.toLocaleDateString(undefined, { month: "short", year: "numeric" });
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

const chipStyle = {
  padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 500,
  border: "1px solid #d1d5db", background: "#ffffff", cursor: "pointer", transition: "all 0.15s ease",
};

const chipActiveStyle = {
  ...chipStyle, background: "#2f5dd4", borderColor: "#2f5dd4", color: "#ffffff", fontWeight: 600,
};

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || "#64748b";
  return (
    <span className="badge" style={{ background: `${color}20`, color, fontWeight: 600, padding: "3px 10px", borderRadius: 12, fontSize: 12, whiteSpace: "nowrap" }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Personal Amount page                                               */
/*  Employee | Department | Total Given (₹) | Total Paid (₹) |        */
/*  Balance (₹) | Last Date                                            */
/* ------------------------------------------------------------------ */

// Merge any number of department lists into one sorted, de-duplicated list.
// The list only ever grows, so picking a department never hides the others.
const mergeDepartments = (...lists) => {
  const set = new Set();
  lists.forEach((list) =>
    (list || []).forEach((d) => {
      const name = typeof d === "string" ? d : d?.name;
      if (name && String(name).trim()) set.add(String(name).trim());
    })
  );
  return [...set].sort((a, b) => a.localeCompare(b));
};

const initialsOf = (name) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";

const AVATAR_COLORS = ["#2f5dd4", "#7c3aed", "#0d9488", "#b45309", "#be185d", "#4338ca", "#0369a1"];
const avatarColor = (name) => {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

// positive balance = employee still owes (amber), negative = overpaid (red), zero = settled (green)
const balColor = (v) => (Number(v) > 0 ? "#b45309" : Number(v) < 0 ? "#e11d48" : "#16a34a");
const balText = (v) => (Number(v) > 0 ? "Due" : Number(v) < 0 ? "Overpaid" : "Settled");

const PERSONAL_COLUMNS = [
  { key: "employee_name", label: "Employee", align: "left" },
  { key: "department", label: "Department", align: "left" },
  { key: "total_given", label: "Total Given (₹)", align: "right" },
  { key: "total_paid", label: "Total Paid (₹)", align: "right" },
  { key: "balance", label: "Balance (₹)", align: "right" },
  { key: "last_date", label: "Last Date", align: "left" },
];

function StatCard({ label, value, color, hint }) {
  return (
    <div
      style={{
        flex: "1 1 200px", background: "#fff", border: "1px solid #e5e7eb",
        borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4, whiteSpace: "nowrap" }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function PersonalAmountPage({ onBack, allDepartments = [] }) {
  const [employees, setEmployees] = useState([]);
  const [totals, setTotals] = useState(EMPTY_PERSONAL_TOTALS);
  const [departments, setDepartments] = useState(() => mergeDepartments(allDepartments));
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [period, setPeriod] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState({ key: "employee_name", dir: "asc" });

  const [openEmp, setOpenEmp] = useState(null);
  const [txns, setTxns] = useState([]);
  const [txnLoading, setTxnLoading] = useState(false);

  const reqSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Departments passed from the parent page (Business Units) → always available in the dropdown.
  useEffect(() => {
    setDepartments((prev) => mergeDepartments(prev, allDepartments));
  }, [allDepartments]);

  // One unfiltered request so the dropdown lists EVERY department,
  // not only the one that is currently selected / has data in the filtered view.
  useEffect(() => {
    let cancelled = false;
    api.get("/copperbook/personal-summary")
      .then((res) => {
        if (cancelled) return;
        const d = res.data || {};
        setDepartments((prev) =>
          mergeDepartments(prev, d.departments, (d.employees || []).map((e) => e.department))
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    const mySeq = ++reqSeq.current;
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (dept) params.department = dept;
      let s = ISO_DATE.test(fromDate) ? fromDate : "";
      let e = ISO_DATE.test(toDate) ? toDate : "";
      if (s && e && s > e) [s, e] = [e, s];
      if (s) params.start_date = s;
      if (e) params.end_date = e;

      const res = await api.get("/copperbook/personal-summary", { params });
      if (mySeq !== reqSeq.current) return;
      const list = res.data.employees || [];
      setEmployees(list);
      setTotals(res.data.totals || EMPTY_PERSONAL_TOTALS);
      // never shrink the department list when a filter is applied
      setDepartments((prev) =>
        mergeDepartments(prev, res.data.departments, list.map((x) => x.department))
      );
    } catch {
      if (mySeq === reqSeq.current) toast.error("Failed to load Personal Amount.");
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }, [search, dept, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const handlePeriodChange = (p) => {
    setPeriod(p);
    if (p === "custom") return;
    const { start, end } = getPeriodRange(p);
    setFromDate(start);
    setToDate(end);
  };

  const reset = () => {
    setSearchInput(""); setSearch(""); setDept("");
    setPeriod("all"); setFromDate(""); setToDate("");
  };

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const sortedEmployees = useMemo(() => {
    const numeric = ["total_given", "total_paid", "balance"];
    const arr = [...employees];
    arr.sort((a, b) => {
      let av = a[sort.key];
      let bv = b[sort.key];
      if (numeric.includes(sort.key)) {
        av = Number(av) || 0;
        bv = Number(bv) || 0;
      } else {
        av = String(av ?? "").toLowerCase();
        bv = String(bv ?? "").toLowerCase();
      }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [employees, sort]);

  const openHistory = async (emp) => {
    setOpenEmp(emp);
    setTxns([]);
    setTxnLoading(true);
    try {
      const params = emp.employee_id
        ? { employee_id: emp.employee_id }
        : { employee_name: emp.employee_name };
      const res = await api.get("/copperbook/personal-transactions", { params });
      setTxns(res.data.transactions || []);
    } catch {
      toast.error("Failed to load transactions.");
    } finally {
      setTxnLoading(false);
    }
  };

  const hasFilters = search || dept || fromDate || toDate;
  const periodLabel = fromDate || toDate
    ? `${fromDate ? fmtDateOnly(fromDate) : "Beginning"} → ${toDate ? fmtDateOnly(toDate) : "Today"}`
    : "All time";

  const inputLabel = { fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 4, display: "block" };
  const inputBold = { fontWeight: 700, color: "#0f172a" };

  return (
    <div className="page">
      <main className="page-main" style={{ paddingTop: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {onBack && (
            <button className="btn btn-primary" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <div>
            <h2 style={{ margin: 0 }}>💰 Personal Amount</h2>
            <div style={{ color: "#6b7280", fontSize: 13.5, marginTop: 2 }}>
              Amount given to and paid back by each employee
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, opacity: loading ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
          <StatCard label="Total Given" value={fmtMoney(totals.total_given)} color="#b45309" hint={`${periodLabel}`} />
          <StatCard label="Total Paid" value={fmtMoney(totals.total_paid)} color="#16a34a" hint={dept || "All departments"} />
          <StatCard label="Balance" value={fmtMoney(totals.balance)} color={balColor(totals.balance)} hint="Given − Paid" />
          <StatCard label="Employees" value={String(totals.employees ?? employees.length)} color="#2f5dd4" hint="With transactions" />
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: 150 }}>
              <label style={inputLabel}>Period</label>
              <select className="form-control" style={inputBold} value={period} onChange={(e) => handlePeriodChange(e.target.value)}>
                <option value="all">All Time</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            <div style={{ minWidth: 200 }}>
              <label style={inputLabel}>Department ({departments.length})</label>
              <select className="form-control" style={inputBold} value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">All Departments</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={inputLabel}>From</label>
              <input type="date" className="form-control" style={inputBold} value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPeriod("custom"); }} />
            </div>
            <div>
              <label style={inputLabel}>To</label>
              <input type="date" className="form-control" style={inputBold} value={toDate} onChange={(e) => { setToDate(e.target.value); setPeriod("custom"); }} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={inputLabel}>Search</label>
              <div style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
                <input className="form-control" style={{ paddingLeft: 32, fontWeight: 700 }} placeholder="Employee name…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={reset} disabled={!hasFilters && period === "all"} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <RotateCcw size={15} /> Reset
            </button>
          </div>
        </div>

        {/* Table */}
        {loading && employees.length === 0 ? (
          <div className="card empty-state">Loading Personal Amount…</div>
        ) : employees.length === 0 ? (
          <div className="card empty-state">
            {hasFilters ? "No employees match these filters. Try resetting them." : "No personal amount transactions yet."}
          </div>
        ) : (
          <div className="card table-wrap" style={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.15s ease", padding: 0, overflow: "hidden" }}>
            <div style={{ maxHeight: "62vh", overflow: "auto" }}>
              <table className="data-table" style={{ minWidth: 900, width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    {PERSONAL_COLUMNS.map((c) => {
                      const active = sort.key === c.key;
                      return (
                        <th
                          key={c.key}
                          onClick={() => toggleSort(c.key)}
                          style={{
                            textAlign: c.align, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                            position: "sticky", top: 0, zIndex: 2, background: "#f8fafc",
                            borderBottom: "1px solid #e2e8f0", padding: "12px 16px",
                            fontWeight: 800, fontSize: 13.5,
                            color: active ? "#2f5dd4" : "#0f172a",
                          }}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {c.label}
                            {active && (sort.dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
                          </span>
                        </th>
                      );
                    })}
                    <th style={{ position: "sticky", top: 0, zIndex: 2, background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEmployees.map((e) => {
                    const bc = balColor(e.balance);
                    return (
                      <tr
                        key={e.employee_id ? `id-${e.employee_id}` : `n-${e.employee_name}`}
                        onClick={() => openHistory(e)}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={(ev) => (ev.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={(ev) => (ev.currentTarget.style.background = "")}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span
                              style={{
                                width: 32, height: 32, borderRadius: "50%", background: avatarColor(e.employee_name),
                                color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex",
                                alignItems: "center", justifyContent: "center", flexShrink: 0,
                              }}
                            >
                              {initialsOf(e.employee_name)}
                            </span>
                            <span style={{ fontWeight: 600 }}>{e.employee_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>{e.department || "—"}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap", padding: "12px 16px" }}>{fmtMoney(e.total_given)}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap", padding: "12px 16px" }}>{fmtMoney(e.total_paid)}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap", padding: "12px 16px" }}>
                          <div style={{ fontWeight: 700, color: bc }}>{fmtMoney(e.balance)}</div>
                          <span style={{ display: "inline-block", marginTop: 2, fontSize: 11, fontWeight: 600, color: bc, background: `${bc}1a`, padding: "1px 8px", borderRadius: 10 }}>
                            {balText(e.balance)}
                          </span>
                        </td>
                        <td style={{ whiteSpace: "nowrap", padding: "12px 16px", color: "#475569" }}>{fmtDateOnly(e.last_date)}</td>
                        <td style={{ textAlign: "center", padding: "12px 16px" }}>
                          <button
                            className="btn btn-secondary"
                            onClick={(ev) => { ev.stopPropagation(); openHistory(e); }}
                          >
                            History
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f8fafc" }}>
                    <td colSpan={2} style={{ fontWeight: 700, padding: "14px 16px", borderTop: "2px solid #e2e8f0", position: "sticky", bottom: 0, background: "#f8fafc" }}>
                      Total ({totals.employees} employees)
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 800, whiteSpace: "nowrap", padding: "14px 16px", borderTop: "2px solid #e2e8f0", position: "sticky", bottom: 0, background: "#f8fafc" }}>{fmtMoney(totals.total_given)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800, whiteSpace: "nowrap", padding: "14px 16px", borderTop: "2px solid #e2e8f0", position: "sticky", bottom: 0, background: "#f8fafc" }}>{fmtMoney(totals.total_paid)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800, whiteSpace: "nowrap", padding: "14px 16px", color: balColor(totals.balance), borderTop: "2px solid #e2e8f0", position: "sticky", bottom: 0, background: "#f8fafc" }}>{fmtMoney(totals.balance)}</td>
                    <td colSpan={2} style={{ borderTop: "2px solid #e2e8f0", position: "sticky", bottom: 0, background: "#f8fafc" }}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* History modal */}
        {openEmp && (
          <div
            className="modal-overlay"
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
            onClick={() => setOpenEmp(null)}
          >
            <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820, width: "92%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      width: 44, height: 44, borderRadius: "50%", background: avatarColor(openEmp.employee_name),
                      color: "#fff", fontSize: 15, fontWeight: 700, display: "inline-flex",
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {initialsOf(openEmp.employee_name)}
                  </span>
                  <div>
                    <h3 style={{ margin: 0 }}>{openEmp.employee_name}</h3>
                    <div style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 13 }}>{openEmp.department || "—"}</div>
                  </div>
                </div>
                <button className="btn btn-secondary" onClick={() => setOpenEmp(null)} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <X size={14} /> Close
                </button>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <StatCard label="Total Given" value={fmtMoney(openEmp.total_given)} color="#b45309" />
                <StatCard label="Total Paid" value={fmtMoney(openEmp.total_paid)} color="#16a34a" />
                <StatCard label="Balance" value={fmtMoney(openEmp.balance)} color={balColor(openEmp.balance)} hint={balText(openEmp.balance)} />
              </div>

              {txnLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b" }}>
                  <Loader2 size={16} className="spin" /> Loading transactions…
                </div>
              ) : txns.length === 0 ? (
                <div className="empty-state">No transactions for this employee.</div>
              ) : (
                <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  <table className="data-table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        {[["Date", "left"], ["Type", "left"], ["Amount", "right"], ["Note", "left"]].map(([label, align]) => (
                          <th
                            key={label}
                            style={{
                              textAlign: align, fontWeight: 800, fontSize: 13.5, color: "#1e3a8a",
                              background: "#eef2ff", borderBottom: "2px solid #c7d2fe", padding: "10px 14px",
                            }}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map((t) => {
                        const given = t.txn_type !== "paid";
                        const c = given ? "#b45309" : "#16a34a";
                        return (
                          <tr key={t.id}>
                            <td style={{ whiteSpace: "nowrap" }}>{fmtDateOnly(t.txn_date)}</td>
                            <td>
                              <span className="badge" style={{ background: `${c}20`, color: c, fontWeight: 600, padding: "3px 10px", borderRadius: 12, fontSize: 12 }}>
                                {given ? "Given" : "Paid"}
                              </span>
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", color: c }}>
                              {given ? "+" : "−"} {fmtMoney(t.amount)}
                            </td>
                            <td style={{ fontSize: 12.5, color: "#475569" }}>{t.note || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CopperBookPage({ onBack }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [equity, setEquity] = useState(EMPTY_EQUITY);
  const [monthlyRollback, setMonthlyRollback] = useState([]);
  const [allTimeEquity, setAllTimeEquity] = useState(EMPTY_EQUITY);
  const [viewTotal, setViewTotal] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // Main Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [department, setDepartment] = useState("");
  const [departments, setDepartments] = useState([]);
  const [period, setPeriod] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // --- Panel 1 Specific Filters ---
  const [panelDept, setPanelDept] = useState("");
  const [panelPeriod, setPanelPeriod] = useState("all");
  const [panelFromDate, setPanelFromDate] = useState("");
  const [panelToDate, setPanelToDate] = useState("");

  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState(false);
  const [entryTab, setEntryTab] = useState("pending");

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const [showAllEmployees, setShowAllEmployees] = useState(false);
  const [showPersonal, setShowPersonal] = useState(false);
  const [rollYear, setRollYear] = useState("all");
  const [rollHideEmpty, setRollHideEmpty] = useState(true);
  const [rollNewestFirst, setRollNewestFirst] = useState(true);

  const reqSeq = useRef(0);

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); }
    catch { return {}; }
  })();
  const role = currentUser?.role || "";
  const isFinance = role === "SuperAdmin" || role === "admin" || role === "Corporate";
  const isCEO = role === "SuperAdmin" || role === "admin";
  const isSuperAdmin = role === "SuperAdmin" || role === "admin";
  const canManage = role === "SuperAdmin" || role === "admin" || role === "Corporate";

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async (pageNum = 1, append = false) => {
    const mySeq = ++reqSeq.current;
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = { page: pageNum, per_page: PAGE_SIZE, equity_department: panelDept };
      if (statusFilter !== "all") params.status = statusFilter;

      let s = ISO_DATE.test(fromDate) ? fromDate : "";
      let e = ISO_DATE.test(toDate) ? toDate : "";
      if (s && e && s > e) [s, e] = [e, s];
      if (s) params.start_date = s;
      if (e) params.end_date = e;

      let ps = ISO_DATE.test(panelFromDate) ? panelFromDate : "";
      let pe = ISO_DATE.test(panelToDate) ? panelToDate : "";
      if (ps && pe && ps > pe) [ps, pe] = [pe, ps];
      if (ps) params.equity_start_date = ps;
      if (pe) params.equity_end_date = pe;

      if (search) params.search = search;
      if (department) params.department = department;

      const res = await api.get("/copperbook/list", { params });
      if (mySeq !== reqSeq.current) return;

      const data = res.data;
      setPages(data.pagination?.pages || 1);
      setPage(data.pagination?.page || 1);
      setTotalRows(data.pagination?.total || 0);
      setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });
      setEquity({ ...EMPTY_EQUITY, ...(data.equity || {}) });
      setMonthlyRollback(Array.isArray(data.monthly_rollback) ? data.monthly_rollback : []);
      setAllTimeEquity({ ...EMPTY_EQUITY, ...(data.all_time_equity || {}) });
      // keep the department list sticky so it never shrinks when a filter is applied
      setDepartments((prev) => mergeDepartments(prev, data.departments));
      setViewTotal(Number(data.view_total) || 0);
      setRows((prev) => (append ? [...prev, ...(data.requests || [])] : data.requests || []));
    } catch {
      if (mySeq === reqSeq.current) toast.error("Failed to load CopperBook requests.");
    } finally {
      if (mySeq === reqSeq.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [statusFilter, department, fromDate, toDate, search, panelDept, panelFromDate, panelToDate]);

  useEffect(() => { load(1, false); }, [load]);

  useEffect(() => {
    if (!openId) { setDetail(null); setRemarks(""); setEditing(false); return; }
    setDetailLoading(true);
    api.get(`/copperbook/${openId}`)
      .then((r) => { setDetail(r.data); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [openId]);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod === "custom") return;
    const { start, end } = getPeriodRange(newPeriod);
    setFromDate(start);
    setToDate(end);
  };

  const handlePanelPeriodChange = (newPeriod) => {
    setPanelPeriod(newPeriod);
    if (newPeriod === "custom") return;
    const { start, end } = getPeriodRange(newPeriod);
    setPanelFromDate(start);
    setPanelToDate(end);
  };

  const resetFilters = () => {
    setStatusFilter("all");
    setDepartment("");
    setPeriod("all");
    setFromDate("");
    setToDate("");
    setSearchInput("");
    setSearch("");

    setPanelDept("");
    setPanelPeriod("all");
    setPanelFromDate("");
    setPanelToDate("");
  };

  const openRow = (r) => {
    setEntryTab(["approved", "rejected"].includes(r.status) ? r.status : "pending");
    setOpenId(r.id);
  };

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
      toast.success(
        prevStatus === "rejected" && action === "approve"
          ? "Rejection reversed — request approved."
          : `Marked ${action.replace("_", " ")}.`
      );
      setOpenId(null);
      setDetail(null);
      setRemarks("");
      load(1, false);
    } catch (err) {
      setDetail({ ...detail, status: prevStatus });
      toast.error(err.response?.data?.error || "Action failed.");
    } finally {
      setActing(false);
    }
  };

  const reapproveEntry = async (entryId) => {
    if (!detail) return;
    const note = window.prompt("Remarks for re-approval (optional):", "");
    if (note === null) return; // cancelled
    setActing(true);
    try {
      await api.post(`/copperbook/employee-entry/${entryId}/action`, {
        action: "approve",
        remarks: note.trim(),
      });
      toast.success("Entry re-approved.");
      const r = await api.get(`/copperbook/${detail.id}`);
      setDetail(r.data);
      load(1, false);
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not re-approve entry.");
    } finally {
      setActing(false);
    }
  };

  const startEdit = () => {
    setEditForm({
      department: detail.department || "",
      purpose: detail.purpose || "",
      description: detail.description || "",
      remarks: detail.remarks || "",
      category: detail.category || "",
      amount: detail.amount ?? "",
      reference_date: detail.reference_date || "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setActing(true);
    try {
      const res = await api.put(`/copperbook/${detail.id}`, editForm);
      if (res.data.staffportal_synced === false) {
        toast("Saved in Billing Portal, but the Staff Portal could not be updated.", { icon: "⚠️" });
      } else {
        toast.success("Request updated in Billing Portal & Staff Portal");
      }
      setDetail(res.data.request);
      setEditing(false);
      load(1, false);
    } catch (err) {
      toast.error(err.response?.data?.error || "Update failed");
    } finally {
      setActing(false);
    }
  };

  const deleteReq = async (id, closeModal = false) => {
    if (!window.confirm("Are you sure you want to delete this request? This cannot be undone.")) return;
    setActing(true);
    try {
      await api.delete(`/copperbook/${id}`);
      toast.success("Request deleted");
      if (closeModal) setOpenId(null);
      load(1, false);
    } catch (err) {
      toast.error(err.response?.data?.error || "Delete failed");
    } finally {
      setActing(false);
    }
  };

  const counts = Object.fromEntries(CHIPS.map((c) => [c, summary[c]?.count || 0]));
  const chipTitle = statusFilter === "all" ? "All" : STATUS_LABEL[statusFilter];

  // Approved, non-Capital-Equity amount for the current filters.
  // Calculated on the backend with the same logic as the Monthly Rollback.
  const totalExpenses = Number(summary.expenses?.amount || 0);

  const allEntries = detail?.employee_entries || [];
  const groups = {
    pending: allEntries.filter((e) => e.status === "pending"),
    approved: allEntries.filter((e) => e.status === "approved"),
    rejected: allEntries.filter((e) => e.status === "rejected"),
  };
  const tabEntries = groups[entryTab] || [];
  const canReapproveEntries = isCEO && entryTab === "rejected";

  if (showAllEmployees) {
    return <AllEmployeesPage onBack={() => setShowAllEmployees(false)} />;
  }
  if (showPersonal) {
    return <PersonalAmountPage onBack={() => setShowPersonal(false)} allDepartments={departments} />;
  }
  const rollYears = [...new Set(monthlyRollback.map((r) => String(r.month).slice(0, 4)))]
    .sort()
    .reverse();

  const rollRows = monthlyRollback
    .filter((r) => rollYear === "all" || String(r.month).startsWith(rollYear))
    .filter((r) =>
      !rollHideEmpty ||
      Number(r.equity_added ?? r.capital_equity ?? 0) !== 0 ||
      Number(r.approved ?? 0) !== 0 ||
      Number(r.discrepancy ?? 0) !== 0
    );
  if (rollNewestFirst) rollRows.reverse();

  const activeDept = panelDept || department || "All Departments";
  const activePeriodText = panelFromDate || panelToDate
    ? `${panelFromDate ? fmtDateOnly(panelFromDate) : "Beginning"} → ${panelToDate ? fmtDateOnly(panelToDate) : "Today"}`
    : "All Time";

  const equityBoxes = [
    { label: "Approved", value: equity.approved, color: "#16a34a", sub: activeDept },
    { label: "Rejected", value: equity.rejected, color: "#e11d48", sub: activeDept },
  ];

  const allTimeBoxes = [
    { label: "Capital Equity", value: allTimeEquity.capital_equity, color: "#4338ca" },
    { label: "Approved", value: allTimeEquity.approved, color: "#16a34a" },
    { label: "Rejected", value: allTimeEquity.rejected, color: "#e11d48" },
    { label: "Balance", value: allTimeEquity.balance, color: "#b45309" },
  ];

  const scopeLabel = department || "All Business Units";
  const footerTitle = statusFilter === "all"
    ? `SUMMARY — ${scopeLabel.toUpperCase()}`
    : `TOTAL AMOUNT — ${chipTitle.toUpperCase()}${department ? ` · ${department.toUpperCase()}` : ""}`;

  const periodText = fromDate || toDate
    ? `${fromDate ? fmtDateOnly(fromDate) : "Beginning"} → ${toDate ? fmtDateOnly(toDate) : "Today"}`
    : "All time";

  const summaryPanels = (
    <div
      style={{
        marginTop: 12, padding: "16px 20px", borderRadius: 10,
        background: "linear-gradient(90deg, #ecfdf5 0%, #f0fdf4 100%)",
        border: "1px solid #a7f3d0",
        opacity: loading ? 0.6 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#047857", letterSpacing: 0.4, display: "flex", alignItems: "center", gap: 6 }}>
            {footerTitle}
            {loading && <Loader2 size={12} className="spin" />}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            Period: {periodText} · {totalRows} rows matching your filters
          </div>
        </div>

        {statusFilter !== "all" && (
          <div style={{ fontSize: 24, fontWeight: 800, color: "#065f46", whiteSpace: "nowrap" }}>
            {fmtMoney(viewTotal)}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ background: "#ffffff", borderRadius: 8, padding: 14, border: "1px solid #d1fae5" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#047857", letterSpacing: 0.5, marginBottom: 4, textTransform: "uppercase" }}>
            ② Monthly Rollback
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
            Balance at end of each month
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 10, fontSize: 12 }}>
            <select
              className="form-control"
              value={rollYear}
              onChange={(e) => setRollYear(e.target.value)}
              style={{ width: 110, padding: "4px 8px", fontSize: 12, height: "auto" }}
            >
              <option value="all">All years</option>
              {rollYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={rollHideEmpty} onChange={(e) => setRollHideEmpty(e.target.checked)} />
              Hide months with no activity
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={rollNewestFirst} onChange={(e) => setRollNewestFirst(e.target.checked)} />
              Newest first
            </label>
            <span style={{ marginLeft: "auto", color: "#94a3b8" }}>
              {rollRows.length} of {monthlyRollback.length} months
            </span>
          </div>

          {rollRows.length === 0 ? (
            <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>
              {monthlyRollback.length === 0
                ? "No monthly data available."
                : "No activity in the selected months. Untick “Hide months with no activity” to see all."}
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: "auto", overflowX: "auto", border: "1px solid #eef2f7", borderRadius: 6 }}>
              <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}>
                    <th style={{ textAlign: "left", padding: "6px 10px", color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>Month</th>
                    <th style={{ textAlign: "right", padding: "6px 10px", color: "#4338ca", fontWeight: 600, whiteSpace: "nowrap" }}>Equity added</th>
                    <th style={{ textAlign: "right", padding: "6px 10px", color: "#0ea5e9", fontWeight: 600, whiteSpace: "nowrap" }} title="Previous month's actual balance">Roll Over Balance</th>
                    <th style={{ textAlign: "right", padding: "6px 10px", color: "#0284c7", fontWeight: 600, whiteSpace: "nowrap" }} title="Capital (cumulative) + Roll Over">Actual Balance</th>
                    <th style={{ textAlign: "right", padding: "6px 10px", color: "#16a34a", fontWeight: 600, whiteSpace: "nowrap" }}>Approval</th>
                    <th style={{ textAlign: "right", padding: "6px 10px", color: "#b45309", fontWeight: 600, whiteSpace: "nowrap" }} title="Actual Balance − Approval">Current Balance</th>
                    <th style={{ textAlign: "right", padding: "6px 10px", color: "#7c3aed", fontWeight: 600, whiteSpace: "nowrap" }}>Available Cash</th>
                    <th style={{ textAlign: "right", padding: "6px 10px", color: "#e11d48", fontWeight: 600, whiteSpace: "nowrap" }} title="Current Balance − Available Cash (approved but not paid)">Discrepancy</th>
                  </tr>
                </thead>
                <tbody>
                  {rollRows.map((row) => {
                    const equityAdded    = Number(row.equity_added ?? row.capital_equity ?? 0);
                    const rollOver       = Number(row.roll_over_balance ?? 0);
                    const actualBalance  = Number(row.actual_balance ?? 0);
                    const approval       = Number(row.approved ?? 0);
                    const currentBalance = Number(row.current_balance ?? row.balance ?? 0);
                    const availableCash  = Number(row.available_cash ?? currentBalance);
                    const discrepancy    = Number(row.discrepancy ?? (currentBalance - availableCash));
                    return (
                      <tr key={row.month} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: "6px 10px", color: "#334155", fontWeight: 500, whiteSpace: "nowrap" }}>
                          {fmtMonthLabel(row.month)}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap", color: equityAdded ? "#0f172a" : "#cbd5e1" }}>
                          {fmtMoney(equityAdded)}
                        </td>
                        <td
                          style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap", color: "#475569" }}
                        >
                          {fmtMoney(rollOver)}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: actualBalance < 0 ? "#e11d48" : "#0f172a" }}>
                          {fmtMoney(actualBalance)}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap", color: approval ? "#0f172a" : "#cbd5e1" }}>
                          {fmtMoney(approval)}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: currentBalance < 0 ? "#e11d48" : "#065f46" }}>
                          {fmtMoney(currentBalance)}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap", color: availableCash < 0 ? "#e11d48" : "#065f46" }}>
                          {fmtMoney(availableCash)}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: discrepancy !== 0 ? "#e11d48" : "#94a3b8" }}>
                          {fmtMoney(discrepancy)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        <div style={{ background: "#ffffff", borderRadius: 8, padding: 14, border: "1px solid #d1fae5" }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#047857", letterSpacing: 0.5, textTransform: "uppercase" }}>
              ① Filtered View
            </div>

            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <select
                value={panelDept}
                onChange={(e) => setPanelDept(e.target.value)}
                style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: "1px solid #cbd5e1", background: "#f8fafc", maxWidth: 110 }}
              >
                <option value="">{department ? `Use “${department}”` : "All Depts"}</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={panelPeriod}
                onChange={(e) => handlePanelPeriodChange(e.target.value)}
                style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: "1px solid #cbd5e1", background: "#f8fafc" }}
              >
                <option value="all">All Time</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            <div>{activeDept} · {activePeriodText}</div>
            {panelPeriod === "custom" && (
              <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
                <input
                  type="date"
                  value={panelFromDate}
                  onChange={(e) => setPanelFromDate(e.target.value)}
                  style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, border: "1px solid #cbd5e1", width: 105 }}
                />
                <span>→</span>
                <input
                  type="date"
                  value={panelToDate}
                  onChange={(e) => setPanelToDate(e.target.value)}
                  style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, border: "1px solid #cbd5e1", width: 105 }}
                />
              </div>
            )}
          </div>

          {equityBoxes.map((b) => (
            <div key={b.label} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ color: b.color, fontWeight: 600, fontSize: 12 }}>{b.label}</span>
                <span style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", fontSize: 13 }}>{fmtMoney(b.value)}</span>
              </div>
              {b.sub && <div style={{ fontSize: 10.5, color: "#94a3b8", textAlign: "right" }}>For {b.sub}</div>}
            </div>
          ))}
        </div>

        <div style={{ background: "#ffffff", borderRadius: 8, padding: 14, border: "1px solid #d1fae5" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#047857", letterSpacing: 0.5, marginBottom: 4, textTransform: "uppercase" }}>
            ③ All‑Time (No Filters)
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
            Cumulative across every request
          </div>
          {allTimeBoxes.map((b) => (
            <div key={b.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 8 }}>
              <span style={{ color: b.color, fontWeight: 600, fontSize: 12 }}>{b.label}</span>
              <span style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", fontSize: 13 }}>{fmtMoney(b.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const firstLoad = loading && rows.length === 0;

  return (
    <div className="page">
      <main className="page-main" style={{ paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {onBack && (
            <button className="btn btn-primary" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <h2 style={{ margin: 0 }}>📘 CopperBook</h2>
          <span style={{ color: "#6b7280", fontSize: 14 }}>Cross-portal requests from StaffPortal awaiting approval</span>
        </div>

        <p className="section-title" style={{ marginBottom: 8 }}>Filter Panel</p>
        <div className="card" style={{ marginBottom: 16 }}>
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

            {canManage && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => setShowPersonal(true)}>
                  Personal Amount
                </button>
                {isSuperAdmin && (
                  <button className="btn btn-primary" onClick={() => setShowAllEmployees(true)}>
                    Salaries
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
              <label className="form-label">Period</label>
              <select className="form-control" value={period} onChange={(e) => handlePeriodChange(e.target.value)}>
                <option value="all">All Time</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 190 }}>
              <label className="form-label">Business Unit</label>
              <select className="form-control" value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">All Business Units</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">From</label>
              <input type="date" className="form-control" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPeriod("custom"); }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">To</label>
              <input type="date" className="form-control" value={toDate} onChange={(e) => { setToDate(e.target.value); setPeriod("custom"); }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
              <label className="form-label">Search</label>
              <div style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
                <input className="form-control" style={{ paddingLeft: 32 }} placeholder="Search…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={resetFilters} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <RotateCcw size={15} /> Reset
            </button>
          </div>
        </div>

        {firstLoad ? (
          <div className="card empty-state">Loading CopperBook requests…</div>
        ) : rows.length === 0 ? (
          <div className="card empty-state">No CopperBook requests match this filter.</div>
        ) : (
          <div className="card table-wrap" style={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
            <table className="data-table" style={{ minWidth: 1100, width: "100%" }}>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Business Unit</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Category</th>
                  <th>Reference Date</th>
                  <th>Purpose</th>
                  <th>Raised By</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: "center" }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row_key || r.id}>
                    <td style={{ fontWeight: 600 }}>{r.request_number}</td>
                    <td>{r.business_unit || r.department || "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: r.amount ? 700 : 400, color: r.amount ? "#065f46" : "#9ca3af", whiteSpace: "nowrap" }}>
                      {r.amount ? fmtMoney(r.amount) : "—"}
                      {r.is_split && <div style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>of {fmtMoney(r.request_amount)}</div>}
                    </td>
                    <td>{r.category || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDateOnly(r.reference_date)}</td>
                    <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.purpose}>{r.purpose}</td>
                    <td>{r.raised_by_name || "—"}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ fontSize: 12.5, color: "#6b7280", whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td>

                    <td>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
                        <button className="btn btn-secondary" onClick={() => openRow(r)}>Open</button>
                        {canManage && (
                          <button
                            className="btn btn-danger"
                            title="Delete Request"
                            disabled={acting}
                            onClick={() => deleteReq(r.id, false)}
                            style={{ padding: "6px 10px", display: "inline-flex", alignItems: "center" }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                  <td colSpan={2} style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                    {statusFilter === "all" ? "Total Expenses" : `Total (${chipTitle})`}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 800, fontSize: 15, color: "#065f46", whiteSpace: "nowrap" }}>
                    {fmtMoney(statusFilter === "all" ? totalExpenses : viewTotal)}
                  </td>
                  <td colSpan={7} style={{ fontSize: 12.5, color: "#6b7280" }}>
                    {statusFilter === "all"
                      ? `Approved amounts excluding Capital Equity · ${totalRows} rows across all pages`
                      : `${totalRows} rows across all pages`}
                  </td>
                </tr>
              </tfoot>
            </table>

            {page < pages && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => load(page + 1, true)} disabled={loadingMore} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {loadingMore ? <><Loader2 size={14} className="spin" /> Loading…</> : `Load More (page ${page + 1} of ${pages})`}
                </button>
              </div>
            )}
          </div>
        )}

        {summaryPanels}

        {openId && (
          <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setOpenId(null)}>
            <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: "92%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
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

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {canManage && !editing && (
                        <button className="btn btn-secondary" onClick={startEdit} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Edit size={14} /> Edit
                        </button>
                      )}
                      <button className="btn btn-secondary" onClick={() => { setOpenId(null); setEditing(false); }}>Close</button>
                    </div>
                  </div>

                  {!editing ? (
                    <>
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
                          <div>{detail.is_payroll ? "Payroll (per-employee)" : (detail.assignee_names?.length ? detail.assignee_names.join(", ") : "Whole Department")}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>Purpose</div>
                          <div style={{ fontWeight: 600 }}>{detail.purpose}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>Reference Date</div>
                          <div style={{ fontWeight: 600 }}>{fmtDateOnly(detail.reference_date)}</div>
                        </div>
                      </div>

                      {detail.amount !== null && detail.amount !== undefined && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                            {detail.is_payroll && allEntries.length > 0 ? "Grand Total" : "Amount"}
                          </div>
                          <div style={{ background: "#ecfdf5", color: "#065f46", padding: "12px 16px", borderRadius: 8, fontWeight: 700, fontSize: 20, border: "1px solid #a7f3d0", display: "inline-block", minWidth: 180 }}>
                            {fmtMoney(detail.amount)}
                          </div>
                        </div>
                      )}

                      {detail.is_payroll && allEntries.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Employee Entries</div>
                          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                            {ENTRY_TABS.map(([key, label, color]) => (
                              <button key={key} type="button" onClick={() => setEntryTab(key)} style={{ padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 600, border: `1px solid ${color}`, background: entryTab === key ? color : "transparent", color: entryTab === key ? "#fff" : color }}>
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
                                    {canReapproveEntries && <th style={{ textAlign: "center" }}>Action</th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {tabEntries.map((e) => (
                                    <tr key={e.id}>
                                      <td><b>{e.employee_name}</b></td>
                                      <td>{e.employee_department || "—"}</td>
                                      <td style={{ textAlign: "right" }}>₹{Number(e.monthly_salary || 0).toLocaleString("en-IN")}</td>
                                      <td style={{ textAlign: "right" }}>₹{Number(e.td_da || 0).toLocaleString("en-IN")}</td>
                                      <td style={{ textAlign: "right", fontWeight: 700 }}>₹{Number(e.total_amount || 0).toLocaleString("en-IN")}</td>
                                      <td><StatusBadge status={e.status} /></td>
                                      <td style={{ fontSize: 12.5, color: "#475569" }}>{e.remarks || "—"}</td>
                                      {canReapproveEntries && (
                                        <td style={{ textAlign: "center" }}>
                                          <button
                                            className="btn btn-primary"
                                            disabled={acting}
                                            onClick={() => reapproveEntry(e.id)}
                                            style={{ padding: "4px 10px", fontSize: 12 }}
                                          >
                                            ✅ Approve
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                  <tr style={{ background: "#f8fafc" }}>
                                    <td colSpan={4} style={{ textAlign: "right", fontWeight: 600 }}>{ENTRY_TABS.find(([k]) => k === entryTab)?.[1]} Total:</td>
                                    <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtMoney(sumOf(tabEntries))}</td>
                                    <td colSpan={canReapproveEntries ? 3 : 2}></td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Description</div>
                        <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>{detail.description}</div>
                      </div>

                      {detail.remarks && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Remarks (from raiser)</div>
                          <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>{detail.remarks}</div>
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
                        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16, marginTop: 16, position: "sticky", bottom: -24, background: "#fff", paddingBottom: 8 }}>
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
                              disabled={acting}
                              onClick={() => doAction("finance-action", "reject")}
                            >
                              ❌ Reject
                            </button>
                          </div>
                        </div>
                      )}

                      {detail.status === "forwarded_to_ceo" && isCEO && (
                        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16, marginTop: 16, position: "sticky", bottom: -24, background: "#fff", paddingBottom: 8 }}>
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
                              disabled={acting}
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

                      {detail.status === "rejected" && isCEO && (
                        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16, marginTop: 16, position: "sticky", bottom: -24, background: "#fff", paddingBottom: 8 }}>
                          <div style={{ fontSize: 13, color: "#e11d48", fontWeight: 600, marginBottom: 4 }}>
                            This request was rejected.
                          </div>
                          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                            Changed your mind? Use <b>Edit</b> (top right) to correct the amount or remarks if needed,
                            then approve it below.
                          </div>
                          <textarea
                            className="form-control"
                            rows={3}
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Remarks for re-approval (optional)…"
                          />
                          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                            <button
                              className="btn btn-primary"
                              disabled={acting}
                              onClick={() => doAction("ceo-action", "approve")}
                            >
                              {acting ? "…" : "✅ Approve Again"}
                            </button>
                            {canManage && (
                              <button
                                className="btn btn-secondary"
                                disabled={acting}
                                onClick={startEdit}
                              >
                                ✏️ Edit Amount / Remarks
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {detail.status !== "pending" &&
                        detail.status !== "forwarded_to_ceo" &&
                        !(detail.status === "rejected" && isCEO) && (
                        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, marginTop: 12, color: "#6b7280", fontSize: 13 }}>
                          This request has been finalized ({STATUS_LABEL[detail.status] || detail.status}).
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {detail.status === "rejected" && (
                        <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#9f1239", padding: "8px 12px", borderRadius: 8, fontSize: 12.5 }}>
                          This request is currently rejected. After saving your changes, close the editor and click
                          <b> Approve Again</b> to approve it.
                        </div>
                      )}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Business Unit / Department</label>
                        <input
                          className="form-control"
                          value={editForm.department}
                          onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Purpose</label>
                        <input
                          className="form-control"
                          value={editForm.purpose}
                          onChange={(e) => setEditForm({ ...editForm, purpose: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Category{detail.is_payroll ? " (locked for payroll)" : ""}</label>
                        <input
                          className="form-control"
                          value={editForm.category}
                          disabled={detail.is_payroll}
                          onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Amount (₹){detail.is_payroll ? " (calculated from employee entries)" : ""}</label>
                        <input
                          className="form-control"
                          type="number"
                          value={editForm.amount}
                          disabled={detail.is_payroll}
                          onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Reference Date</label>
                        <input
                          className="form-control"
                          type="date"
                          value={editForm.reference_date}
                          onChange={(e) => setEditForm({ ...editForm, reference_date: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Description</label>
                        <textarea
                          className="form-control"
                          rows={4}
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Remarks</label>
                        <textarea
                          className="form-control"
                          rows={3}
                          value={editForm.remarks}
                          onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="btn btn-primary" onClick={saveEdit} disabled={acting}>
                          {acting ? "Saving…" : "Save Changes"}
                        </button>
                        <button className="btn btn-secondary" onClick={() => setEditing(false)} disabled={acting}>
                          Cancel
                        </button>
                      </div>
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