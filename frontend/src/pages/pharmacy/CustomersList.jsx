import React, { useState, useEffect } from "react";
import api from "../../api/axios.js";

export default function CustomersList() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/pharmacy/customers")
      .then(res => setData(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Patients / Customers
      </h2>
      
      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : data.length === 0 ? (
        <div className="empty-state">No customers found.</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, i) => (
                <tr key={i}>
                  <td>{item.name || "—"}</td>
                  <td>{item.phone || "—"}</td>
                  <td>{item.email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}