import React, { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  Users, TrendingUp, TrendingDown, Wallet,
  Search, Upload, Download, RotateCcw, Eye,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import Navbar from "../../components/Navbar.jsx";
import StatCards from "../../components/StatCards.jsx";
import FinanceCharts from "../../components/FinanceCharts.jsx";
import FinanceTable from "../../components/FinanceTable.jsx";
import EntryViewModal from "../../components/EntryViewModal.jsx";
import api from "../../api/axios.js";

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------
const PAGE_SIZE = 25;

const DEPARTMENTS_CONFIG = [
  { label: "Overview", value: "overview" },
  { label: "Corporate Management", value: "Corporate" },
  { label: "Office Management", value: "Adminstrationfunctionalunit" },
  { label: "Caredx", value: "Caredx" },
  { label: "IT Development", value: "IT" },
  { label: "IT Sales", value: "IT Sales" },
  { label: "MedTech", value: "MedTech" },
  { label: "PCM", value: "PCM" },
    { label: "Dental", value: "Dental" },
  { label: "Research Development", value: "ResearchDevelopment" },
];

const DEPARTMENT_CATEGORIES = {
  Caredx: {
    expenses: [
      "Reagents and Laboratory Consumables",
      "Specialized Clinical Labor",
      "Logistics, Couriers, and Specimen Collection",
      "Equipment Maintenance, Leases, and Automation",
      "Waste Management, Compliance, and Safety",
      "Billing, Revenue Cycle, and Administration",
    ],
  },
  PCM: [
    "Field Labor and Nursing Care",
    "Travel and Mileage Reimbursement",
    "Point-of-Care Technology and Telecom",
    "Home Medical Supplies and DME",
    "Intake, Scheduling, and Back-Office Logistics",
    "Regulatory and Risk Management",
  ],
};

const PIE_COLORS = ["#2f5dd4", "#16a34a", "#d97706", "#8b5cf6", "#dc2626", "#0ea5e9", "#8b5cf6"];

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
};
const todayStr = () => new Date().toISOString().split("T")[0];

// Build a compact page-number array (with "..." ellipsis markers).
const buildPageNumbers = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push("…", total);
  } else if (current >= total - 3) {
    pages.push(1, "…");
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1, "…", current - 1, current, current + 1, "…", total);
  }
  return pages;
};

