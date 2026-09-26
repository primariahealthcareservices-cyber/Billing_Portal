import React, { useState, useEffect } from "react";
import api from "../../api/axios.js";

export default function StockMovements() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/pharmacy/stock-movements")
      .then(res => setData(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Stock Movements
      </h2>
      
      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Batch</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Old</th>
                <th>New</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td>{item.created_at?.slice(0, 10)}</td>
                  <td>{item.batch_id}</td>
                  <td>
                    <span
                      className={`badge ${
                        item.movement_type === "IN" ? "badge-income" : "badge-expense"
                      }`}
                    >
                      {item.movement_type}
                    </span>
                  </td>
                  <td>{item.quantity}</td>
                  <td>{item.old_quantity}</td>
                  <td>{item.new_quantity}</td>
                  <td>
                    {item.reference_type} #{item.reference_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}