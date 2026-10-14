// frontend/src/components/CaredxLabTable.jsx
import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import RemarkCell, { remarkCellStyle } from "./RemarkCell.jsx";

const formatCurrency = (value) => {
  if (!value) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
};

export default function CaredxLabTable({ entries, onEdit, onDelete }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="card empty-state">
        No lab data entries found for this filter. Click "Add Entry" or import an Excel sheet to get started.
      </div>
    );
  }

  return (
    <div className="card table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Patient</th>
            <th>Test</th>
            <th className="text-right">Total Paid</th>
            <th>Employee</th>
            <th className="text-right">Cash</th>
            <th className="text-right">Online</th>
            <th className="text-right">Paid to Other Labs</th>
            <th className="text-right">RMP</th>
            <th className="text-right">Salaries/Expense</th>
            <th style={{ minWidth: remarkCellStyle.minWidth }}>Expense Details</th>
            <th>Referral By</th>
            <th className="text-right">Referral Amount</th>
            <th className="text-right">Sales</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td style={{ whiteSpace: "nowrap" }}>{e.entry_date}</td>
              <td>{e.patient_name}</td>
              <td className="truncate" title={e.test_name}>{e.test_name}</td>
              <td className="text-right" style={{ fontWeight: 600 }}>{formatCurrency(e.total_amount_paid)}</td>
              <td>{e.employee_name || "—"}</td>
              <td className="text-right">{formatCurrency(e.cash)}</td>
              <td className="text-right">{formatCurrency(e.online)}</td>
              <td className="text-right">{formatCurrency(e.paid_to_other_labs)}</td>
              <td className="text-right">{formatCurrency(e.rmp)}</td>
              <td className="text-right">{formatCurrency(e.salaries_expense)}</td>
              <td style={remarkCellStyle}>
                <RemarkCell text={e.expense_details} />
              </td>
              <td>{e.referral_by || "—"}</td>
              <td className="text-right">{formatCurrency(e.referral_amount)}</td>
              <td className="text-right">{formatCurrency(e.sales)}</td>
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