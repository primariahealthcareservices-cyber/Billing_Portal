// frontend/src/components/CaredxFundsTable.jsx
import React from "react";
import { Pencil, Trash2 } from "lucide-react";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function CaredxFundsTable({ funds, onEdit, onDelete }) {
  if (!funds || funds.length === 0) {
    return (
      <div className="card empty-state">
        No funds recorded for this filter. Click "Add Funds" to log one.
      </div>
    );
  }

  return (
    <div className="card table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Fund Category</th>
            <th>Name</th>
            <th>Purpose</th>
            <th className="text-right">Amount</th>
            <th>Remarks</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {funds.map((f) => (
            <tr key={f.id}>
              <td style={{ whiteSpace: "nowrap" }}>{f.entry_date}</td>
              <td>{f.fund_category || f.category || "—"}</td>
              <td>{f.client_name || "—"}</td>
              <td className="truncate" title={f.purpose}>{f.purpose || "—"}</td>
              <td className="text-right" style={{ fontWeight: 600 }}>
                {formatCurrency(f.amount)}
              </td>
              <td className="truncate" title={f.remarks}>{f.remarks || "—"}</td>
              <td>
                <div className="actions-cell">
                  <button onClick={() => onEdit(f)} className="btn-icon" title="Edit">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => onDelete(f)} className="btn-icon btn-icon--danger" title="Delete">
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