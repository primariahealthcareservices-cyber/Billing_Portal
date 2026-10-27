// frontend/src/components/CaredxLabEntryForm.jsx
import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/axios.js";

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const NUMERIC_FIELDS = [
  "total_amount_paid",
  "cash",
  "online",
  "paid_to_other_labs",
  "rmp",
  "salaries_expense",
  "referral_amount",
  "referral_cash",
  "referral_online",
  "sales",
];

// Options shown in both dropdowns
const PAYMENT_TYPE_OPTIONS = [
  { value: "", label: "—" },
  { value: "Cash", label: "Cash" },
  { value: "UPI", label: "UPI (Online)" },
  { value: "Cash + UPI", label: "Cash + UPI" },
  { value: "Card", label: "Card" },
];

// Which amount fields are relevant for a given payment type
const showsCash = (pt) => pt === "Cash" || pt === "Cash + UPI";
const showsOnline = (pt) => pt === "UPI" || pt === "Cash + UPI";

const createEmptyForm = () => ({
  entry_date: today(),
  patient_name: "",
  test_name: "",
  employee_name: "",
  total_amount_paid: "",
  cash: "",
  online: "",
  paid_to_other_labs: "",
  rmp: "",
  salaries_expense: "",
  expense_details: "",
  referral_by: "",
  referral_amount: "",
  referral_cash: "",
  referral_online: "",
  sales: "",
  payment_type: "",
  referral_payment_type: "",
});

