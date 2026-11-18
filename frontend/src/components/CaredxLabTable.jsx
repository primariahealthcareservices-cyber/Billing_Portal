// frontend/src/components/CaredxLabTable.jsx
import React from "react";
import { Pencil, Trash2 } from "lucide-react";

const formatCurrency = (value) => {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(number);
};

export default function CaredxLabTable({ entries, onEdit, onDelete }) {
  if (!entries || entries.length === 0) {
    return <div className="card empty-state">No lab entries found for the selected filters.</div>;
  }

  return (
    <div className="card table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Employee</th>
            <th>Patient</th>
            <th>Test</th>
            <th className="text-right">Total Paid</th>
            <th className="text-right">Cash</th>
            <th className="text-right">Online</th>
            <th>Payment Type</th>
            <th className="text-right">Paid to Other Labs</th>
            <th>Referral By</th>
            <th className="text-right">Referral Amount</th>
            <th>Remarks</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td style={{ whiteSpace: "nowrap" }}>{entry.entry_date}</td>
              <td>{entry.employee_name || "—"}</td>
              <td>{entry.patient_name || "—"}</td>
              <td>{entry.test_name || "—"}</td>
              <td className="text-right">{formatCurrency(entry.total_amount_paid)}</td>
              <td className="text-right">{formatCurrency(entry.cash)}</td>
              <td className="text-right">{formatCurrency(entry.online)}</td>
              <td>{entry.payment_type || "—"}</td>
              <td className="text-right">{formatCurrency(entry.paid_to_other_labs)}</td>
              <td>{entry.referral_by || "—"}</td>
              <td className="text-right">{formatCurrency(entry.referral_amount)}</td>
              <td>{entry.expense_details || "—"}</td>
              <td className="text-right">
                <div style={{ display: "inline-flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onEdit(entry)}
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onDelete(entry)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
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