export default function SuperAdminDashboard() {
  // ---------- State ----------
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeDept, setActiveDept] = useState("overview");
  const [activeExtra, setActiveExtra] = useState(null);

  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(todayStr());
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [caredxSection, setCaredxSection] = useState("lab");
  const [departmentOptions, setDepartmentOptions] = useState(null);

  // NEW: transaction type filter (Income / Expenses / All)
  const [entryTypeFilter, setEntryTypeFilter] = useState(null); // null | "Income" | "Expenses"
  // NEW: pagination
  const [currentPage, setCurrentPage] = useState(1);

  const [deptEntries, setDeptEntries] = useState([]);
  const [deptSummary, setDeptSummary] = useState(null);
  const [caredxLabEntries, setCaredxLabEntries] = useState([]);
  const [caredxExpenses, setCaredxExpenses] = useState([]);
  const [deptLoading, setDeptLoading] = useState(false);

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const [viewEntry, setViewEntry] = useState(null);

  // ---------- API calls ----------
  const fetchOptions = useCallback(async (dept) => {
    if (dept === "overview") {
      setDepartmentOptions(null);
      return;
    }
    try {
      const res = await api.get(`/admin/departments/${dept}/options`);
      setDepartmentOptions(res.data);
    } catch {
      toast.error("Failed to load department options.");
    }
  }, []);

  const fetchOverview = useCallback(async (start, end) => {
    setLoading(true);
    try {
      const res = await api.get("/admin/overview", {
        params: { start_date: start, end_date: end },
      });
      setOverview(res.data);
    } catch {
      toast.error("Failed to load admin overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDeptData = useCallback(async () => {
    if (activeDept === "overview") return;
    setDeptLoading(true);
    try {
      const params = {
        start_date: startDate,
        end_date: endDate,
        search: searchTerm || undefined,
        ...(activeExtra?.revenue_type && { revenue_type: activeExtra.revenue_type }),
        ...(selectedCategory && { category: selectedCategory }),
        ...(activeDept === "Caredx" && { section: caredxSection }),
        // NEW: entry_type filter only applies to standard departments.
        // Caredx uses section=lab|expenses to switch income/expense.
        ...(entryTypeFilter && activeDept !== "Caredx" && { entry_type: entryTypeFilter }),
      };

      const entriesRes = await api.get(`/admin/departments/${activeDept}/entries`, { params });
      const summaryParams = {
        start_date: startDate,
        end_date: endDate,
        ...(activeExtra?.revenue_type && { revenue_type: activeExtra.revenue_type }),
        ...(selectedCategory && { category: selectedCategory }),
        ...(activeDept === "Caredx" && { section: caredxSection }),
      };
      const summaryRes = await api.get(`/admin/departments/${activeDept}/summary`, { params: summaryParams });

      if (activeDept === "Caredx") {
        setCaredxLabEntries(entriesRes.data.lab_entries);
        setCaredxExpenses(entriesRes.data.expenses);
      } else {
        setDeptEntries(entriesRes.data.entries);
      }
      setDeptSummary(summaryRes.data);
    } catch (err) {
      toast.error(`Failed to load ${activeDept} data.`);
      console.error(err);
    } finally {
      setDeptLoading(false);
    }
  }, [
    activeDept,
    activeExtra,
    startDate,
    endDate,
    searchTerm,
    selectedCategory,
    caredxSection,
    entryTypeFilter, // NEW
  ]);

  // ---------- Effects ----------
  useEffect(() => {
    fetchOptions(activeDept);
  }, [activeDept, fetchOptions]);

  useEffect(() => {
    if (activeDept === "overview") {
      fetchOverview(startDate, endDate);
    }
  }, [activeDept, startDate, endDate, fetchOverview]);

  useEffect(() => {
    if (activeDept !== "overview") {
      fetchDeptData();
    }
  }, [fetchDeptData]);

  // NEW: reset pagination to page 1 whenever any filter changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [activeDept, entryTypeFilter, selectedCategory, startDate, endDate, searchTerm, caredxSection]);

  // ---------- Handlers ----------
  const handleSelectDept = (value) => {
    const config = DEPARTMENTS_CONFIG.find((d) => d.value === value);
    if (!config) return;
    setActiveDept(config.value);
    setActiveExtra(config.extra || null);
    setStartDate(firstOfMonth());
    setEndDate(todayStr());
    setSearchTerm("");
    setSelectedCategory(null);
    setCaredxSection("lab");
    setEntryTypeFilter(null); // NEW
    setCurrentPage(1);        // NEW
    setDeptEntries([]);
    setCaredxLabEntries([]);
    setCaredxExpenses([]);
    setDeptSummary(null);
  };

  const handleResetFilters = () => {
    setStartDate(firstOfMonth());
    setEndDate(todayStr());
    setSearchTerm("");
    setSelectedCategory(null);
    setCaredxSection("lab");
    setEntryTypeFilter(null); // NEW
    setCurrentPage(1);        // NEW
  };

  const handleCategoryClick = (cat) => {
    setSelectedCategory((prev) => (prev === cat ? null : cat));
  };

  const handleCaredxSectionChange = (section) => {
    setCaredxSection(section);
    setSelectedCategory(null);
    setCurrentPage(1); // NEW
  };

  // NEW: transaction type toggle
  const handleEntryTypeChange = (type) => {
    setEntryTypeFilter(type);
  };

  const handleExportExcel = async () => {
    try {
      const params = {
        start_date: startDate,
        end_date: endDate,
        ...(activeExtra?.revenue_type && { revenue_type: activeExtra.revenue_type }),
        ...(selectedCategory && { category: selectedCategory }),
        ...(activeDept === "Caredx" && { section: caredxSection }),
        ...(entryTypeFilter && activeDept !== "Caredx" && { entry_type: entryTypeFilter }),
      };
      const res = await api.get(`/admin/departments/${activeDept}/export`, {
        params,
        responseType: "blob",
      });
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeDept}_${startDate}_to_${endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export Excel file.");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setImporting(true);
    try {
      const res = await api.post(`/admin/departments/${activeDept}/import`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { imported, errors } = res.data;
      if (imported > 0) {
        toast.success(`Imported ${imported} entr${imported === 1 ? "y" : "ies"} into ${activeDept}.`);
      }
      if (errors && errors.length) {
        toast.error(`${errors.length} row(s) skipped — check the sheet formatting.`);
      }
      if (activeDept === "overview") {
        fetchOverview(startDate, endDate);
      } else {
        fetchDeptData();
      }
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to import the Excel file.";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  // ---------- Derived data ----------
  const currentDeptLabel = DEPARTMENTS_CONFIG.find((d) => d.value === activeDept)?.label || activeDept;

  let categories = [];
  if (activeDept === "Caredx") {
    if (caredxSection === "expenses") {
      categories = DEPARTMENT_CATEGORIES.Caredx.expenses;
    }
  } else if (activeDept === "PCM") {
    categories = DEPARTMENT_CATEGORIES.PCM;
  } else if (departmentOptions?.categories) {
    const allCats = new Set();
    Object.values(departmentOptions.categories).forEach((catList) =>
      catList.forEach((c) => allCats.add(c))
    );
    categories = Array.from(allCats).filter((c) => c !== "Others");
  }

  const sortedDepartments = React.useMemo(() => {
    if (!overview?.by_department) return [];
    const orderMap = {};
    DEPARTMENTS_CONFIG.forEach((config, idx) => {
      if (config.value !== "overview") {
        orderMap[config.value] = idx;
      }
    });
    return [...overview.by_department].sort((a, b) => {
      const orderA = orderMap[a.department] ?? 999;
      const orderB = orderMap[b.department] ?? 999;
      return orderA - orderB;
    });
  }, [overview]);

  const pieData = (overview?.by_department || []).map((d) => ({
    name: d.department,
    value: d.income + d.expenses,
  }));

  // NEW: client-side pagination for the transactional table
  const totalEntries = deptEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEntries = deptEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = totalEntries === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, totalEntries);
  const pageNumbers = buildPageNumbers(safePage, totalPages);

  // ---------- Render ----------
  return (
    <div className="page">
      <Navbar title="CEO Dashboard" roleColor="#7c3aed" />

      <main className="page-main">
        <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Department</label>
            <select
              className="form-control"
              value={activeDept}
              onChange={(e) => handleSelectDept(e.target.value)}
            >
              {DEPARTMENTS_CONFIG.map(({ label, value }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Start Date</label>
            <input
              type="date"
              className="form-control"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">End Date</label>
            <input
              type="date"
              className="form-control"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <button type="button" onClick={handleResetFilters} className="btn btn-secondary">
            <RotateCcw size={15} /> Reset
          </button>

          {activeDept !== "overview" && (
            <>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                <label className="form-label">Search</label>
                <div style={{ position: "relative" }}>
                  <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
                  <input
                    className="form-control"
                    style={{ paddingLeft: 32 }}
                    placeholder={`Search ${currentDeptLabel} entries...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <button type="button" onClick={handleExportExcel} className="btn btn-secondary">
                <Download size={15} /> Export Excel
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                style={{ display: "none" }}
                onChange={handleImportFileChange}
              />
              <button type="button" onClick={handleImportClick} disabled={importing} className="btn btn-secondary">
                <Upload size={15} /> {importing ? "Importing..." : "Import Excel"}
              </button>
            </>
          )}
        </div>

        {/* Overview Mode */}
        {activeDept === "overview" && (
          <>
            <div className="stat-grid">
              <div className="card stat-card">
                <div className="stat-icon stat-icon--team"><Users size={22} /></div>
                <div>
                  <p className="stat-label">Total Departments</p>
                  <p className="stat-value">{overview?.total_members ?? "—"}</p>
                </div>
              </div>
              <div className="card stat-card">
                <div className="stat-icon stat-icon--income"><TrendingUp size={22} /></div>
                <div>
                  <p className="stat-label">Platform Income</p>
                  <p className="stat-value">{formatCurrency(overview?.total_income)}</p>
                </div>
              </div>
              <div className="card stat-card">
                <div className="stat-icon stat-icon--expense"><TrendingDown size={22} /></div>
                <div>
                  <p className="stat-label">Platform Expenses</p>
                  <p className="stat-value">{formatCurrency(overview?.total_expenses)}</p>
                </div>
              </div>
              <div className="card stat-card">
                <div className="stat-icon stat-icon--profit"><Wallet size={22} /></div>
                <div>
                  <p className="stat-label">Platform Profit</p>
                  <p className="stat-value">{formatCurrency(overview?.total_profit)}</p>
                </div>
              </div>
            </div>

            {overview?.by_department && (
              <div className="card">
                <p className="section-title" style={{ marginBottom: 16 }}>
                  Income / Expenses / Profit by Department
                </p>
                <div className="dept-grid">
                  {sortedDepartments.map((d) => {
                    const config = DEPARTMENTS_CONFIG.find((c) => c.value === d.department);
                    const label = config ? config.label : d.department;
                    return (
                      <button
                        key={d.department}
                        type="button"
                        onClick={() => handleSelectDept(d.department)}
                        className="dept-card"
                        style={{ textAlign: "left", cursor: "pointer", border: activeDept === d.department ? "2px solid #7c3aed" : undefined }}
                      >
                        <p className="dept-card-title">{label}</p>
                        <div className="dept-row">
                          <span className="dept-row-label">Income</span>
                          <span className="dept-row-value--income">{formatCurrency(d.income)}</span>
                        </div>
                        <div className="dept-row">
                          <span className="dept-row-label">Expenses</span>
                          <span className="dept-row-value--expense">{formatCurrency(d.expenses)}</span>
                        </div>
                        <div className="dept-row dept-row--total">
                          <span className="dept-row-label">Profit</span>
                          <span className={`dept-row-value--profit ${d.profit < 0 ? "negative" : ""}`}>
                            {formatCurrency(d.profit)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {overview?.by_department && (
              <div className="chart-grid">
                <div className="card chart-card">
                  <h3>Income vs Expenses by Department</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={overview.by_department}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
                      <XAxis dataKey="department" tick={{ fontSize: 12, fill: "#9ca3af" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                      <Legend />
                      <Bar dataKey="income" fill="#16a34a" name="Income" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" fill="#dc2626" name="Expenses" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card chart-card">
                  <h3>Department Share of Total Volume</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%" cy="50%"
                        outerRadius={90}
                        label={(entry) => entry.name}
                      >
                        {pieData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}

        {/* Department Mode */}
        {activeDept !== "overview" && (
          <>
            {deptSummary && (
              <StatCards
                totalIncome={deptSummary.total_income}
                totalExpenses={deptSummary.total_expenses}
                profit={deptSummary.profit}
                entryCount={deptSummary.entry_count}
              />
            )}

            {deptSummary && (
              <FinanceCharts trend={deptSummary.trend} categoryBreakdown={deptSummary.category_breakdown} />
            )}

            {activeDept === "Caredx" && (
              <div className="card" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <button
                  className={`btn ${caredxSection === "lab" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => handleCaredxSectionChange("lab")}
                >
                  Lab Entries
                </button>
                <button
                  className={`btn ${caredxSection === "expenses" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => handleCaredxSectionChange("expenses")}
                >
                  Expenses
                </button>
              </div>
            )}

            {categories.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <p className="section-title" style={{ marginBottom: 12 }}>Categories</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      className={`btn ${selectedCategory === cat ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => handleCategoryClick(cat)}
                      style={{ padding: "8px 16px", borderRadius: 20, fontSize: 14 }}
                    >
                      {cat}
                    </button>
                  ))}
                  {selectedCategory && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setSelectedCategory(null)}
                      style={{ padding: "8px 16px", borderRadius: 20, fontSize: 14 }}
                    >
                      Clear Filter
                    </button>
                  )}
                </div>
              </div>
            )}

            {deptLoading ? (
              <div className="card empty-state">Loading...</div>
            ) : activeDept === "Caredx" ? (
              <>
                {caredxSection === "lab" && (
                  <div>
                    <p className="section-title" style={{ marginBottom: 12 }}>Lab Data Entries</p>
                    {caredxLabEntries.length === 0 ? (
                      <div className="card empty-state">No lab entries found for this filter.</div>
                    ) : (
                      <div className="card table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Date</th><th>Patient</th><th>Test</th><th>Employee</th>
                              <th className="text-right">Total Paid</th><th>Referral By</th>
                              <th className="text-right">Referral Amount</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {caredxLabEntries.map((e) => (
                              <tr key={e.id}>
                                <td style={{ whiteSpace: "nowrap" }}>{e.entry_date}</td>
                                <td>{e.patient_name}</td>
                                <td>{e.test_name}</td>
                                <td>{e.employee_name || "—"}</td>
                                <td className="text-right" style={{ fontWeight: 600 }}>{formatCurrency(e.total_amount_paid)}</td>
                                <td>{e.referral_by || "—"}</td>
                                <td className="text-right">{formatCurrency(e.referral_amount)}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => setViewEntry({ type: "lab", data: e })}
                                    title="View"
                                  >
                                    <Eye size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {caredxSection === "expenses" && (
                  <div>
                    <p className="section-title" style={{ marginBottom: 12 }}>Expenses</p>
                    {caredxExpenses.length === 0 ? (
                      <div className="card empty-state">No expenses found for this filter.</div>
                    ) : (
                      <div className="card table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Date</th><th>Category</th><th className="text-right">Amount</th>
                              <th>Remarks</th><th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {caredxExpenses.map((e) => (
                              <tr key={e.id}>
                                <td style={{ whiteSpace: "nowrap" }}>{e.expense_date}</td>
                                <td>{e.category}</td>
                                <td className="text-right" style={{ fontWeight: 600 }}>{formatCurrency(e.amount)}</td>
                                <td className="truncate">{e.remarks || "—"}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => setViewEntry({ type: "expense", data: e })}
                                    title="View"
                                  >
                                    <Eye size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div>
                <p className="section-title" style={{ marginBottom: 12 }}>
                  {currentDeptLabel} Finance Entries
                </p>

                {/* NEW: Income / Expenses / All toggle */}
                <div
                  className="card"
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 14, marginRight: 4 }}>
                    Transaction Type:
                  </span>
                  <button
                    type="button"
                    className={`btn ${entryTypeFilter === null ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => handleEntryTypeChange(null)}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`btn ${entryTypeFilter === "Income" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => handleEntryTypeChange("Income")}
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    className={`btn ${entryTypeFilter === "Expenses" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => handleEntryTypeChange("Expenses")}
                  >
                    Expenses
                  </button>
                </div>

                {/* Transactional table – paginated */}
                <FinanceTable
                  entries={paginatedEntries}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onView={(entry) => setViewEntry({ type: "finance", data: entry })}
                />

                {/* NEW: Pagination controls */}
                {totalEntries > 0 && (
                  <div
                    className="card"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      marginTop: 12,
                    }}
                  >
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                      Showing {rangeStart}–{rangeEnd} of {totalEntries} transactions
                    </span>

                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={safePage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </button>

                      {pageNumbers.map((p, idx) =>
                        p === "…" ? (
                          <span key={`ellipsis-${idx}`} style={{ padding: "0 6px", color: "#9ca3af" }}>
                            …
                          </span>
                        ) : (
                          <button
                            key={p}
                            type="button"
                            className={`btn ${p === safePage ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => setCurrentPage(p)}
                            style={{ minWidth: 36 }}
                          >
                            {p}
                          </button>
                        )
                      )}

                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={safePage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {viewEntry && (
        <EntryViewModal
          entry={viewEntry.data}
          type={viewEntry.type}
          onClose={() => setViewEntry(null)}
        />
      )}
    </div>
  );
}