// frontend/src/components/CaredxCapitalForm.jsx
import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/axios.js";

const today = () => {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

const CAPITAL_CATEGORIES = [
  "Equity Infusion",
  "Partner Contribution",
  "Asset Capitalization",
  "Reserve Fund Transfer",
  "Other Capital",
];

const emptyForm = () => ({
  category: "Equity Infusion",
  client_name: "",
  amount: "",
  entry_date: today(),
  purpose: "",
  remarks: "",
});

export default function CaredxCapitalForm({ open, onClose, onSaved, editingCapital }) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingCapital) {
      setForm({
        category:
          editingCapital.category ||
          editingCapital.fund_category ||
          "Equity Infusion",
        client_name: editingCapital.client_name || "",
        amount: editingCapital.amount != null ? String(editingCapital.amount) : "",
        entry_date: editingCapital.entry_date || today(),
        purpose: editingCapital.purpose || "",
        remarks: editingCapital.remarks || "",
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, editingCapital]);

  if (!open) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!CAPITAL_CATEGORIES.includes(form.category)) {
      toast.error("Please select a Capital Category.");
      return;
    }
    if (!form.client_name.trim()) {
      toast.error("Please enter a name.");
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    if (!form.purpose.trim()) {
      toast.error("Please enter the purpose.");
      return;
    }
    if (!form.entry_date) {
      toast.error("Please select the date.");
      return;
    }

    const payload = {
      entry_type: "Capital",
      category: form.category,
      capital_category: form.category,
      fund_category: form.category,
      client_name: form.client_name.trim(),
      amount,
      entry_date: form.entry_date,
      purpose: form.purpose.trim(),
      remarks: form.remarks || "",
    };

    setSaving(true);
    try {
      if (editingCapital && editingCapital.id) {
        await api.put(`/caredx/capital/${editingCapital.id}`, payload);
        toast.success("Capital entry updated.");
      } else {
        await api.post("/caredx/capital", payload);
        toast.success("Capital entry added.");
      }
      if (typeof onSaved === "function") await onSaved();
      onClose();
    } catch (err) {
      const errors = err.response?.data?.errors;
      const msg = Array.isArray(errors)
        ? errors.join(" ")
        : err.response?.data?.message || "Failed to save Capital entry.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{editingCapital ? "Edit Capital Entry" : "New Capital Entry"}</h2>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label className="form-label">
              Capital Category <span style={{ color: "red" }}>*</span>
            </label>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className="form-control"
              required
            >
              {CAPITAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              Name <span style={{ color: "red" }}>*</span>
            </label>
            <input
              name="client_name"
              value={form.client_name}
              onChange={handleChange}
              placeholder="Name of person, organization, or source"
              className="form-control"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                Amount (₹) <span style={{ color: "red" }}>*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="amount"
                value={form.amount}
                onChange={handleChange}
                placeholder="0.00"
                className="form-control"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                Date <span style={{ color: "red" }}>*</span>
              </label>
              <input
                type="date"
                name="entry_date"
                value={form.entry_date}
                onChange={handleChange}
                className="form-control"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Purpose <span style={{ color: "red" }}>*</span>
            </label>
            <textarea
              name="purpose"
              value={form.purpose}
              onChange={handleChange}
              rows={3}
              placeholder="Reason or purpose for which the capital is being added"
              className="form-control"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Remarks</label>
            <textarea
              name="remarks"
              value={form.remarks}
              onChange={handleChange}
              rows={2}
              placeholder="Optional notes"
              className="form-control"
            />
          </div>

          <div className="modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "Saving..." : editingCapital ? "Update Entry" : "Save Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}