export default function CaredxLabEntryForm({ open, onClose, onSaved, editingEntry }) {
  const [form, setForm] = useState(createEmptyForm());
  const [saving, setSaving] = useState(false);

  // Populate form whenever the modal opens (new entry) or the editing target changes
  useEffect(() => {
    if (!open) return;

    if (editingEntry) {
      setForm({
        entry_date: editingEntry.entry_date || today(),
        patient_name: editingEntry.patient_name || "",
        test_name: editingEntry.test_name || "",
        employee_name: editingEntry.employee_name || "",
        total_amount_paid:
          editingEntry.total_amount_paid != null ? String(editingEntry.total_amount_paid) : "",
        cash: editingEntry.cash != null ? String(editingEntry.cash) : "",
        online: editingEntry.online != null ? String(editingEntry.online) : "",
        paid_to_other_labs:
          editingEntry.paid_to_other_labs != null ? String(editingEntry.paid_to_other_labs) : "",
        rmp: editingEntry.rmp != null ? String(editingEntry.rmp) : "",
        salaries_expense:
          editingEntry.salaries_expense != null ? String(editingEntry.salaries_expense) : "",
        expense_details: editingEntry.expense_details || "",
        referral_by: editingEntry.referral_by || "",
        referral_amount:
          editingEntry.referral_amount != null ? String(editingEntry.referral_amount) : "",
        referral_cash:
          editingEntry.referral_cash != null ? String(editingEntry.referral_cash) : "",
        referral_online:
          editingEntry.referral_online != null ? String(editingEntry.referral_online) : "",
        sales: editingEntry.sales != null ? String(editingEntry.sales) : "",
        payment_type: editingEntry.payment_type || "",
        referral_payment_type: editingEntry.referral_payment_type || "",
      });
    } else {
      setForm(createEmptyForm());
    }
  }, [open, editingEntry]);

  if (!open) return null;

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((prev) => {
      const next = { ...prev, [name]: value };

      // Main payment_type rules: hide + clear amount field that no longer applies
      if (name === "payment_type") {
        if (!showsCash(value)) next.cash = "";
        if (!showsOnline(value)) next.online = "";
      }

      // Referral payment_type rules
      if (name === "referral_payment_type") {
        if (!showsCash(value)) next.referral_cash = "";
        if (!showsOnline(value)) next.referral_online = "";
      }

      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.entry_date) {
      toast.error("Please select the entry date.");
      return;
    }
    if (!form.patient_name.trim()) {
      toast.error("Please enter the patient name.");
      return;
    }
    if (!form.test_name.trim()) {
      toast.error("Please enter the test name.");
      return;
    }

    const payload = { ...form };
    NUMERIC_FIELDS.forEach((field) => {
      const value = Number(payload[field]);
      payload[field] = Number.isFinite(value) ? value : 0;
    });

    // Trim dropdown values → send null when "—" is selected
    payload.payment_type = payload.payment_type?.trim() || null;
    payload.referral_payment_type = payload.referral_payment_type?.trim() || null;

    setSaving(true);
    try {
      if (editingEntry) {
        await api.put(`/caredx/lab-entries/${editingEntry.id}`, payload);
        toast.success("Lab entry updated.");
      } else {
        await api.post("/caredx/lab-entries", payload);
        toast.success("Lab entry added.");
      }

      if (typeof onSaved === "function") {
        await onSaved();
      }
      onClose();
    } catch (error) {
      console.error("Caredx lab entry save error:", error);
      const errors = error.response?.data?.errors;
      const message = Array.isArray(errors)
        ? errors.join(" ")
        : error.response?.data?.message || "Something went wrong while saving the lab entry.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const mainShowsCash = showsCash(form.payment_type);
  const mainShowsOnline = showsOnline(form.payment_type);
  const referralShowsCash = showsCash(form.referral_payment_type);
  const referralShowsOnline = showsOnline(form.referral_payment_type);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{editingEntry ? "Edit Lab Entry" : "New Lab Entry"}</h2>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* ── date + employee ─────────────────────────────────────── */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                type="date"
                name="entry_date"
                value={form.entry_date}
                onChange={handleChange}
                className="form-control"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Employee Name</label>
              <input
                name="employee_name"
                value={form.employee_name}
                onChange={handleChange}
                placeholder="e.g. Priya Sharma"
                className="form-control"
              />
            </div>
          </div>

          {/* ── patient + test ──────────────────────────────────────── */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Patient Name</label>
              <input
                name="patient_name"
                value={form.patient_name}
                onChange={handleChange}
                placeholder="e.g. Ramesh Kumar"
                className="form-control"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Test Name</label>
              <input
                name="test_name"
                value={form.test_name}
                onChange={handleChange}
                placeholder="e.g. HLA Typing"
                className="form-control"
              />
            </div>
          </div>

          {/* ── Total Amount + Payment Type ─────────────────────────── */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Total Amount Paid (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="total_amount_paid"
                value={form.total_amount_paid}
                onChange={handleChange}
                placeholder="0.00"
                className="form-control"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Type</label>
              <select
                name="payment_type"
                value={form.payment_type}
                onChange={handleChange}
                className="form-control"
              >
                {PAYMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value || "none"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Conditional cash/online for main payment ────────────── */}
          {(mainShowsCash || mainShowsOnline) && (
            <div className="form-row">
              {mainShowsCash && (
                <div className="form-group">
                  <label className="form-label">Cash (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="cash"
                    value={form.cash}
                    onChange={handleChange}
                    placeholder="0.00"
                    className="form-control"
                  />
                </div>
              )}
              {mainShowsOnline && (
                <div className="form-group">
                  <label className="form-label">Online (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="online"
                    value={form.online}
                    onChange={handleChange}
                    placeholder="0.00"
                    className="form-control"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Other fixed amounts ─────────────────────────────────── */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Paid to Other Labs (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="paid_to_other_labs"
                value={form.paid_to_other_labs}
                onChange={handleChange}
                placeholder="0.00"
                className="form-control"
              />
            </div>
            <div className="form-group">
              <label className="form-label">RMP (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="rmp"
                value={form.rmp}
                onChange={handleChange}
                placeholder="0.00"
                className="form-control"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Salaries Expense (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="salaries_expense"
                value={form.salaries_expense}
                onChange={handleChange}
                placeholder="0.00"
                className="form-control"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Sales (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="sales"
                value={form.sales}
                onChange={handleChange}
                placeholder="0.00"
                className="form-control"
              />
            </div>
          </div>

          {/* ── Referral block ──────────────────────────────────────── */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Referral By</label>
              <input
                name="referral_by"
                value={form.referral_by}
                onChange={handleChange}
                placeholder="Optional"
                className="form-control"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Referral Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="referral_amount"
                value={form.referral_amount}
                onChange={handleChange}
                placeholder="0.00"
                className="form-control"
              />
            </div>
          </div>

          {/* Referral payment type dropdown */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Referral Payment Type</label>
              <select
                name="referral_payment_type"
                value={form.referral_payment_type}
                onChange={handleChange}
                className="form-control"
              >
                {PAYMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value || "none"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" />
          </div>

          {/* Conditional cash/online for referral payment */}
          {(referralShowsCash || referralShowsOnline) && (
            <div className="form-row">
              {referralShowsCash && (
                <div className="form-group">
                  <label className="form-label">Referral Cash (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="referral_cash"
                    value={form.referral_cash}
                    onChange={handleChange}
                    placeholder="0.00"
                    className="form-control"
                  />
                </div>
              )}
              {referralShowsOnline && (
                <div className="form-group">
                  <label className="form-label">Referral Online (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="referral_online"
                    value={form.referral_online}
                    onChange={handleChange}
                    placeholder="0.00"
                    className="form-control"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Remarks ─────────────────────────────────────────────── */}
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <textarea
              name="expense_details"
              value={form.expense_details}
              onChange={handleChange}
              rows={3}
              placeholder="Optional remarks about this lab entry"
              className="form-control"
            />
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "Saving..." : editingEntry ? "Update Entry" : "Save Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}