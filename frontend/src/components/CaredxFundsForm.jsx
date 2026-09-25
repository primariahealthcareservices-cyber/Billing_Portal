// frontend/src/components/CaredxFundsForm.jsx
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

const FUND_CATEGORIES = ["Restricted Fund", "Unrestricted Fund"];

const emptyForm = () => ({
  fund_category: "Restricted Fund",
  client_name: "",
  amount: "",
  entry_date: today(),
  purpose: "",
  remarks: "",
});

export default function CaredxFundsForm({ open, onClose, onSaved, editingFund }) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingFund) {
      setForm({
        fund_category: editingFund.fund_category || editingFund.category || "Restricted Fund",
        client_name: editingFund.client_name || "",
        amount: editingFund.amount != null ? String(editingFund.amount) : "",
        entry_date: editingFund.entry_date || today(),
        purpose: editingFund.purpose || "",
        remarks: editingFund.remarks || "",
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, editingFund]);

  if (!open) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!["Restricted Fund", "Unrestricted Fund"].includes(form.fund_category)) {
      toast.error("Please select a Fund Category.");
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
      fund_category: form.fund_category,
      client_name: form.client_name.trim(),
      amount,
      entry_date: form.entry_date,
      purpose: form.purpose.trim(),
      remarks: form.remarks || "",
    };

    setSaving(true);
    try {
      if (editingFund && editingFund.id) {
        await api.put(`/caredx/funds/${editingFund.id}`, payload);
        toast.success("Funds entry updated.");
      } else {
        await api.post("/caredx/funds", payload);
        toast.success("Funds entry added.");
      }
      if (typeof onSaved === "function") await onSaved();
      onClose();
    } catch (err) {
      const errors = err.response?.data?.errors;
      const msg = Array.isArray(errors)
        ? errors.join(" ")
        : err.response?.data?.message || "Failed to save Funds entry.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{editingFund ? "Edit Funds Entry" : "New Funds Entry"}</h2>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label className="form-label">
              Fund Category <span style={{ color: "red" }}>*</span>
            </label>
            <select
              name="fund_category"
              value={form.fund_category}
              onChange={handleChange}
              className="form-control"
              required
            >
              {FUND_CATEGORIES.map((fc) => (
                <option key={fc} value={fc}>{fc}</option>
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
              placeholder="Reason or purpose for which the funds are being added"
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
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? "Saving..." : editingFund ? "Update Entry" : "Save Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}