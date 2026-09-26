import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Printer, Search } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../api/axios.js";

export default function InvoicesList() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get("/pharmacy/sales");
        const data = Array.isArray(res.data) ? res.data : res.data.sales || [];
        if (!cancelled) setSales(data);
      } catch (err) {
        console.error("Failed to load invoices:", err);
        toast.error("Failed to load invoices.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = sales.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(s.sale_number || "").toLowerCase().includes(q) ||
      String(s.customer_name || "").toLowerCase().includes(q) ||
      String(s.customer_phone || "").toLowerCase().includes(q)
    );
  });

  const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

  return (
    <div style={{ padding: "1.5rem" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Invoices</h2>

        <div style={{ position: "relative" }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              opacity: 0.5,
            }}
          />
          <input
            className="form-control"
            style={{ paddingLeft: 32, width: 240 }}
            placeholder="Search by number / customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No invoices found.</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Phone</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th style={{ width: 100, textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.sale_number}</td>
                  <td>{s.sale_date || "—"}</td>
                  <td>{s.customer_name || "Walk-in"}</td>
                  <td>{s.customer_phone || "—"}</td>
                  <td style={{ textAlign: "right" }}>{fmt(s.grand_total)}</td>
                  <td>{s.payment_method || "—"}</td>
                  <td>{s.status || "—"}</td>
                  <td style={{ textAlign: "center" }}>
                    <Link
                      to={`/dashboard/pharmacy/invoices/${s.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 10px",
                        background: "#2563eb",
                        color: "white",
                        borderRadius: 4,
                        fontSize: 12,
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      <Printer size={14} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}