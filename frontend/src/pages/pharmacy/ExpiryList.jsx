import React, { useState, useEffect } from "react";
import api from "../../api/axios.js";

export default function ExpiryList() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/pharmacy/inventory/expiry")
      .then(res => setData(res.data.expiry || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>Expiry Overview</h2>
      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : data.length === 0 ? (
        <div className="empty-state">No expiry data.</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Batch</th>
                <th>Expiry Date</th>
                <th>Days Left</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, i) => (
                <tr key={i}>
                  <td>{item.medicine}</td>
                  <td>{item.batch}</td>
                  <td>{item.expiry}</td>
                  <td style={{ color: item.days <= 30 ? "#ef4444" : "#10b981" }}>
                    {item.days} days
                  </td>
                  <td>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}