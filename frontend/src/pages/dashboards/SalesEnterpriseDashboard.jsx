// frontend/src/pages/dashboards/SalesEnterpriseDashboard.jsx
import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import Navbar from "../../components/Navbar.jsx";
import api from "../../api/axios.js";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const DEPARTMENTS = [
  "Corporate Management",
  "Office Administration",
  "CareDx",
  "Dental",
  "IT Development",
  "IT Sales",
  "MedTech",
  "PCM",
  "Research Development",
];
const currentYear = new Date().getFullYear();

const QUARTER_MONTHS = {
  Q1: ["January", "February", "March"],
  Q2: ["April", "May", "June"],
  Q3: ["July", "August", "September"],
  Q4: ["October", "November", "December"]
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

const FORMULA_CONFIG = {
  revenue_growth: {
    inputs: ['current_revenue', 'prior_revenue'],
    formulaDisplay: '(Current – Prior) / Prior × 100',
    compute: (vals) => {
      const cur = parseFloat(vals.current_revenue) || 0;
      const prior = parseFloat(vals.prior_revenue) || 0;
      if (prior === 0) return null;
      return ((cur - prior) / prior) * 100;
    }
  },
  win_rate: {
    inputs: ['closed_won', 'total_decided'],
    formulaDisplay: 'Closed-Won / Total Decided × 100',
    compute: (vals) => {
      const won = parseFloat(vals.closed_won) || 0;
      const total = parseFloat(vals.total_decided) || 0;
      if (total === 0) return null;
      return (won / total) * 100;
    }
  },
  stage_conversion: {
    inputs: ['converted', 'total_at_stage'],
    formulaDisplay: 'Converted / Total at Stage × 100',
    compute: (vals) => {
      const converted = parseFloat(vals.converted) || 0;
      const total = parseFloat(vals.total_at_stage) || 0;
      if (total === 0) return null;
      return (converted / total) * 100;
    }
  },
  pipeline_coverage: {
    inputs: ['qualified_pipeline', 'revenue_target'],
    formulaDisplay: 'Qualified Pipeline / Revenue Target',
    compute: (vals) => {
      const pipe = parseFloat(vals.qualified_pipeline) || 0;
      const target = parseFloat(vals.revenue_target) || 0;
      if (target === 0) return null;
      return pipe / target;
    }
  },
  sales_cycle_length: {
    inputs: ['total_days', 'closed_deals'],
    formulaDisplay: 'Total Days / Closed Deals',
    compute: (vals) => {
      const days = parseFloat(vals.total_days) || 0;
      const deals = parseFloat(vals.closed_deals) || 0;
      if (deals === 0) return null;
      return days / deals;
    }
  },
  cac: {
    inputs: ['total_spend', 'new_customers'],
    formulaDisplay: 'Total Spend / New Customers',
    compute: (vals) => {
      const spend = parseFloat(vals.total_spend) || 0;
      const customers = parseFloat(vals.new_customers) || 0;
      if (customers === 0) return null;
      return spend / customers;
    }
  },
  rep_productivity: {
    inputs: ['total_revenue', 'num_reps'],
    formulaDisplay: 'Total Revenue / Number of Reps',
    compute: (vals) => {
      const rev = parseFloat(vals.total_revenue) || 0;
      const reps = parseFloat(vals.num_reps) || 0;
      if (reps === 0) return null;
      return rev / reps;
    }
  },
  ramp_time: { inputs: [], formulaDisplay: null, compute: null },
  lead_response_time: { inputs: [], formulaDisplay: null, compute: null },
  nrr: {
    inputs: ['starting_arr', 'expansion', 'contraction', 'churn'],
    formulaDisplay: '(Starting ARR + Expansion – Contraction – Churn) / Starting ARR × 100',
    compute: (vals) => {
      const start = parseFloat(vals.starting_arr) || 0;
      const exp = parseFloat(vals.expansion) || 0;
      const contr = parseFloat(vals.contraction) || 0;
      const churn = parseFloat(vals.churn) || 0;
      if (start === 0) return null;
      return ((start + exp - contr - churn) / start) * 100;
    }
  },
  quota_attainment: {
    inputs: ['actual_revenue', 'quota'],
    formulaDisplay: 'Actual Revenue / Quota × 100',
    compute: (vals) => {
      const actual = parseFloat(vals.actual_revenue) || 0;
      const quota = parseFloat(vals.quota) || 0;
      if (quota === 0) return null;
      return (actual / quota) * 100;
    }
  },
  forecast_accuracy: {
    inputs: ['actual_forecast', 'forecast'],
    formulaDisplay: '(1 – |Actual – Forecast| / Forecast) × 100',
    compute: (vals) => {
      const actual = parseFloat(vals.actual_forecast) || 0;
      const forecast = parseFloat(vals.forecast) || 0;
      if (forecast === 0) return null;
      return (1 - Math.abs(actual - forecast) / forecast) * 100;
    }
  }
};

const KPI_KEYS = Object.keys(FORMULA_CONFIG);

const CATEGORIES = {
  '📈 Growth KPIs': ['revenue_growth', 'win_rate', 'stage_conversion', 'pipeline_coverage'],
  '⚡ Efficiency KPIs': ['sales_cycle_length', 'cac', 'rep_productivity', 'ramp_time', 'lead_response_time'],
  '🎯 Predictability KPIs': ['nrr', 'quota_attainment', 'forecast_accuracy']
};

export default function SalesEnterpriseDashboard() {
  const [kpis, setKpis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);

  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState("Q1");
  const [department, setDepartment] = useState("IT");
  const [month, setMonth] = useState("January");

  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterMonth, setFilterMonth] = useState("");

  const [viewingKpi, setViewingKpi] = useState(null);

  const [formData, setFormData] = useState(
    KPI_KEYS.reduce((acc, key) => ({ ...acc, [key]: "" }), {})
  );
  const [rawInputs, setRawInputs] = useState({});

  const computeKPIs = useCallback(() => {
    const newKpis = {};
    KPI_KEYS.forEach((key) => {
      const config = FORMULA_CONFIG[key];
      if (config.compute) {
        const value = config.compute(rawInputs);
        newKpis[key] = (value !== null && !isNaN(value))
          ? String(Math.round(value * 100) / 100)
          : "";
      }
    });
    setFormData((prev) => ({ ...prev, ...newKpis }));
  }, [rawInputs]);

  useEffect(() => {
    if (!editing) {
      computeKPIs();
    }
  }, [computeKPIs, editing]);

  const fetchKpis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/salesenterprise/kpis");
      setKpis(res.data.kpis || []);
    } catch (err) {
      toast.error("Failed to load KPIs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  const handleRawChange = (e) => {
    const { name, value } = e.target;
    setRawInputs((prev) => ({ ...prev, [name]: value }));
  };

  const handleDirectChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!year || !quarter || !department || !month) {
      toast.error("Year, Quarter, Department, and Month are required.");
      return;
    }

    if (!editing) {
      const duplicate = kpis.some(
        (k) =>
          k.year === parseInt(year) &&
          k.quarter === quarter &&
          k.department === department &&
          k.month === month
      );
      if (duplicate) {
        toast.error(
          `A KPI record already exists for ${department} – ${month} ${year} (${quarter}).`
        );
        return;
      }
    }

    const payload = { year: parseInt(year), quarter, department, month, ...formData };
    for (let key in payload) {
      if (payload[key] === "") payload[key] = null;
    }

    try {
      if (editing) {
        await api.put(`/salesenterprise/kpis/${editing}`, payload);
        toast.success("KPI updated");
      } else {
        await api.post("/salesenterprise/kpis", payload);
        toast.success("KPI added");
      }
      resetForm();
      fetchKpis();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to save KPI";
      toast.error(msg);
    }
  };

  const handleEdit = (kpi) => {
    setEditing(kpi.id);
    setYear(kpi.year);
    setQuarter(kpi.quarter);
    setDepartment(kpi.department || "IT");
    setMonth(kpi.month || "January");
    const newFormData = {};
    KPI_KEYS.forEach((key) => {
      newFormData[key] = kpi[key] ?? "";
    });
    setFormData(newFormData);
    setRawInputs({});
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this KPI record?")) return;
    try {
      await api.delete(`/salesenterprise/kpis/${id}`);
      toast.success("Deleted");
      fetchKpis();
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  const resetForm = () => {
    setEditing(null);
    setYear(currentYear);
    setQuarter("Q1");
    setDepartment("IT");
    setMonth("January");
    setFormData(KPI_KEYS.reduce((acc, key) => ({ ...acc, [key]: "" }), {}));
    setRawInputs({});
  };

  const cancelEdit = resetForm;
  const availableMonths = QUARTER_MONTHS[quarter] || [];

  const filteredKpis = kpis.filter(k => {
    const deptMatch = filterDepartment ? k.department === filterDepartment : true;
    const monthMatch = filterMonth ? k.month === filterMonth : true;
    return deptMatch && monthMatch;
  });

  const renderKpiCard = (key) => {
    const config = FORMULA_CONFIG[key];
    const isFormula = config.inputs && config.inputs.length > 0;
    const displayName = KPI_DISPLAY_NAMES[key] || key.replace(/_/g, " ").toUpperCase();

    const cardStyle = {
      flex: "1 1 220px",
      minWidth: "200px",
      margin: "6px",
      padding: "10px 12px",
      border: "1px solid #e2e8f0",
      borderRadius: "8px",
      background: "#ffffff",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
    };

    if (editing) {
      return (
        <div key={key} style={cardStyle}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "#2d3748", marginBottom: "4px" }}>
            {displayName}
          </div>
          <input
            type="number"
            step="0.01"
            name={key}
            value={formData[key] || ""}
            onChange={handleDirectChange}
            placeholder="—"
            className="form-control"
            style={{ width: "100%", fontSize: "0.9rem" }}
          />
        </div>
      );
    }

    if (isFormula) {
      return (
        <div key={key} style={cardStyle}>
          <div style={{ fontSize: "0.8rem", fontWeight: "600", color: "#1a202c", marginBottom: "2px" }}>
            {displayName}
          </div>
          <div style={{ fontSize: "0.65rem", color: "#4a5568", fontFamily: "monospace", marginBottom: "6px" }}>
            {config.formulaDisplay}
          </div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "4px" }}>
            {config.inputs.map((inp) => (
              <input
                key={inp}
                type="number"
                step="0.01"
                name={inp}
                value={rawInputs[inp] || ""}
                onChange={handleRawChange}
                placeholder={inp.replace(/_/g, " ")}
                className="form-control"
                style={{ flex: "1", minWidth: "50px", fontSize: "0.75rem", padding: "4px" }}
              />
            ))}
          </div>
          <input
            type="text"
            name={key}
            value={formData[key] || ""}
            readOnly
            className="form-control"
            style={{
              background: "#edf2f7",
              fontWeight: "bold",
              fontSize: "0.85rem",
              textAlign: "center",
              padding: "2px 4px",
              width: "100%",
              marginTop: "2px"
            }}
            placeholder="computed result"
          />
        </div>
      );
    } else {
      return (
        <div key={key} style={cardStyle}>
          <div style={{ fontSize: "0.8rem", fontWeight: "600", color: "#1a202c", marginBottom: "4px" }}>
            {displayName}
          </div>
          <input
            type="number"
            step="0.01"
            name={key}
            value={formData[key] || ""}
            onChange={handleDirectChange}
            placeholder="Enter value"
            className="form-control"
            style={{ width: "100%", fontSize: "0.9rem" }}
          />
        </div>
      );
    }
  };

  const renderCategory = (title, keys) => {
    const isEfficiency = title === "⚡ Efficiency KPIs";
    return (
      <div key={title} style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "16px 0 8px", color: "#1a202c", fontSize: "1.1rem", borderBottom: "2px solid #e2e8f0", paddingBottom: "4px" }}>
          {title}
        </h3>
        <div style={{
          display: isEfficiency ? "grid" : "flex",
          flexWrap: isEfficiency ? "unset" : "wrap",
          gridTemplateColumns: isEfficiency ? "repeat(3, 1fr)" : undefined,
          gap: isEfficiency ? "12px" : "0",
          alignItems: "stretch"
        }}>
          {keys.map((key) => {
            const card = renderKpiCard(key);
            if (isEfficiency) {
              return React.cloneElement(card, {
                style: { ...card.props.style, width: "100%", margin: 0, flex: "none", minWidth: "unset" }
              });
            }
            return card;
          })}
        </div>
      </div>
    );
  };

  const ViewModal = ({ kpi, onClose }) => {
    if (!kpi) return null;
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
      }}>
        <div style={{
          background: "#fff", padding: "24px", borderRadius: "12px", maxWidth: "600px", width: "90%", maxHeight: "80vh", overflowY: "auto"
        }}>
          <h3 style={{ marginTop: 0, borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
            KPI Details – {kpi.department} ({kpi.quarter} {kpi.year})
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", margin: "16px 0" }}>
            {KPI_KEYS.map(key => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f0f0f0", padding: "4px 0" }}>
                <span style={{ fontWeight: "500", color: "#4a5568" }}>{KPI_DISPLAY_NAMES[key]}:</span>
                <span>{kpi[key] ?? "—"}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={onClose} style={{ marginTop: "8px" }}>Close</button>
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <Navbar title="Sales Enterprise Portal" roleColor="#f97316" />
      <main className="page-main">
        <div className="card" style={{ marginBottom: 24 }}>
          <h2>{editing ? "Edit" : "Add"} KPI for Quarter</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Year</label>
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="form-control" required />
              </div>
              <div className="form-group">
                <label>Quarter</label>
                <select value={quarter} onChange={(e) => {
                  setQuarter(e.target.value);
                  const months = QUARTER_MONTHS[e.target.value];
                  if (months && months.length) setMonth(months[0]);
                }} className="form-control" required>
                  {QUARTERS.map((q) => (<option key={q} value={q}>{q}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label>Department</label>
                <select value={department} onChange={(e) => setDepartment(e.target.value)} className="form-control" required>
                  {DEPARTMENTS.map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label>Month</label>
                <select value={month} onChange={(e) => setMonth(e.target.value)} className="form-control" required>
                  {availableMonths.map((m) => (<option key={m} value={m}>{m}</option>))}
                </select>
              </div>
            </div>

            {editing ? (
              <div className="form-row" style={{ flexWrap: "wrap" }}>
                {KPI_KEYS.map((key) => renderKpiCard(key))}
              </div>
            ) : (
              Object.entries(CATEGORIES).map(([title, keys]) => renderCategory(title, keys))
            )}

            <div className="modal-footer" style={{ marginTop: 16 }}>
              {editing && (<button type="button" className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>)}
              <button type="submit" className="btn btn-primary">{editing ? "Update" : "Save"}</button>
            </div>
          </form>
        </div>

        <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ marginRight: "6px" }}>Filter by Department:</label>
            <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)} className="form-control" style={{ display: "inline-block", width: "auto" }}>
              <option value="">All</option>
              {DEPARTMENTS.map(d => (<option key={d} value={d}>{d}</option>))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ marginRight: "6px" }}>Filter by Month:</label>
            <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="form-control" style={{ display: "inline-block", width: "auto" }}>
              <option value="">All</option>
              {MONTHS.map(m => (<option key={m} value={m}>{m}</option>))}
            </select>
          </div>
          {(filterDepartment || filterMonth) && (
            <button className="btn btn-secondary" onClick={() => { setFilterDepartment(""); setFilterMonth(""); }} style={{ fontSize: "0.8rem" }}>
              Clear Filters
            </button>
          )}
        </div>

        <h3>Existing KPIs</h3>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="card table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Year</th><th>Quarter</th><th>Department</th><th>Month</th>
                  <th>Rev Growth</th><th>Win Rate</th><th>Stage Conv</th><th>Pipeline Cov</th>
                  <th>Sales Cycle</th><th>CAC</th><th>Rep Prod</th><th>Ramp</th>
                  <th>Lead Resp</th><th>NRR</th><th>Quota Att</th><th>Forecast Acc</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredKpis.map((k) => (
                  <tr key={k.id}>
                    <td>{k.year}</td>
                    <td>{k.quarter}</td>
                    <td>{k.department || "—"}</td>
                    <td>{k.month || "—"}</td>
                    <td>{k.revenue_growth ?? "—"}</td>
                    <td>{k.win_rate ?? "—"}</td>
                    <td>{k.stage_conversion ?? "—"}</td>
                    <td>{k.pipeline_coverage ?? "—"}</td>
                    <td>{k.sales_cycle_length ?? "—"}</td>
                    <td>{k.cac ?? "—"}</td>
                    <td>{k.rep_productivity ?? "—"}</td>
                    <td>{k.ramp_time ?? "—"}</td>
                    <td>{k.lead_response_time ?? "—"}</td>
                    <td>{k.nrr ?? "—"}</td>
                    <td>{k.quota_attainment ?? "—"}</td>
                    <td>{k.forecast_accuracy ?? "—"}</td>
                    <td>
                      <button className="btn-icon" onClick={() => setViewingKpi(k)} title="View">👁️</button>
                      <button className="btn-icon" onClick={() => handleEdit(k)} title="Edit">✏️</button>
                      <button className="btn-icon btn-icon--danger" onClick={() => handleDelete(k.id)} title="Delete">🗑️</button>
                    </td>
                  </tr>
                ))}
                {filteredKpis.length === 0 && (
                  <tr><td colSpan="17" style={{ textAlign: "center", padding: "20px" }}>No KPIs match the filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {viewingKpi && <ViewModal kpi={viewingKpi} onClose={() => setViewingKpi(null)} />}
    </div>
  );
}