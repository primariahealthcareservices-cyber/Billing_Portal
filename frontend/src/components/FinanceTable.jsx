// frontend/src/components/FinanceTable.jsx
import React from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";

const SALARY_CAT = "Salary & Payrolls";

const formatCurrency = (value) => {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
};

export const isSalaryEntry = (entry) => {
  if (!entry) return false;
  if (entry._isSalary || entry.is_salary || entry.isSalary) return true;
  const cat = (entry.category || "").toString().toLowerCase();
  return cat === "salary & payrolls" || cat.includes("salary") || cat.includes("payroll");
};

export const isCorpusEntry = (entry) => {
  if (!entry) return false;
  if (entry._isCorpus) return true;
  const cat = (entry.category || "").toString().toLowerCase();
  return cat.includes("corpus");
};

const paymentBadgeStyle = {
  padding: "2px 8px",
  borderRadius: "12px",
  fontSize: "12px",
  fontWeight: 600,
  display: "inline-block",
};

const renderPaymentBadge = (pt) => {
  if (!pt) return "—";
  const palettes = {
    UPI: { backgroundColor: "#e0e7ff", color: "#3730a3" },
    Cash: { backgroundColor: "#dcfce7", color: "#166534" },
    Card: { backgroundColor: "#fee2e2", color: "#991b1b" },
    Cheque: { backgroundColor: "#fef3c7", color: "#92400e" },
    NEFT: { backgroundColor: "#dbeafe", color: "#1e40af" },
    Bank: { backgroundColor: "#ede9fe", color: "#5b21b6" },
  };
  return (
    <span
      style={{
        ...paymentBadgeStyle,
        ...(palettes[pt] || { backgroundColor: "#f3f4f6", color: "#374151" }),
      }}
    >
      {pt}
    </span>
  );
};

export default function FinanceTable({
  entries = [],
  onView,
  onEdit,
  onDelete,
  showEmployeeName = true,
  showClientName = true,
  currentDepartment,
}) {
  if (!entries.length) {
    return <div className="card empty-state">No entries found.</div>;
  }

  const hasSalary = entries.some(isSalaryEntry);

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------
  const renderHeader = () => {
    if (hasSalary) {
      // Salary-aware superset header (works for mixed or salary-only views)
      return (
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Category</th>
          <th>Employee Name</th>
          <th className="text-right">Amount</th>
          <th>Payment Type</th>
          <th>Exec Dept</th>
          <th className="text-right">Salary</th>
          <th className="text-right">Allowance</th>
          {showClientName && <th>Client Name</th>}
          <th>Remarks</th>
          <th className="text-right">Actions</th>
        </tr>
      );
    }

    // Standard (non-salary) header
    return (
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Category</th>
        {showEmployeeName && <th>Employee Name</th>}
        {showClientName && <th>Client Name</th>}
        {showClientName && <th>Client Place</th>}
        <th className="text-right">Amount</th>
        <th>Payment Type</th>
        <th>Purpose</th>
        <th>Remarks</th>
        <th className="text-right">Actions</th>
      </tr>
    );
  };

  // -----------------------------------------------------------------------
  // Row
  // -----------------------------------------------------------------------
  const renderRow = (entry, idx) => {
    const salary = isSalaryEntry(entry);
    const isFinanceRow = salary || isCorpusEntry(entry);

    const dateVal = entry.entry_date || entry.expense_date || "";
    const typeVal = entry.entry_type || (salary ? "Expenses" : "");
    const categoryVal = salary ? SALARY_CAT : entry.category || "—";
    const empName = entry.employee_name || entry.generated_by || "—";
    const execDept = entry.exec_department || currentDepartment || "—";
    const salaryAmt = salary ? entry.salary_amount : null;
    const allowanceAmt = salary ? entry.allowance_amount : null;

    const actionsCell = (
      <td className="text-right" style={{ whiteSpace: "nowrap" }}>
        {onView && (
          <button
            type="button"
            className="btn-icon"
            onClick={() => onView(entry)}
            title="View"
          >
            <Eye size={15} />
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            className="btn-icon"
            onClick={() => onEdit(entry)}
            title="Edit"
          >
            <Pencil size={15} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="btn-icon btn-icon--danger"
            onClick={() => onDelete(entry)}
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        )}
        {!onView && !onEdit && !onDelete && <span style={{ opacity: 0.4 }}>—</span>}
      </td>
    );

    if (hasSalary) {
      return (
        <tr key={entry.id ?? `row-${idx}`}>
          <td style={{ whiteSpace: "nowrap" }}>{dateVal}</td>
          <td>{typeVal}</td>
          <td>{categoryVal}</td>
          <td>{empName}</td>
          <td className="text-right" style={{ fontWeight: 600 }}>
            {formatCurrency(entry.amount)}
          </td>
          <td>{renderPaymentBadge(entry.payment_type)}</td>
          <td>{execDept}</td>
          <td className="text-right">
            {salary && salaryAmt != null ? formatCurrency(salaryAmt) : "—"}
          </td>
          <td className="text-right">
            {salary && allowanceAmt != null ? formatCurrency(allowanceAmt) : "—"}
          </td>
          {showClientName && <td>{entry.client_name || "—"}</td>}
          <td
            style={{
              maxWidth: 260,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={entry.remarks || ""}
          >
            {entry.remarks || "—"}
          </td>
          {actionsCell}
        </tr>
      );
    }

    return (
      <tr key={entry.id ?? `row-${idx}`}>
        <td style={{ whiteSpace: "nowrap" }}>{dateVal}</td>
        <td>{typeVal}</td>
        <td>{categoryVal}</td>
        {showEmployeeName && <td>{empName}</td>}
        {showClientName && <td>{entry.client_name || "—"}</td>}
        {showClientName && <td>{entry.patient_place || "—"}</td>}
        <td className="text-right" style={{ fontWeight: 600 }}>
          {formatCurrency(entry.amount)}
        </td>
        <td>{renderPaymentBadge(entry.payment_type)}</td>
        <td
          style={{
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={entry.purpose || ""}
        >
          {entry.purpose || "—"}
        </td>
        <td
          style={{
            maxWidth: 260,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={entry.remarks || ""}
        >
          {entry.remarks || "—"}
        </td>
        {actionsCell}
      </tr>
    );
  };

  return (
    <div className="card table-wrap">
      <table className="data-table">
        <thead>{renderHeader()}</thead>
        <tbody>{entries.map(renderRow)}</tbody>
      </table>
    </div>
  );
}