import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/axios.js";

const today = () => new Date().toISOString().split("T")[0];

const emptyForm = () => ({
  expense_date: today(),
  category: "",
  amount: "",
  remarks: "",
  employee_name: "",
  purpose: "",
  vehicle_type: "",
});

// New category list (including Pay Role Salaries)
const CATEGORIES = [
  "Payroll Salaries",
  "Travel & Entertainment",
  "Marketing Expenses",
  "Assets & Infra Cost",
  "General Operations",
  "Innovation",
  "Miscellaneous Categories",
  "Service Revenue",
  "Supplies & Equipments",   // renamed
  "Legal Governance",
  "Reagents and Laboratory Consumables",
  "Specialized Clinical Labor",
  "Logistics, Couriers, and Specimen Collection",
  "Equipment Maintenance, Leases, and Automation",
  "Waste Management, Compliance, and Safety",
  "Billing, Revenue Cycle, and Administration",
  "Other"
];

export default function CaredxExpenseForm({ open, onClose, onSaved, editingExpense }) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingExpense) {
      setForm({
        expense_date: editingExpense.expense_date,
        category: editingExpense.category || "",
        amount: editingExpense.amount ?? "",
        remarks: editingExpense.remarks || "",
        employee_name: editingExpense.employee_name || "",
        purpose: editingExpense.purpose || "",
        vehicle_type: editingExpense.vehicle_type || "",
      });
    } else {
      setForm(emptyForm());
    }
  }, [editingExpense, open]);

  if (!open) return null;

  const isSalaryCategory = form.category === "Payroll Salaries";

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prevent salary category submission
    if (isSalaryCategory) {
      toast.error("Salaries must be entered by Corporate Management only.");
      return;
    }

    // Validate category
    if (!form.category.trim()) {
      toast.error("Please select an expense category.");
      return;
    }

    // Validate amount
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    // Remarks is mandatory for all editable categories
    if (!form.remarks.trim()) {
      toast.error("Remarks are required.");
      return;
    }

    setSaving(true);
    try {
      if (editingExpense) {
        await api.put(`/caredx/expenses/${editingExpense.id}`, form);
        toast.success("Expense updated.");
      } else {
        await api.post("/caredx/expenses", form);
        toast.success("Expense added.");
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.errors?.join(" ") || err.response?.data?.message || "Something went wrong.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{editingExpense ? "Edit Expense" : "New Expense"}</h2>
          <button onClick={onClose} className="modal-close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Date & Amount */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" name="expense_date" value={form.expense_date} onChange={handleChange} className="form-control" />
            </div>
            <div className="form-group">
              <label className="form-label">Amount (₹)</label>
              <input type="number" step="0.01" min="0" name="amount" value={form.amount} onChange={handleChange} placeholder="0.00" className="form-control" />
            </div>
          </div>

          {/* Category */}
          <div className="form-group">
            <label className="form-label">Expenses Category</label>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className="form-control"
            >
              <option value="">Select a category</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Salary Category Message */}
          {isSalaryCategory && (
            <div className="alert alert-info" style={{ background: "#f0f0ff", padding: "12px", borderRadius: "8px", marginBottom: "12px" }}>
              <strong>⚠️ Salaries must be entered by Corporate Management only.</strong>
              <p style={{ marginTop: "4px", fontSize: "0.9rem" }}>
                Please use the Corporate Management dashboard to add salary records for CareDx employees.
              </p>
            </div>
          )}

          {/* Editable fields – hidden for salary category */}
          {!isSalaryCategory && (
            <>
              {/* Employee/Person Name (generic) */}
              <div className="form-group">
                <label className="form-label">Name / Item</label>
                <input
                  name="employee_name"
                  value={form.employee_name}
                  onChange={handleChange}
                  placeholder="e.g. Employee name, item name, vendor"
                  className="form-control"
                />
              </div>

              {/* Purpose */}
              <div className="form-group">
                <label className="form-label">Purpose</label>
                <input
                  name="purpose"
                  value={form.purpose}
                  onChange={handleChange}
                  placeholder="Brief purpose of this expense"
                  className="form-control"
                />
              </div>

              {/* Vehicle Type – shown only for Travel & Entertainment */}
              {form.category === "Travel & Entertainment" && (
                <div className="form-group">
                  <label className="form-label">Transport / Travel Type</label>
                  <input
                    name="vehicle_type"
                    value={form.vehicle_type}
                    onChange={handleChange}
                    placeholder="e.g. Car, Bike, Cab, Bus"
                    className="form-control"
                  />
                </div>
              )}

              {/* Remarks – mandatory */}
              <div className="form-group">
                <label className="form-label">Remarks <span style={{ color: "red" }}>*</span></label>
                <textarea
                  name="remarks"
                  value={form.remarks}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Detailed remarks (required)"
                  className="form-control"
                  required
                />
              </div>
            </>
          )}

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving || isSalaryCategory} className="btn btn-primary">
              {saving ? "Saving..." : editingExpense ? "Update Expense" : "Save Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}