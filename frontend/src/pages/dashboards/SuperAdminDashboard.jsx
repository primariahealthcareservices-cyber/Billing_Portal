// frontend/src/pages/dashboards/SuperAdminDashboard.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  Users, TrendingUp, TrendingDown, Wallet,
  Search, Upload, Download, RotateCcw, Eye,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from "recharts";
import Navbar from "../../components/Navbar.jsx";
import StatCards from "../../components/StatCards.jsx";
import FinanceCharts from "../../components/FinanceCharts.jsx";
import FinanceTable from "../../components/FinanceTable.jsx";
import EntryViewModal from "../../components/EntryViewModal.jsx";
import ThreeDChart from "../../components/ThreeDChart.jsx";
import api from "../../api/axios.js";

// ------------------------------------------------------------------
// Configuration - Department order and labels
// ------------------------------------------------------------------
const DEPARTMENTS_CONFIG = [
  { label: "Overview", value: "overview" },
  { label: "Corporate Management", value: "Corporate" },
  { label: "Office Administration", value: "Adminstrationfunctionalunit" },
  { label: "CareDx", value: "Caredx" },
  { label: "Dental", value: "Dental" },
  { label: "Everglades", value: "Everglades" },
  { label: "IT Development", value: "IT" },
  { label: "IT Sales", value: "IT Sales" },
  { label: "MedTech", value: "MedTech" },
  { label: "PCM", value: "PCM" },
  { label: "Research Development", value: "ResearchDevelopment" },
  { label: "Sales Enterprise", value: "SalesEnterprise" },
];

const SUB_DEPARTMENTS = [
  "All",
  "Corporate Management",
  "Office Administration",
  "CareDx",
  "Dental",
  "Everglades",
  "IT Development",
  "IT Sales",
  "MedTech",
  "PCM",
  "Research Development",
];

const SUB_DEPT_TO_MAIN = {
  "Corporate Management": "Corporate",
  "Office Administration": "Adminstrationfunctionalunit",
  "CareDx": "Caredx",
  "Dental": "Dental",
  "Everglades": "Everglades",
  "IT Development": "IT",
  "IT Sales": "IT Sales",
  "MedTech": "MedTech",
  "PCM": "PCM",
  "Research Development": "ResearchDevelopment",
};

const KPI_DISPLAY_NAMES = {
  revenue_growth: "Revenue Growth Rate",
  win_rate: "Win Rate",
  stage_conversion: "Stage Conversion Rate",
  pipeline_coverage: "Pipeline Coverage",
  sales_cycle_length: "Sales Cycle Length",
  cac: "Customer Acquisition Cost (CAC)",
  rep_productivity: "Rep Productivity",
  ramp_time: "Ramp Time",
  lead_response_time: "Lead Response Time",
  nrr: "Net Revenue Retention (NRR)",
  quota_attainment: "Quota Attainment",
  forecast_accuracy: "Forecast Accuracy"
};
const KPI_KEYS = Object.keys(KPI_DISPLAY_NAMES);

const PIE_COLORS = ["#2f5dd4", "#16a34a", "#d97706", "#8b5cf6", "#dc2626", "#0ea5e9", "#8b5cf6"];

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

// ✅ Timezone-safe date formatter (avoids UTC rollover)
const fmtLocalDate = (d) => {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

const firstOfMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return fmtLocalDate(new Date(d.getFullYear(), d.getMonth(), 1));
};
const todayStr = () => fmtLocalDate(new Date());

const getMonthNumber = (monthName) => {
  const months = {
    January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
    July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
  };
  return months[monthName] || 0;
};

const getQuarter = (monthNum) => {
  if (monthNum >= 1 && monthNum <= 3) return 1;
  if (monthNum >= 4 && monthNum <= 6) return 2;
  if (monthNum >= 7 && monthNum <= 9) return 3;
  if (monthNum >= 10 && monthNum <= 12) return 4;
  return 0;
};

const average = (arr) => {
  const filtered = arr.filter(v => v !== null && v !== undefined && !isNaN(parseFloat(v)));
  if (filtered.length === 0) return null;
  const sum = filtered.reduce((a, b) => a + parseFloat(b), 0);
  return sum / filtered.length;
};

const formatKpiValue = (val) => {
  if (val === null || val === undefined) return "—";
  const num = parseFloat(val);
  if (isNaN(num)) return "—";
  return num.toFixed(2);
};

