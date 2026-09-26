import React, { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

const ReportTabs = ["Sales", "Purchase", "Profit", "Expenses", "Stock", "Expiry", "Vendors"];

export default function Reports() {
  const [activeTab, setActiveTab] = useState("Sales");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const res = await api.get(`/pharmacy/reports/${activeTab.toLowerCase()}`, { params });
      setData(res.data);
    } catch {
      toast.error("Failed to load report.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "1.5rem" }}>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>Reports</h2>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {ReportTabs.map(tab => (
          <button
            key={tab}
            className={`btn ${activeTab === tab ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "1.5rem" }}>
        <div className="form-group">
          <label className="form-label">From</label>
          <input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">To</label>
          <input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={fetchReport}>Generate</button>
      </div>
      {loading ? <div className="empty-state">Loading...</div> : data ? (
        <div>
          <pre style={{ background: "#f8fafc", padding: "1rem", borderRadius: "8px" }}>{JSON.stringify(data, null, 2)}</pre>
          {activeTab === "Sales" && data.sales && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.sales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="sale_date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="grand_total" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : (
        <div className="empty-state">Select date range and click Generate.</div>
      )}
    </div>
  );
}