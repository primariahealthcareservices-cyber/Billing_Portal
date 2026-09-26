// frontend/src/components/CaredxCapitalTable.jsx
import React from "react";
import { Pencil, Trash2 } from "lucide-react";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function CaredxCapitalTable({ entries, onEdit, onDelete }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="card empty-state">
        No capital entries recorded for this filter. Click "Add Capital" to log one.
      </div>
    );
  }

  return (
    <div className="card table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Capital Category</th>
            <th>Name</th>
            <th className="text-right">Amount</th>
            <th>Purpose</th>
            <th>Remarks</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td style={{ whiteSpace: "nowrap" }}>{e.entry_date}</td>
              <td>{e.category || e.fund_category}</td>
              <td>{e.client_name || "—"}</td>
              <td className="text-right" style={{ fontWeight: 600 }}>
                {formatCurrency(e.amount)}
              </td>
              <td className="truncate" title={e.purpose}>{e.purpose || "—"}</td>
              <td className="truncate" title={e.remarks}>{e.remarks || "—"}</td>
              <td>
                <div className="actions-cell">
                  <button onClick={() => onEdit(e)} className="btn-icon" title="Edit">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => onDelete(e)} className="btn-icon btn-icon--danger" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}