const getEntryKind = (entry) => {
  if (!entry) return null;
  const raw = (
    entry.entry_type ?? entry.type ?? entry.transaction_type ??
    entry.kind ?? entry.flow ?? ""
  ).toString().trim().toLowerCase();

  if (!raw) {
    const amt = Number(entry.amount ?? entry.total_amount_paid ?? 0);
    if (!Number.isNaN(amt) && amt !== 0) return amt < 0 ? "expenses" : "income";
    return null;
  }
  if (raw.includes("income") || raw.includes("revenue") || raw.includes("credit") || raw === "in") return "income";
  if (raw.includes("expense") || raw.includes("expenditure") || raw.includes("debit") || raw === "out") return "expenses";
  return null;
};

const matchesDataView = (entry, view) => {
  if (view === "all") return true;
  const kind = getEntryKind(entry);
  if (!kind) return true;
  return kind === view;
};

export default function SuperAdminDashboard() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeDept, setActiveDept] = useState("overview");
  const [activeExtra, setActiveExtra] = useState(null);

  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(todayStr());
  const [searchTerm, setSearchTerm] = useState("");

  const [quarterFilter, setQuarterFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));

  const [dataView, setDataView] = useState("all");

  // SalesEnterprise specific
  const [selectedQuarter, setSelectedQuarter] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSubDept, setSelectedSubDept] = useState("All");
  const [salesKpis, setSalesKpis] = useState([]);
  const [salesKpisLoading, setSalesKpisLoading] = useState(false);
  const [salesSelectedDept, setSalesSelectedDept] = useState(null);
  const [salesAggregated, setSalesAggregated] = useState({ averages: {}, monthlyData: [] });

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [caredxSection, setCaredxSection] = useState("lab");
  const [departmentOptions, setDepartmentOptions] = useState(null);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(30);
  const [totalEntries, setTotalEntries] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [deptEntries, setDeptEntries] = useState([]);
  const [deptSummary, setDeptSummary] = useState(null);
  const [caredxLabEntries, setCaredxLabEntries] = useState([]);
  const [caredxExpenses, setCaredxExpenses] = useState([]);
  const [deptLoading, setDeptLoading] = useState(false);

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const [viewEntry, setViewEntry] = useState(null);

  // ---------- Effect: SalesEnterprise quarter → dates ----------
  useEffect(() => {
    if (activeDept !== "SalesEnterprise") return;
    if (!selectedYear) return;

    const year = parseInt(selectedYear, 10);
    let start, end;
    if (selectedQuarter === "") {
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
    } else {
      const q = parseInt(selectedQuarter, 10);
      if (q === 1) { start = new Date(year, 0, 1); end = new Date(year, 2, 31); }
      else if (q === 2) { start = new Date(year, 3, 1); end = new Date(year, 5, 30); }
      else if (q === 3) { start = new Date(year, 6, 1); end = new Date(year, 8, 30); }
      else if (q === 4) { start = new Date(year, 9, 1); end = new Date(year, 11, 31); }
      else return;
    }
    if (start && end) {
      setStartDate(fmtLocalDate(start));
      setEndDate(fmtLocalDate(end));
    }
  }, [selectedQuarter, selectedYear, activeDept]);

  // ---------- ✅ FIXED: Non-SalesEnterprise quarter → dates (incl. "All") ----------
  useEffect(() => {
    if (activeDept === "SalesEnterprise") return;

    const year = parseInt(yearFilter, 10);
    if (isNaN(year)) return;

    // "" → All (full year); otherwise 1..4
    const q = quarterFilter === "" ? null : parseInt(quarterFilter, 10);

    let start, end;
    if (q === null) {
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
    } else if (q === 1) {
      start = new Date(year, 0, 1);
      end = new Date(year, 2, 31);
    } else if (q === 2) {
      start = new Date(year, 3, 1);
      end = new Date(year, 5, 30);
    } else if (q === 3) {
      start = new Date(year, 6, 1);
      end = new Date(year, 8, 30);
    } else if (q === 4) {
      start = new Date(year, 9, 1);
      end = new Date(year, 11, 31);
    } else {
      return;
    }

    setStartDate(fmtLocalDate(start));
    setEndDate(fmtLocalDate(end));
  }, [quarterFilter, yearFilter, activeDept]);

  // ---------- Fetch KPIs for SalesEnterprise ----------
  useEffect(() => {
    if (activeDept !== "SalesEnterprise") return;
    if (selectedSubDept === "All" || !selectedYear) {
      setSalesKpis([]);
      setSalesAggregated({ averages: {}, monthlyData: [] });
      setSalesSelectedDept(null);
      setDeptSummary(null);
      return;
    }

    const mainDept = SUB_DEPT_TO_MAIN[selectedSubDept];
    if (mainDept) setSalesSelectedDept(mainDept);
    else setSalesSelectedDept(null);

    const fetchKpis = async () => {
      setSalesKpisLoading(true);
      try {
        const params = {
          department: selectedSubDept,
          year: parseInt(selectedYear, 10),
        };
        if (selectedQuarter) params.quarter = `Q${selectedQuarter}`;
        const res = await api.get("/salesenterprise/kpis", { params });
        const records = res.data.kpis || [];
        setSalesKpis(records);

        const monthMap = {};
        records.forEach(record => {
          const month = record.month || "January";
          if (!monthMap[month]) monthMap[month] = [];
          monthMap[month].push(record);
        });

        const monthlyData = Object.keys(monthMap).map(month => {
          const recordsForMonth = monthMap[month];
          const entry = { month };
          KPI_KEYS.forEach(key => {
            const values = recordsForMonth.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
            entry[key] = values.length > 0 ? average(values) : null;
          });
          return entry;
        });
        monthlyData.sort((a, b) => getMonthNumber(a.month) - getMonthNumber(b.month));

        const overallAverages = {};
        KPI_KEYS.forEach(key => {
          const allValues = records.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
          overallAverages[key] = allValues.length > 0 ? average(allValues) : null;
        });

        setSalesAggregated({ averages: overallAverages, monthlyData });
      } catch (err) {
        toast.error("Failed to load KPIs for the selected sub‑department.");
        setSalesKpis([]);
        setSalesAggregated({ averages: {}, monthlyData: [] });
      } finally {
        setSalesKpisLoading(false);
      }
    };
    fetchKpis();
  }, [activeDept, selectedSubDept, selectedYear, selectedQuarter]);

  // ---------- Fetch department summary when salesSelectedDept changes ----------
  useEffect(() => {
    if (activeDept !== "SalesEnterprise") return;
    if (!salesSelectedDept) {
      setDeptSummary(null);
      return;
    }
    fetchDeptSummaryOnly(salesSelectedDept, startDate, endDate);
  }, [activeDept, salesSelectedDept, startDate, endDate]);

  // ---------- API calls ----------
  const fetchOptions = useCallback(async (dept) => {
    if (dept === "overview" || dept === "SalesEnterprise") {
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

  const fetchDeptSummaryOnly = useCallback(async (dept, start, end) => {
    setDeptLoading(true);
    try {
      const params = { start_date: start, end_date: end };
      const summaryRes = await api.get(`/admin/departments/${dept}/summary`, { params });
      setDeptSummary(summaryRes.data);
    } catch (err) {
      toast.error(`Failed to load ${dept} summary.`);
      console.error(err);
    } finally {
      setDeptLoading(false);
    }
  }, []);

  const fetchDeptData = useCallback(async () => {
    if (activeDept === "overview" || activeDept === "SalesEnterprise") return;
    setDeptLoading(true);
    try {
      const baseParams = {
        start_date: startDate,
        end_date: endDate,
        ...(activeExtra?.revenue_type && { revenue_type: activeExtra.revenue_type }),
        ...(selectedCategory && { category: selectedCategory }),
      };

      const entriesParams = {
        ...baseParams,
        search: searchTerm || undefined,
        page: page,
        per_page: perPage,
      };
      if (activeDept === "Caredx") entriesParams.section = caredxSection;

      const summaryParams = { ...baseParams };

      const [entriesRes, summaryRes] = await Promise.all([
        api.get(`/admin/departments/${activeDept}/entries`, { params: entriesParams }),
        api.get(`/admin/departments/${activeDept}/summary`, { params: summaryParams }),
      ]);

      const pagination = entriesRes.data.pagination || {};
      setTotalEntries(pagination.total || 0);
      setTotalPages(pagination.pages || 0);
      setPage(pagination.page || 1);

      if (activeDept === "Caredx") {
        setCaredxLabEntries(entriesRes.data.lab_entries || []);
        setCaredxExpenses(entriesRes.data.expenses || []);
      } else {
        setDeptEntries(entriesRes.data.entries || []);
      }
      setDeptSummary(summaryRes.data);
    } catch (err) {
      toast.error(`Failed to load ${activeDept} data.`);
      console.error(err);
    } finally {
      setDeptLoading(false);
    }
  }, [activeDept, activeExtra, startDate, endDate, searchTerm, selectedCategory, caredxSection, page, perPage]);

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, searchTerm, selectedCategory, caredxSection]);

  useEffect(() => {
    fetchOptions(activeDept);
  }, [activeDept, fetchOptions]);

  useEffect(() => {
    if (activeDept === "overview") {
      fetchOverview(startDate, endDate);
    } else if (activeDept === "SalesEnterprise") {
      fetchOverview(startDate, endDate);
    } else {
      fetchDeptData();
    }
  }, [activeDept, startDate, endDate, fetchOverview, fetchDeptData]);

  // ---------- Handlers ----------
  const handleSelectDept = (value) => {
    const config = DEPARTMENTS_CONFIG.find(d => d.value === value);
    if (!config) return;

    setActiveDept(value);
    setActiveExtra(config.extra || null);
    setStartDate(firstOfMonth());
    setEndDate(todayStr());
    setSearchTerm("");
    setSelectedCategory(null);
    setCaredxSection("lab");
    setSelectedQuarter("");
    setSelectedYear("");
    setSelectedSubDept("All");
    setSalesSelectedDept(null);
    setQuarterFilter("");
    setYearFilter(String(new Date().getFullYear()));
    setDataView("all");
    setDeptEntries([]);
    setCaredxLabEntries([]);
    setCaredxExpenses([]);
    setDeptSummary(null);
    setPage(1);
    setTotalEntries(0);
    setTotalPages(0);
  };

  const handleResetFilters = () => {
    setStartDate(firstOfMonth());
    setEndDate(todayStr());
    setSearchTerm("");
    setSelectedCategory(null);
    setCaredxSection("lab");
    setSelectedQuarter("");
    setSelectedYear("");
    setSelectedSubDept("All");
    setSalesSelectedDept(null);
    setQuarterFilter("");
    setYearFilter(String(new Date().getFullYear()));
    setDataView("all");
    setPage(1);
  };

  const handleDataViewChange = (view) => {
    setDataView(view);
    if (activeDept === "Caredx") {
      if (view === "income") setCaredxSection("lab");
      else if (view === "expenses") setCaredxSection("expenses");
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) setPage(newPage);
  };

  const handleCategoryClick = (cat) => {
    setSelectedCategory(prev => (prev === cat ? null : cat));
    setPage(1);
  };

  const handleCaredxSectionChange = (section) => {
    setCaredxSection(section);
    setSelectedCategory(null);
    setPage(1);
  };

  const handleExportExcel = async () => {
    try {
      const params = {
        start_date: startDate,
        end_date: endDate,
        ...(activeExtra?.revenue_type && { revenue_type: activeExtra.revenue_type }),
        ...(selectedCategory && { category: selectedCategory }),
        ...(activeDept === "Caredx" && { section: caredxSection }),
      };
      const res = await api.get(`/admin/departments/${activeDept}/export`, {
        params, responseType: "blob",
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

  const handleImportClick = () => fileInputRef.current?.click();

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
      if (activeDept === "overview") fetchOverview(startDate, endDate);
      else fetchDeptData();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to import the Excel file.";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  // ---------- Derived data ----------
  const currentDeptLabel = DEPARTMENTS_CONFIG.find(d => d.value === activeDept)?.label || activeDept;

  let categories = [];
  if (departmentOptions?.categories) {
    if (activeDept === "Caredx" && caredxSection === "expenses") {
      categories = (departmentOptions.categories.Expenses || []).filter(c => {
        const lower = c.trim().toLowerCase();
        return lower !== "others" && lower !== "other";
      });
    } else if (activeDept === "Caredx" && caredxSection === "lab") {
      categories = [];
    } else {
      const allCats = new Set();
      Object.values(departmentOptions.categories).forEach(catList => catList.forEach(c => allCats.add(c)));
      categories = Array.from(allCats).filter(c => {
        const lower = c.trim().toLowerCase();
        return lower !== "others" && lower !== "other";
      });
    }
  }

  const sortedDepartments = React.useMemo(() => {
    if (!overview?.by_department) return [];
    const deptDataMap = {};
    overview.by_department.forEach(d => { deptDataMap[d.department] = d; });

    const allDepts = DEPARTMENTS_CONFIG
      .filter(c => c.value !== "overview")
      .map(c => c.value);

    return allDepts.map(dept => {
      const data = deptDataMap[dept];
      if (data) return data;
      return { department: dept, income: 0, expenses: 0, profit: 0 };
    });
  }, [overview]);

  const pieData = (overview?.by_department || []).map((d) => ({
    name: d.department,
    value:
      dataView === "income" ? d.income
      : dataView === "expenses" ? d.expenses
      : d.income + d.expenses,
  }));

  const filteredDeptEntries = React.useMemo(() => {
    if (dataView === "all") return deptEntries;
    return deptEntries.filter(e => matchesDataView(e, dataView));
  }, [deptEntries, dataView]);

  const visibleCaredxLabEntries = React.useMemo(() => {
    if (dataView === "expenses") return [];
    return caredxLabEntries;
  }, [caredxLabEntries, dataView]);

  const visibleCaredxExpenses = React.useMemo(() => {
    if (dataView === "income") return [];
    return caredxExpenses;
  }, [caredxExpenses, dataView]);

  const renderDataViewToggle = () => (
    <div className="card" style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontWeight: 600, marginRight: 8 }}>View:</span>
      <button type="button" className={`btn ${dataView === "all" ? "btn-primary" : "btn-secondary"}`} onClick={() => handleDataViewChange("all")}>All</button>
      <button type="button" className={`btn ${dataView === "income" ? "btn-primary" : "btn-secondary"}`} onClick={() => handleDataViewChange("income")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <TrendingUp size={15} /> Income
      </button>
      <button type="button" className={`btn ${dataView === "expenses" ? "btn-primary" : "btn-secondary"}`} onClick={() => handleDataViewChange("expenses")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <TrendingDown size={15} /> Expenses
      </button>
    </div>
  );

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="pagination" style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16, alignItems: "center" }}>
        <button className="btn btn-secondary" onClick={() => handlePageChange(page - 1)} disabled={page === 1}>Previous</button>
        <span style={{ display: "flex", alignItems: "center" }}>Page {page} of {totalPages} (Total {totalEntries} entries)</span>
        <button className="btn btn-secondary" onClick={() => handlePageChange(page + 1)} disabled={page === totalPages}>Next</button>
        <select
          value={perPage}
          onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          style={{ marginLeft: 12, padding: "6px 10px", borderRadius: 4 }}
        >
          <option value={10}>10 per page</option>
          <option value={30}>30 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>
      </div>
    );
  };

  return (
    <div className="page">
      <Navbar title="CEO Governance Dashboard" roleColor="#7c3aed" />

      <main className="page-main">
        {/* ========== FILTER PANEL ========== */}
        <p className="section-title" style={{ marginBottom: 8 }}>Filter Panel</p>
        <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Department</label>
            <select className="form-control" value={activeDept} onChange={(e) => handleSelectDept(e.target.value)}>
              {DEPARTMENTS_CONFIG.map(({ label, value }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {activeDept !== "SalesEnterprise" && (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Quarter</label>
                <select className="form-control" value={quarterFilter} onChange={(e) => setQuarterFilter(e.target.value)}>
                  <option value="">All</option>
                  <option value="1">Q1 (Jan–Mar)</option>
                  <option value="2">Q2 (Apr–Jun)</option>
                  <option value="3">Q3 (Jul–Sep)</option>
                  <option value="4">Q4 (Oct–Dec)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Year</label>
                <select className="form-control" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                  {Array.from({ length: 10 }, (_, i) => {
                    const y = new Date().getFullYear() - i;
                    return <option key={y} value={y}>{y}</option>;
                  })}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setQuarterFilter(""); }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">End Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setQuarterFilter(""); }}
                />
              </div>
            </>
          )}

          {activeDept === "SalesEnterprise" && (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Quarter</label>
                <select className="form-control" value={selectedQuarter} onChange={(e) => setSelectedQuarter(e.target.value)}>
                  <option value="">All</option>
                  <option value="1">Q1 (Jan–Mar)</option>
                  <option value="2">Q2 (Apr–Jun)</option>
                  <option value="3">Q3 (Jul–Sep)</option>
                  <option value="4">Q4 (Oct–Dec)</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Year</label>
                <select className="form-control" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
                  <option value="">Select Year</option>
                  {Array.from({ length: 10 }, (_, i) => {
                    const y = new Date().getFullYear() - i;
                    return <option key={y} value={y}>{y}</option>;
                  })}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Sub-Department</label>
                <select
                  className="form-control"
                  value={selectedSubDept}
                  onChange={(e) => setSelectedSubDept(e.target.value)}
                  style={{ minWidth: 150 }}
                >
                  {SUB_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <button type="button" onClick={handleResetFilters} className="btn btn-secondary">
            <RotateCcw size={15} /> Reset
          </button>

          {activeDept !== "overview" && activeDept !== "SalesEnterprise" && (
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
              <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm" style={{ display: "none" }} onChange={handleImportFileChange} />
              <button type="button" onClick={handleImportClick} disabled={importing} className="btn btn-secondary">
                <Upload size={15} /> {importing ? "Importing..." : "Import Excel"}
              </button>
            </>
          )}
        </div>

        {/* ========== OVERVIEW VIEW ========== */}
        {activeDept === "overview" && (
          <>
            <p className="section-title" style={{ marginBottom: 8 }}>Summary Panel</p>
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

            <div style={{ marginTop: 16 }}>{renderDataViewToggle()}</div>

            {overview?.by_department && (
              <>
                <p className="section-title" style={{ marginBottom: 8 }}>Categories Panel</p>
                <div className="card">
                  <p className="section-title" style={{ marginBottom: 16 }}>
                    {dataView === "income" ? "Income by Department"
                     : dataView === "expenses" ? "Expenses by Department"
                     : "Income / Expenses / Profit by Department"}
                  </p>
                  <div className="dept-grid">
                    {sortedDepartments.map((d) => {
                      const config = DEPARTMENTS_CONFIG.find(c => c.value === d.department);
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
                          {dataView !== "expenses" && (
                            <div className="dept-row">
                              <span className="dept-row-label">Income</span>
                              <span className="dept-row-value--income">{formatCurrency(d.income)}</span>
                            </div>
                          )}
                          {dataView !== "income" && (
                            <div className="dept-row">
                              <span className="dept-row-label">Expenses</span>
                              <span className="dept-row-value--expense">{formatCurrency(d.expenses)}</span>
                            </div>
                          )}
                          {dataView === "all" && (
                            <div className="dept-row dept-row--total">
                              <span className="dept-row-label">Profit</span>
                              <span className={`dept-row-value--profit ${d.profit < 0 ? "negative" : ""}`}>
                                {formatCurrency(d.profit)}
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {overview?.by_department && (
              <>
                <p className="section-title" style={{ marginBottom: 8 }}>Display Panel</p>
                <div className="chart-grid">
                  <div className="card chart-card">
                    <h3>
                      {dataView === "income" ? "Income by Department"
                       : dataView === "expenses" ? "Expenses by Department"
                       : "Income vs Expenses by Department"}
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={overview.by_department}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
                        <XAxis dataKey="department" tick={{ fontSize: 12, fill: "#9ca3af" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                        <Legend />
                        {dataView !== "expenses" && <Bar dataKey="income" fill="#16a34a" name="Income" radius={[4, 4, 0, 0]} />}
                        {dataView !== "income" && <Bar dataKey="expenses" fill="#dc2626" name="Expenses" radius={[4, 4, 0, 0]} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="card chart-card">
                    <h3>
                      {dataView === "income" ? "Department Share of Income"
                       : dataView === "expenses" ? "Department Share of Expenses"
                       : "Department Share of Total Volume"}
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(entry) => entry.name}>
                          {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ========== SALES ENTERPRISE VIEW ========== */}
        {activeDept === "SalesEnterprise" && (
          <>
            {loading || deptLoading ? (
              <div className="card empty-state">Loading...</div>
            ) : (
              <>
                <p className="section-title" style={{ marginBottom: 8 }}>
                  Summary Panel {selectedSubDept !== "All" ? `– ${selectedSubDept}` : ""}
                  {salesSelectedDept && ` (${DEPARTMENTS_CONFIG.find(d => d.value === salesSelectedDept)?.label || salesSelectedDept})`}
                </p>
                {deptSummary ? (
                  <StatCards
                    totalIncome={deptSummary.total_income}
                    totalExpenses={deptSummary.total_expenses}
                    profit={deptSummary.profit}
                    entryCount={deptSummary.entry_count}
                  />
                ) : (
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
                )}

                <p className="section-title" style={{ marginBottom: 8 }}>Categories Panel</p>
                <div className="card">
                  {selectedSubDept === "All" ? (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "#6b7280" }}>
                      Select a sub‑department to view its KPI averages.
                    </div>
                  ) : salesKpisLoading ? (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "#6b7280" }}>Loading KPIs...</div>
                  ) : salesKpis.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "#6b7280" }}>
                      No KPI data found for {selectedSubDept} in the selected period.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
                      {KPI_KEYS.map((key) => {
                        const avg = salesAggregated.averages[key];
                        return (
                          <div key={key} style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f9fafb", textAlign: "center" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "#4a5568", marginBottom: "4px" }}>{KPI_DISPLAY_NAMES[key]}</div>
                            <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#1a202c" }}>
                              {avg !== null && avg !== undefined ? avg.toFixed(2) : "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <p className="section-title" style={{ marginBottom: 8 }}>
                  Display Panel {selectedSubDept !== "All" ? `– ${selectedSubDept}` : ""}
                </p>
                <div className="card">
                  {selectedSubDept === "All" ? (
                    <div style={{ textAlign: "center", padding: "30px 0", color: "#6b7280" }}>
                      Select a sub‑department to view monthly KPI trends.
                    </div>
                  ) : salesKpisLoading ? (
                    <div style={{ textAlign: "center", padding: "30px 0", color: "#6b7280" }}>Loading charts...</div>
                  ) : salesKpis.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px 0", color: "#6b7280" }}>
                      No KPI data available for {selectedSubDept} in the selected period.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                      {KPI_KEYS.map((key) => {
                        const chartData = salesAggregated.monthlyData.map(item => ({
                          month: item.month,
                          value: item[key] !== null && item[key] !== undefined ? item[key] : 0,
                        }));
                        const displayName = KPI_DISPLAY_NAMES[key];
                        let ChartComponent = BarChart;
                        if (["revenue_growth", "win_rate", "nrr", "forecast_accuracy", "rep_productivity"].includes(key)) ChartComponent = LineChart;
                        if (key === "revenue_growth") ChartComponent = AreaChart;

                        const colorPalette = [
                          "#2f5dd4", "#16a34a", "#d97706", "#8b5cf6", "#dc2626",
                          "#0ea5e9", "#f43f5e", "#84cc16", "#f59e0b", "#ec4899", "#14b8a6"
                        ];
                        const colorIndex = KPI_KEYS.indexOf(key) % colorPalette.length;
                        const chartColor = colorPalette[colorIndex];

                        return (
                          <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "8px", background: "#f9fafb" }}>
                            <div style={{ fontSize: "0.7rem", fontWeight: "600", color: "#4a5568", textAlign: "center", marginBottom: "4px" }}>{displayName}</div>
                            <ResponsiveContainer width="100%" height={120}>
                              <ChartComponent data={chartData}>
                                <CartesianGrid strokeDasharray="2 2" stroke="#e2e8f0" />
                                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                                <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                                <Tooltip formatter={(v) => (typeof v === 'number' ? v.toFixed(2) : v)} labelFormatter={(label) => label} />
                                {ChartComponent === BarChart && <Bar dataKey="value" fill={chartColor} radius={[4, 4, 0, 0]} />}
                                {ChartComponent === LineChart && <Line type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} dot={{ r: 3 }} />}
                                {ChartComponent === AreaChart && (
                                  <Area type="monotone" dataKey="value" stroke={chartColor} fill={chartColor} fillOpacity={0.3} strokeWidth={2} />
                                )}
                              </ChartComponent>
                            </ResponsiveContainer>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ========== OTHER DEPARTMENTS ========== */}
        {activeDept !== "overview" && activeDept !== "SalesEnterprise" && (
          <>
            {deptSummary && (
              <>
                <p className="section-title" style={{ marginBottom: 8 }}>Summary Panel</p>
                <StatCards
                  totalIncome={dataView === "expenses" ? 0 : deptSummary.total_income}
                  totalExpenses={dataView === "income" ? 0 : deptSummary.total_expenses}
                  profit={
                    dataView === "income" ? deptSummary.total_income
                    : dataView === "expenses" ? -deptSummary.total_expenses
                    : deptSummary.profit
                  }
                  entryCount={
                    activeDept === "Caredx"
                      ? visibleCaredxLabEntries.length + visibleCaredxExpenses.length
                      : filteredDeptEntries.length || deptSummary.entry_count
                  }
                  paidToOtherLabs={activeDept === "Caredx" ? deptSummary.total_paid_to_other_labs : undefined}
                />
              </>
            )}

            {deptSummary && (
              <>
                <p className="section-title" style={{ marginBottom: 8 }}>Display Panel</p>
                <FinanceCharts trend={deptSummary.trend} categoryBreakdown={deptSummary.category_breakdown} />
              </>
            )}

            {activeDept === "Caredx" && dataView === "all" && (
              <div className="card" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <button className={`btn ${caredxSection === "lab" ? "btn-primary" : "btn-secondary"}`} onClick={() => handleCaredxSectionChange("lab")}>
                  Caredx Lab Revenue
                </button>
                <button className={`btn ${caredxSection === "expenses" ? "btn-primary" : "btn-secondary"}`} onClick={() => handleCaredxSectionChange("expenses")}>
                  Caredx Expenses
                </button>
              </div>
            )}

            {categories.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <p className="section-title" style={{ marginBottom: 12 }}>Categories</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {categories.map(cat => (
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
                    <button className="btn btn-secondary" onClick={() => setSelectedCategory(null)} style={{ padding: "8px 16px", borderRadius: 20, fontSize: 14 }}>
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
                <p className="section-title" style={{ marginBottom: 8 }}>Transactional Panel</p>
                {renderDataViewToggle()}

                {dataView !== "expenses" && (
                  <div>
                    <p className="section-title" style={{ marginBottom: 12 }}>Lab Data Entries</p>
                    {visibleCaredxLabEntries.length === 0 ? (
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
                            {visibleCaredxLabEntries.map((e) => (
                              <tr key={e.id}>
                                <td style={{ whiteSpace: "nowrap" }}>{e.entry_date}</td>
                                <td>{e.patient_name}</td>
                                <td>{e.test_name}</td>
                                <td>{e.employee_name || "—"}</td>
                                <td className="text-right" style={{ fontWeight: 600 }}>{formatCurrency(e.total_amount_paid)}</td>
                                <td>{e.referral_by || "—"}</td>
                                <td className="text-right">{formatCurrency(e.referral_amount)}</td>
                                <td>
                                  <button type="button" className="btn-icon" onClick={() => setViewEntry({ type: "lab", data: e })} title="View">
                                    <Eye size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {renderPagination()}
                      </div>
                    )}
                  </div>
                )}

                {dataView !== "income" && (
                  <div style={{ marginTop: 16 }}>
                    <p className="section-title" style={{ marginBottom: 12 }}>Expenses</p>
                    {visibleCaredxExpenses.length === 0 ? (
                      <div className="card empty-state">No expenses found for this filter.</div>
                    ) : (
                      <div className="card table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Date</th><th>Category</th>
                              <th className="text-right">Amount</th>
                              <th>Remarks</th>
                              <th className="text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleCaredxExpenses.map((e) => (
                              <tr key={e.id || e._key}>
                                <td style={{ whiteSpace: "nowrap" }}>{e.expense_date || e.entry_date}</td>
                                <td>{e.category}</td>
                                <td className="text-right" style={{ fontWeight: 600 }}>{formatCurrency(e.amount)}</td>
                                <td className="truncate">
                                  {e.remarks || (e.employee_name ? `Salary for ${e.employee_name}` : "—")}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => setViewEntry({ type: e._isSalary ? "finance" : "expense", data: e })}
                                    title="View"
                                  >
                                    <Eye size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {renderPagination()}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div>
                <p className="section-title" style={{ marginBottom: 8 }}>Transactional Panel</p>
                {renderDataViewToggle()}

                <p className="section-title" style={{ marginBottom: 12 }}>
                  {currentDeptLabel} Finance Entries
                  {dataView === "income" && " — Income"}
                  {dataView === "expenses" && " — Expenses"}
                </p>
                <FinanceTable
                  entries={filteredDeptEntries}
                  onView={(entry) => setViewEntry({ type: "finance", data: entry })}
                />
                {renderPagination()}
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