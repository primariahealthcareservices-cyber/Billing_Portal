import React, { useState, useEffect } from "react";
import api from "../../api/axios.js";

export default function InventoryBatches() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/pharmacy/inventory/batches")
      .then(res => setData(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>Batch Stock</h2>
      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Medicine</th>
                <th>Expiry</th>
                <th>Qty</th>
                <th>MRP</th>
                <th>Rate</th>
                <th>Vendor</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td>{item.batch_number}</td>
                  <td>{item.medicine_name}</td>
                  <td>{item.expiry_date}</td>
                  <td>{item.quantity}</td>
                  <td>₹{item.mrp}</td>
                  <td>₹{item.purchase_rate}</td>
                  <td>{item.vendor_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}