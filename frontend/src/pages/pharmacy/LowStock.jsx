import React, { useState, useEffect } from "react";
import api from "../../api/axios.js";

export default function LowStock() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/pharmacy/inventory/low-stock")
      .then(res => setData(res.data.low_stock || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>Low Stock Items</h2>
      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : data.length === 0 ? (
        <div className="empty-state">All items are well stocked.</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Current Stock</th>
                <th>Reorder Level</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, i) => (
                <tr key={i}>
                  <td>{item.medicine}</td>
                  <td style={{ color: "#ef4444", fontWeight: 600 }}>{item.stock}</td>
                  <td>{item.reorder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}