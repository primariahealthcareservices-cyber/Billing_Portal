import React, { useState, useEffect } from "react";
import api from "../../api/axios.js";

export default function InventoryStock() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/pharmacy/inventory")
      .then(res => setData(res.data.inventory || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>Current Stock</h2>
      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Quantity</th>
                <th>MRP</th>
                <th>Purchase Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, i) => (
                <tr key={i}>
                  <td>{item.medicine}</td>
                  <td>{item.batch}</td>
                  <td>{item.expiry}</td>
                  <td>{item.quantity}</td>
                  <td>₹{item.mrp}</td>
                  <td>₹{item.purchase_rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
