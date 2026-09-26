import React, { useState, useEffect } from "react";
import { Plus, Search, Pencil, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../api/axios.js";

export default function PharmacyCrud({
  title,
  apiPath,          // e.g., "/pharmacy/categories"
  columns,          // array of { key, label, render? }
  formFields,       // array of { name, label, type, required?, options?, ... }
  initialForm,      // function returning empty form object
  idKey = "id",
  transformData = (d) => d,   // if you need to map response data
}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);

  // -----------------------------------------------------------
  // Fetch data from API
  // -----------------------------------------------------------
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get(apiPath);
      const items = transformData(res.data);
      setData(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error("Fetch error:", err.response?.data || err);
      toast.error(`Failed to load ${title}.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------
  // Search filter
  // -----------------------------------------------------------
  const filteredData = data.filter((item) => {
    if (!search) return true;
    return Object.values(item).some((val) => {
      if (val === null || val === undefined) return false;
      if (typeof val === "object") {
        // search inside nested objects (e.g., products array)
        return JSON.stringify(val).toLowerCase().includes(search.toLowerCase());
      }
      return String(val).toLowerCase().includes(search.toLowerCase());
    });
  });

  // -----------------------------------------------------------
  // Value coercion
  // -----------------------------------------------------------
  const coerceValue = (field, value) => {
    if (value === "") return "";

    if (field.type === "checkbox") {
      return value === true || value === "true";
    }

    if (field.type === "select" && field.options) {
      const matched = field.options.find(
        (opt) => String(opt.value) === String(value)
      );
      if (matched) return matched.value;
    }

    if (field.type === "number") {
      return value === "" ? "" : Number(value);
    }

    return value;
  };

  // -----------------------------------------------------------
  // Open modal for Create or Edit
  // -----------------------------------------------------------
  const openModal = (item = null) => {
    if (item) {
      setEditing(item[idKey]);

      const formData = {};
      const emptyForm = initialForm();

      formFields.forEach((field) => {
        // --- lineItems: pass through the array as-is ---
        if (field.type === "lineItems") {
          const arr = item[field.name];
          formData[field.name] = Array.isArray(arr) ? arr.map((r) => ({ ...r })) : [];
          return;
        }

        if (item[field.name] !== undefined) {
          formData[field.name] = item[field.name];
        } else {
          const nestedKey = field.name.replace(/_id$/, "");
          if (item[nestedKey] && item[nestedKey].id !== undefined) {
            formData[field.name] = item[nestedKey].id;
          } else {
            formData[field.name] = emptyForm[field.name] ?? "";
          }
        }
      });

      setForm(formData);
    } else {
      setEditing(null);
      setForm(initialForm());
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(initialForm());
  };

  // -----------------------------------------------------------
  // Handle input changes (simple fields)
  // -----------------------------------------------------------
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const field = formFields.find((f) => f.name === name);

    let finalValue = type === "checkbox" ? checked : value;
    if (field) finalValue = coerceValue(field, finalValue);

    setForm({ ...form, [name]: finalValue });
  };

  // -----------------------------------------------------------
  // lineItems helpers
  // -----------------------------------------------------------
  const addLineItem = (field) => {
    const list = Array.isArray(form[field.name]) ? [...form[field.name]] : [];
    list.push(field.newRow ? field.newRow() : {});
    setForm({ ...form, [field.name]: list });
  };

  const removeLineItem = (field, index) => {
    const list = Array.isArray(form[field.name]) ? [...form[field.name]] : [];
    list.splice(index, 1);
    setForm({ ...form, [field.name]: list });
  };

  const updateLineItem = (field, index, key, rawValue) => {
    const list = Array.isArray(form[field.name]) ? [...form[field.name]] : [];
    const colDef = (field.columns || []).find((c) => c.key === key);
    let value = rawValue;

    if (colDef?.type === "number") {
      value = rawValue === "" ? "" : Number(rawValue);
    }

    let row = { ...list[index], [key]: value };

    // auto-compute derived columns (e.g., price = qty * unit_price)
    if (field.autoCompute) {
      row = field.autoCompute(row);
    }

    list[index] = row;
    setForm({ ...form, [field.name]: list });
  };

  // -----------------------------------------------------------
  // Submit (Create / Update)
  // -----------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const payload = { ...form };

    Object.keys(payload).forEach((key) => {
      const field = formFields.find((f) => f.name === key);
      if (field?.type === "lineItems") return; // keep arrays intact
      if (payload[key] === "") payload[key] = null;
    });

    try {
      if (editing) {
        await api.put(`${apiPath}/${editing}`, payload);
        toast.success(`${title} updated.`);
      } else {
        await api.post(apiPath, payload);
        toast.success(`${title} created.`);
      }
      closeModal();
      fetchData();
    } catch (err) {
      console.error("Submit error:", err.response?.data || err);

      let msg = "Operation failed.";
      const errData = err.response?.data;
      if (errData) {
        if (typeof errData === "string") msg = errData;
        else if (errData.message) msg = errData.message;
        else if (errData.error) msg = errData.error;
        else if (errData.errors) {
          const firstField = Object.keys(errData.errors)[0];
          const firstErr = errData.errors[firstField];
          msg = `${firstField}: ${Array.isArray(firstErr) ? firstErr[0] : firstErr}`;
        }
      }
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------
  // Delete
  // -----------------------------------------------------------
  const handleDelete = async (id) => {
    if (!window.confirm(`Delete this ${title}?`)) return;
    try {
      await api.delete(`${apiPath}/${id}`);
      toast.success(`${title} deleted.`);
      fetchData();
    } catch (err) {
      console.error("Delete error:", err.response?.data || err);
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          `Failed to delete ${title}.`
      );
    }
  };

  // -----------------------------------------------------------
  // Render a single form field
  // -----------------------------------------------------------
  const renderField = (field) => {
    // ---------------- lineItems ----------------
    if (field.type === "lineItems") {
      const list = Array.isArray(form[field.name]) ? form[field.name] : [];
      return (
        <div className="form-group" key={field.name}>
          <label className="form-label">{field.label}</label>

          <div className="table-responsive" style={{ marginBottom: 8 }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  {(field.columns || []).map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td
                      colSpan={(field.columns?.length || 0) + 1}
                      style={{ textAlign: "center", opacity: 0.6 }}
                    >
                      No rows yet. Click "Add Row".
                    </td>
                  </tr>
                )}
                {list.map((row, idx) => (
                  <tr key={idx}>
                    {(field.columns || []).map((c) => (
                      <td key={c.key}>
                        {c.type === "select" ? (
                          <select
                            className="form-control"
                            value={row[c.key] ?? ""}
                            onChange={(e) =>
                              updateLineItem(field, idx, c.key, e.target.value)
                            }
                          >
                            <option value="">--</option>
                            {(c.options || []).map((o) => (
                              <option key={String(o.value)} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="form-control"
                            type={c.type || "text"}
                            value={row[c.key] ?? ""}
                            onChange={(e) =>
                              updateLineItem(field, idx, c.key, e.target.value)
                            }
                            placeholder={c.placeholder || ""}
                            readOnly={c.readOnly}
                          />
                        )}
                      </td>
                    ))}
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="btn-icon btn-icon--danger"
                        onClick={() => removeLineItem(field, idx)}
                        title="Remove"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => addLineItem(field)}
          >
            <Plus size={16} /> Add Row
          </button>
        </div>
      );
    }

    // ---------------- select ----------------
    if (field.type === "select") {
      return (
        <div className="form-group" key={field.name}>
          <label className="form-label">
            {field.label}
            {field.required && <span style={{ color: "#ef4444" }}> *</span>}
          </label>
          <select
            name={field.name}
            value={
              form[field.name] === null || form[field.name] === undefined
                ? ""
                : form[field.name]
            }
            onChange={handleChange}
            className="form-control"
            required={field.required}
          >
            <option value="">Select...</option>
            {(field.options || []).map((opt) => (
              <option key={String(opt.value)} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    // ---------------- textarea ----------------
    if (field.type === "textarea") {
      return (
        <div className="form-group" key={field.name}>
          <label className="form-label">{field.label}</label>
          <textarea
            name={field.name}
            value={form[field.name] ?? ""}
            onChange={handleChange}
            className="form-control"
            rows={3}
          />
        </div>
      );
    }

    // ---------------- checkbox ----------------
    if (field.type === "checkbox") {
      return (
        <div className="form-group" key={field.name}>
          <label className="form-label">{field.label}</label>
          <input
            type="checkbox"
            name={field.name}
            checked={!!form[field.name]}
            onChange={handleChange}
          />
        </div>
      );
    }

    // ---------------- default text/number/date/email ----------------
    return (
      <div className="form-group" key={field.name}>
        <label className="form-label">
          {field.label}
          {field.required && <span style={{ color: "#ef4444" }}> *</span>}
        </label>
        <input
          type={field.type || "text"}
          name={field.name}
          value={form[field.name] ?? ""}
          onChange={handleChange}
          className="form-control"
          required={field.required}
          placeholder={field.placeholder || ""}
          readOnly={field.readOnly}
        />
      </div>
    );
  };

  // -----------------------------------------------------------
  // Render
  // -----------------------------------------------------------
  return (
    <div>
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
        <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>{title}</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
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
              style={{ paddingLeft: 32, width: 200 }}
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => openModal()}>
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : filteredData.length === 0 ? (
        <div className="empty-state">
          No {title.toLowerCase()} found.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item) => (
                <tr key={item[idKey]}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render
                        ? col.render(item[col.key], item)
                        : item[col.key] ?? "—"}
                    </td>
                  ))}
                  <td>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      <button
                        className="btn-icon"
                        onClick={() => openModal(item)}
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="btn-icon btn-icon--danger"
                        onClick={() => handleDelete(item[idKey])}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal"
            style={{ maxWidth: 800 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                {editing ? "Edit" : "New"} {title}
              </h2>
              <button className="modal-close" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-body">
              {formFields.map(renderField)}

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? "Saving..." : editing ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}