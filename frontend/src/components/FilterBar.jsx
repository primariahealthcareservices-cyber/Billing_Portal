// frontend/src/components/FilterBar.jsx
import React, { useEffect } from "react";
import { Filter, Download, Plus, RefreshCw } from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad2 = (n) => String(n).padStart(2, "0");

/** Return {start, end} ISO YYYY-MM-DD for a quarter of a year. */
const quarterRange = (year, quarter) => {
  const y = Number(year);
  if (!y) return { start: "", end: "" };
  if (!quarter) {
    // All → Jan 1 → Dec 31
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  const q = Number(quarter);
  const startMonth = (q - 1) * 3;       // 0, 3, 6, 9
  const endMonth = startMonth + 2;      // 2, 5, 8, 11
  const startDay = 1;
  const endDay = new Date(y, endMonth + 1, 0).getDate(); // last day of endMonth
  return {
    start: `${y}-${pad2(startMonth + 1)}-${pad2(startDay)}`,
    end: `${y}-${pad2(endMonth + 1)}-${pad2(endDay)}`,
  };
};

export default function FilterBar({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  onReset,
  onExport,
  onAddNew,
  searchTerm,
  onSearchChange,

  // ✅ NEW — quarter / year controls
  quarter,
  year,
  onQuarterChange,
  onYearChange,
}) {
  // When quarter or year changes, recompute start/end dates
  useEffect(() => {
    if (year === undefined || onQuarterChange === undefined) return;
    if (onStartDateChange === undefined || onEndDateChange === undefined) return;

    const { start, end } = quarterRange(year, quarter);
    if (start) onStartDateChange(start);
    if (end) onEndDateChange(end);
  }, [quarter, year]); // deliberately not including the change callbacks

  const yearOptions = [];
  const currentYear = new Date().getFullYear();
  for (let i = 0; i < 10; i++) yearOptions.push(currentYear - i);

  const showQuarterControls = onQuarterChange && onYearChange;

  return (
    <div className="card filter-bar">
      {showQuarterControls && (
        <>
          <div className="form-group">
            <label className="form-label">Quarter</label>
            <select
              className="form-control"
              value={quarter ?? ""}
              onChange={(e) => onQuarterChange(e.target.value)}
            >
              <option value="">All</option>
              <option value="1">Q1 (Jan–Mar)</option>
              <option value="2">Q2 (Apr–Jun)</option>
              <option value="3">Q3 (Jul–Sep)</option>
              <option value="4">Q4 (Oct–Dec)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Year</label>
            <select
              className="form-control"
              value={year ?? currentYear}
              onChange={(e) => onYearChange(e.target.value)}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="form-group">
        <label className="form-label">Start Date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="form-control"
        />
      </div>
      <div className="form-group">
        <label className="form-label">End Date</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="form-control"
        />
      </div>

      {onSearchChange && (
        <div className="form-group form-group--grow">
          <label className="form-label">Search</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by employee or remarks"
            className="form-control"
          />
        </div>
      )}

      <div className="filter-actions">
        <button onClick={onApply} className="btn btn-primary">
          <Filter size={16} /> Apply Filter
        </button>
        <button onClick={onReset} className="btn btn-secondary">
          <RefreshCw size={16} /> Reset
        </button>
        {onExport && (
          <button onClick={onExport} className="btn btn-secondary">
            <Download size={16} /> Export CSV
          </button>
        )}
      </div>

      {onAddNew && (
        <div className="filter-actions filter-actions--push">
          <button onClick={onAddNew} className="btn btn-primary">
            <Plus size={16} /> Add Entry
          </button>
        </div>
      )}
    </div>
  );
}