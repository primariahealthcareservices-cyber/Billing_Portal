// frontend/src/components/FinanceDashboard.jsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import Navbar from "./Navbar.jsx";
import FilterBar from "./FilterBar.jsx";
import StatCards from "./StatCards.jsx";
import FinanceCharts from "./FinanceCharts.jsx";
import FinanceTable from "./FinanceTable.jsx";
import FinanceEntryForm from "./FinanceEntryForm.jsx";
import api from "../api/axios.js";

const PAGE_SIZE = 25;

// ---------------------------------------------------------------
// Standard categories — same across every department for Income & Expenses
// ---------------------------------------------------------------
const STANDARD_CATEGORIES = [
  "Salary & Payrolls",
  "Corpus Fund",
  "Referrals & Deposits",
  "Products & Innovation",
  "General Operations",
  "Camps & Events",
  "Marketing & Promos",
  "Travel & Hospitality",
  "Miscellaneous",
];

// Special filter token used for the Capital entry-type button
const CAPITAL_FILTER = "Capital";

// Shared style for the category buttons (box shape, centered text)
const categoryBtnStyle = {
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 13,
  minHeight: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  lineHeight: 1.2,
  whiteSpace: "normal",
  wordBreak: "break-word",
};

// ✅ Timezone-safe date formatter
const fmtLocalDate = (d) => {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

const firstOfMonth = () => {
  const d = new Date();
  return fmtLocalDate(new Date(d.getFullYear(), d.getMonth(), 1));
};
const todayStr = () => fmtLocalDate(new Date());

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

export default function FinanceDashboard({ department, title, roleColor, onCopperBook }) {
  const apiBase = department.toLowerCase().replace(/\s/g, "");
  const supportsExcelImportExport = department === "PCM";
  const isCorporate = department === "Corporate";

  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(todayStr());
  const [searchTerm, setSearchTerm] = useState("");

  // ✅ quarter / year for FilterBar
  const [quarter, setQuarter] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));

  // ✅ transaction type filter (Income / Expenses / Capital)
  const [typeFilter, setTypeFilter] = useState("");

  // ✅ NEW — category filter (server-side)
  const [selectedCategory, setSelectedCategory] = useState(null);

  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  const fileInputRef = useRef(null);

  // ✅ Effect: quarter / year → start / end dates
  useEffect(() => {
    const y = parseInt(year, 10);
    if (isNaN(y)) return;

    const q = quarter === "" ? null : parseInt(quarter, 10);
    let start, end;

    if (q === null) {
      start = new Date(y, 0, 1);
      end = new Date(y, 11, 31);
    } else if (q === 1) {
      start = new Date(y, 0, 1); end = new Date(y, 2, 31);
    } else if (q === 2) {
      start = new Date(y, 3, 1); end = new Date(y, 5, 30);
    } else if (q === 3) {
      start = new Date(y, 6, 1); end = new Date(y, 8, 30);
    } else if (q === 4) {
      start = new Date(y, 9, 1); end = new Date(y, 11, 31);
    } else {
      return;
    }

    setStartDate(fmtLocalDate(start));
    setEndDate(fmtLocalDate(end));
  }, [quarter, year]);

  const fetchOptions = useCallback(async () => {
    try {
      const res = await api.get(`/${apiBase}/options`);
      setOptions(res.data);
    } catch {
      toast.error("Failed to load form options.");
    }
  }, [apiBase]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { start_date: startDate, end_date: endDate };
      if (searchTerm) params.search = searchTerm;
      if (typeFilter) params.entry_type = typeFilter;
      if (selectedCategory) params.category = selectedCategory;

      const [entriesRes, summaryRes] = await Promise.all([
        api.get(`/${apiBase}/entries`, { params }),
        api.get(`/${apiBase}/summary`, {
          params: { start_date: startDate, end_date: endDate },
        }),
      ]);
      setEntries(entriesRes.data.entries);
      setSummary(summaryRes.data);
    } catch (err) {
      toast.error("Failed to load finance data.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, startDate, endDate, searchTerm, typeFilter, selectedCategory]);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);
  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, searchTerm, department, typeFilter, selectedCategory]);

  // ✅ Split entries by type
  const incomeEntries = useMemo(() => entries.filter(e => e.entry_type === "Income"), [entries]);
  const expenseEntries = useMemo(() => entries.filter(e => e.entry_type === "Expenses"), [entries]);
  const capitalEntries = useMemo(() => entries.filter(e => e.entry_type === "Capital"), [entries]);

  const filteredEntries = useMemo(() => {
    if (typeFilter === "Income") return incomeEntries;
    if (typeFilter === "Expenses") return expenseEntries;
    if (typeFilter === "Capital") return capitalEntries;
    return entries;
  }, [entries, typeFilter, incomeEntries, expenseEntries, capitalEntries]);

  const totalEntries = filteredEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageNumbers = buildPageNumbers(safePage, totalPages);
  const rangeStart = totalEntries === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, totalEntries);

  const paginatedEntries = useMemo(
    () => filteredEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredEntries, safePage]
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleReset = () => {
    setStartDate(firstOfMonth());
    setEndDate(todayStr());
    setSearchTerm("");
    setQuarter("");
    setYear(String(new Date().getFullYear()));
    setTypeFilter("");
    setSelectedCategory(null);
    setCurrentPage(1);
  };

  const handleDelete = async (entry) => {
    if (!window.confirm(`Delete this ${entry.entry_type.toLowerCase()} entry dated ${entry.entry_date}?`)) return;
    try {
      await api.delete(`/${apiBase}/entries/${entry.id}`);
      toast.success("Entry deleted.");
      fetchData();
    } catch {
      toast.error("Failed to delete entry.");
    }
  };

  const handleExportCsv = () => {
    if (!filteredEntries.length) {
      toast.error("No entries to export.");
      return;
    }
    const headers = ["Date", "Type", "Category", "Patient Name", "Patient Place", "Generated By", "Revenue Type", "Amount", "Purpose", "Remarks"];
    const rows = filteredEntries.map((e) => [
      e.entry_date, e.entry_type, e.category, e.patient_name || "", e.patient_place || "",
      e.generated_by || "", e.revenue_type || "", e.amount, e.purpose || "",
      (e.remarks || "").replace(/,/g, ";"),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${department}_Finance_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = async () => {
    try {
      const res = await api.get(`/${apiBase}/export`, {
        params: { start_date: startDate, end_date: endDate },
        responseType: "blob",
      });
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${department}_Finance_${startDate}_to_${endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export Excel file.");
    }
  };

  const handleExport = () => {
    if (supportsExcelImportExport) handleExportExcel();
    else handleExportCsv();
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
      const res = await api.post(`/${apiBase}/import`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { imported, errors } = res.data;
      if (imported > 0) toast.success(`Imported ${imported} entr${imported === 1 ? "y" : "ies"}.`);
      if (errors && errors.length) toast.error(`${errors.length} row(s) skipped — check the sheet formatting.`);
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to import the Excel file.";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const openNewEntry = () => {
    setEditingEntry(null);
    setFormOpen(true);
  };

  const openEditEntry = (entry) => {
    setEditingEntry(entry);
    setFormOpen(true);
  };

  // ---------------------------------------------------------------
  // ✅ Handlers for the Categories panel
  // ---------------------------------------------------------------
  const handleAllCategories = () => {
    setSelectedCategory(null);
    setTypeFilter("");
  };

  const handleCategorySelect = (cat) => {
    setSelectedCategory(cat);
    // If Capital entry-type filter was active, drop it when picking a real category
    if (typeFilter === CAPITAL_FILTER) setTypeFilter("");
  };

  const handleCapitalSelect = () => {
    setTypeFilter(CAPITAL_FILTER);
    setSelectedCategory(null);
  };

  // ---------------------------------------------------------------
  // ✅ Categories Panel — 6 per row (1 × 6), box-style buttons, with Capital
  // ---------------------------------------------------------------
  const renderCategoryPanel = () => (
    <div className="card" style={{ marginBottom: 16 }}>
      <p className="section-title" style={{ marginBottom: 12 }}>Categories</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {/* Row 1: All Categories + first 5 categories */}
        <button
          type="button"
          className={`btn ${!selectedCategory && typeFilter !== CAPITAL_FILTER ? "btn-primary" : "btn-secondary"}`}
          onClick={handleAllCategories}
          style={categoryBtnStyle}
        >
          All Categories
        </button>

       {STANDARD_CATEGORIES.map((cat) => (
  <button
    key={cat}
    type="button"
    className={`btn ${selectedCategory === cat ? "btn-primary" : "btn-secondary"}`}
    onClick={() => handleCategorySelect(cat)}
    style={categoryBtnStyle}
  >
    {cat}
  </button>
))}
        {/* Capital — filters by entry_type=Capital */}
       {/* Capital — filters by entry_type=Capital (Corporate only) */}
{isCorporate && (
  <button
    type="button"
    className={`btn ${typeFilter === CAPITAL_FILTER ? "btn-primary" : "btn-secondary"}`}
    onClick={handleCapitalSelect}
    style={categoryBtnStyle}
    title="Show Capital entries only"
  >
    Capital
  </button>
)}

        {/* Clear — last cell */}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleAllCategories}
          style={{ ...categoryBtnStyle, gap: 6 }}
          title="Clear category filter"
        >
          <RotateCcw size={14} /> Clear
        </button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <Navbar title={title} roleColor={roleColor} onCopperBook={onCopperBook} />

      <main className="page-main">
        <FilterBar
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onApply={fetchData}
          onReset={handleReset}
          onExport={handleExport}
          onAddNew={openNewEntry}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          quarter={quarter}
          year={year}
          onQuarterChange={setQuarter}
          onYearChange={setYear}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          showTypeFilter={isCorporate}
        />

        {supportsExcelImportExport && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm"
              style={{ display: "none" }}
              onChange={handleImportFileChange}
            />
            <button type="button" className="btn btn-secondary" onClick={handleImportClick} disabled={importing}>
              {importing ? "Importing..." : "Import Excel"}
            </button>
          </div>
        )}

        {/* ✅ Categories Panel */}
        {renderCategoryPanel()}

        {summary && (
          <StatCards
            totalIncome={summary.total_income}
            totalExpenses={summary.total_expenses}
            totalCapital={summary.total_capital}
            profit={summary.profit}
            entryCount={summary.entry_count}
            showCapital={isCorporate}
          />
        )}

        {summary && (
          <FinanceCharts
            trend={summary.trend}
            categoryBreakdown={summary.category_breakdown}
            showCapital={isCorporate}
          />
        )}

        <div>
          <p className="section-title" style={{ marginBottom: 12 }}>
            Finance Entries
            {typeFilter && <span style={{ fontSize: 14, color: "#6b7280", marginLeft: 8 }}>({typeFilter})</span>}
            {selectedCategory && <span style={{ fontSize: 14, color: "#6b7280", marginLeft: 8 }}>— {selectedCategory}</span>}
          </p>
          {loading ? (
            <div className="card empty-state">Loading...</div>
          ) : (
            <>
              <FinanceTable
                entries={paginatedEntries}
                onEdit={openEditEntry}
                onDelete={handleDelete}
              />

              {totalEntries > 0 && (
                <div
                  className="card"
                  style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12,
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
            </>
          )}
        </div>
      </main>

      <FinanceEntryForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={fetchData}
        department={department}
        options={options}
        editingEntry={editingEntry}
      />
    </div>
  );
}