// billingportal/frontend/src/pages/dashboards/TodoListPage.jsx
import React, { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import api from "../../api/axios.js";

/* ─────────────────────────────── Design tokens ────────────────────────────── */
const STATUS_META = {
  pending:     { bg: "#fef3c7", color: "#92400e", dot: "#f59e0b", label: "Pending" },
  in_progress: { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label: "In Progress" },
  completed:   { bg: "#dcfce7", color: "#166534", dot: "#22c55e", label: "Completed" },
  cancelled:   { bg: "#f3f4f6", color: "#374151", dot: "#6b7280", label: "Cancelled" },
};
const PRIORITY_META = {
  low:    { bg: "#ecfdf5", color: "#065f46", label: "Low" },
  medium: { bg: "#fefce8", color: "#854d0e", label: "Medium" },
  high:   { bg: "#ffedd5", color: "#9a3412", label: "High" },
  urgent: { bg: "#fee2e2", color: "#991b1b", label: "Urgent" },
};

/* ─────────────────────────────── Icons (inline SVG) ───────────────────────── */
const Icon = ({ path, size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {path}
  </svg>
);
const IconEye    = (p) => <Icon {...p} path={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>} />;
const IconEdit   = (p) => <Icon {...p} path={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>} />;
const IconTrash  = (p) => <Icon {...p} path={<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></>} />;
const IconPlus   = (p) => <Icon {...p} path={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} />;
const IconClose  = (p) => <Icon {...p} path={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>} />;
const IconClip   = (p) => <Icon {...p} path={<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>} />;
const IconClock  = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>} />;
const IconUser   = (p) => <Icon {...p} path={<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>} />;
const IconList   = (p) => <Icon {...p} path={<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>} />;

/* ─────────────────────────────── helpers ──────────────────────────────────── */
const fmt = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  id: null, title: "", description: "",
  assigned_to_id: "", assigned_department: "",
  assigned_date: todayStr(), due_date: todayStr(),
  priority: "medium", remarks: "", status: "pending",
};

/* ─────────────────────────────── reusable bits ───────────────────────────── */
const Badge = ({ meta }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
    background: meta?.bg || "#f3f4f6", color: meta?.color || "#374151",
    letterSpacing: "0.02em", whiteSpace: "nowrap",
  }}>
    {meta?.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.dot }} />}
    {meta?.label || "—"}
  </span>
);

const IconButton = ({ title, onClick, tone = "default", children }) => {
  const tones = {
    default: { bg: "#f8fafc", color: "#334155", border: "#e2e8f0", hover: "#f1f5f9" },
    primary: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", hover: "#dbeafe" },
    danger:  { bg: "#fef2f2", color: "#dc2626", border: "#fecaca", hover: "#fee2e2" },
  };
  const t = tones[tone];
  return (
    <button title={title} onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 8,
        background: t.bg, color: t.color, border: `1px solid ${t.border}`,
        cursor: "pointer", transition: "all .15s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = t.bg)}>
      {children}
    </button>
  );
};

/* ─────────────────────────────── main component ───────────────────────────── */
export default function TodoListPage() {
  const [tasks, setTasks]           = useState([]);
  const [users, setUsers]           = useState([]);
  const [departments, setDepts]     = useState([]);
  const [history, setHistory]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState("tasks");
  const [showForm, setShowForm]     = useState(false);
  const [viewTask, setViewTask]     = useState(null);
  const [form, setForm]             = useState(emptyForm);
  const [attachmentFile, setFile]   = useState(null);
  const [filterStatus, setFilter]   = useState("all");
  const [saving, setSaving]         = useState(false);

  /* ── data loaders ─────────────────────────────────────────────────────────── */
  const load = async () => {
    setLoading(true);
    try {
      const [tRes, uRes, dRes] = await Promise.all([
        api.get("/admin/todo/"),
        api.get("/admin/todo/assignable-users"),
        api.get("/admin/todo/departments"),
      ]);
      setTasks(tRes.data.tasks || []);
      setUsers(uRes.data.users || []);
      setDepts(dRes.data.departments || []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load tasks or staff data");
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await api.get("/admin/todo/history");
      setHistory(res.data.history || []);
    } catch {
      toast.error("Failed to load history");
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === "history") loadHistory(); }, [tab]);

  /* ── derived ──────────────────────────────────────────────────────────────── */
  const filtered = useMemo(
    () => filterStatus === "all" ? tasks : tasks.filter((t) => t.status === filterStatus),
    [tasks, filterStatus],
  );

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === "pending").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      overdue: tasks.filter((t) =>
        !["completed", "cancelled"].includes(t.status) && t.due_date && t.due_date < today
      ).length,
    };
  }, [tasks]);

  /* ── form handlers ────────────────────────────────────────────────────────── */
  const resetForm = () => { setForm(emptyForm); setFile(null); setShowForm(false); };

  const startEdit = (t) => {
    setForm({
      id: t.id,
      title: t.title,
      description: t.description || "",
      assigned_to_id: t.assigned_to_id || "",
      assigned_department: t.assigned_department || "",
      assigned_date: t.assigned_date || todayStr(),
      due_date: t.due_date || todayStr(),
      priority: t.priority,
      remarks: t.remarks || "",
      status: t.status,
    });
    setFile(null);
    setViewTask(null);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return toast.error("Title required");
    if (!form.due_date)     return toast.error("Due date required");
    if (!form.assigned_to_id && !form.assigned_department)
      return toast.error("Choose a staff member or a department");

    setSaving(true);
    try {
      const fd = new FormData();
      ["title", "description", "assigned_to_id", "assigned_department",
       "assigned_date", "due_date", "priority", "remarks", "status"]
        .forEach((k) => { if (form[k] !== undefined && form[k] !== null) fd.append(k, form[k]); });
      if (attachmentFile) fd.append("attachment", attachmentFile);

      if (form.id) {
        await api.put(`/admin/todo/${form.id}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success("Task updated");
      } else {
        await api.post("/admin/todo/", fd, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success("Task created & assigned");
      }
      resetForm();
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete task "${t.title}"?`)) return;
    try {
      await api.delete(`/admin/todo/${t.id}`);
      toast.success("Deleted");
      if (viewTask?.id === t.id) setViewTask(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || "Delete failed");
    }
  };

  const downloadAttachment = async (t) => {
    try {
      const res = await api.get(`/admin/todo/${t.id}/attachment`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = t.attachment_filename || `task_${t.id}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    }
  };

  /* ── render ───────────────────────────────────────────────────────────────── */
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes fadeIn   { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp  { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="page-title" style={{ margin: 0 }}>To-Do List — Task Management</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            Create, assign, and track tasks across the team.
          </p>
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { label: "Total",       value: stats.total,       color: "#0f172a" },
          { label: "Pending",     value: stats.pending,     color: "#d97706" },
          { label: "In Progress", value: stats.in_progress, color: "#2563eb" },
          { label: "Completed",   value: stats.completed,   color: "#16a34a" },
          { label: "Overdue",     value: stats.overdue,     color: "#dc2626" },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: "16px 18px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, letterSpacing: "0.03em", textTransform: "uppercase", fontWeight: 600 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>View</label>
          <select className="form-control" value={tab} onChange={(e) => setTab(e.target.value)}>
            <option value="tasks">Tasks</option>
            <option value="history">History</option>
          </select>
        </div>
        {tab === "tasks" && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Status</label>
            <select className="form-control" value={filterStatus} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn-primary"
          onClick={() => { resetForm(); setShowForm(true); }}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8 }}>
          <IconPlus size={15} /> New Task
        </button>
      </div>

      {/* ── Tasks table ──────────────────────────────────────────────────── */}
      {tab === "tasks" && (
        loading ? (
          <div className="card empty-state" style={{ borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#64748b" }}>
              <span style={{ width: 16, height: 16, border: "2px solid #cbd5e1", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              Loading tasks…
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card empty-state" style={{ borderRadius: 12, textAlign: "center", padding: "40px 20px" }}>
            <IconList size={40} style={{ color: "#cbd5e1", marginBottom: 10 }} />
            <div style={{ color: "#64748b", fontSize: 14 }}>No tasks found.</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {["Task", "Assignee", "Priority", "Due Date", "Status", "Files", "Actions"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id}
                      style={{
                        background: t.is_overdue ? "#fff5f5" : undefined,
                        borderBottom: "1px solid #f1f5f9",
                        transition: "background .15s ease",
                      }}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{
                          textDecoration: t.status === "completed" ? "line-through" : undefined,
                          color: t.status === "completed" ? "#94a3b8" : undefined,
                          fontWeight: 600,
                        }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "monospace" }}>{t.task_number}</div>
                        {t.assigned_by_name && (
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>by {t.assigned_by_name}</div>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#334155" }}>
                        {t.assigned_to_name || t.assigned_department || <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px" }}><Badge meta={PRIORITY_META[t.priority]} /></td>
                      <td style={{ padding: "12px 16px", color: t.is_overdue ? "#dc2626" : "#334155", fontWeight: t.is_overdue ? 600 : 400 }}>
                        {fmt(t.due_date)}
                      </td>
                      <td style={{ padding: "12px 16px" }}><Badge meta={STATUS_META[t.status]} /></td>
                      <td style={{ padding: "12px 16px" }}>
                        {t.has_attachment
                          ? <IconButton title="Download attachment" onClick={() => downloadAttachment(t)}><IconClip size={15} /></IconButton>
                          : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <IconButton title="View details" tone="primary" onClick={() => setViewTask(t)}><IconEye size={15} /></IconButton>
                          <IconButton title="Edit task" onClick={() => startEdit(t)}><IconEdit size={15} /></IconButton>
                          <IconButton title="Delete task" tone="danger" onClick={() => handleDelete(t)}><IconTrash size={15} /></IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ── History tab ─────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="card" style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <h3 style={{ marginTop: 0, fontSize: 16, color: "#0f172a" }}>Task History</h3>
          {history.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: 14 }}>No history yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["When", "Task", "Action", "By", "Details"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 14px", color: "#475569" }}>{fmt(h.created_at)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 500 }}>
                        {h.task_title ? h.task_title : `#${h.task_id}`}
                      </td>
                      <td style={{ padding: "10px 14px" }}>{h.action}</td>
                      <td style={{ padding: "10px 14px" }}>{h.changed_by_name || "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>
                        {h.action === "status_changed" && h.old_value && h.new_value
                          ? `${h.old_value} → ${h.new_value}`
                          : (h.new_value || h.note || "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── View modal ──────────────────────────────────────────────────── */}
      {viewTask && (
        <div style={modalBackdrop} onClick={() => setViewTask(null)}>
          <div style={{ ...modalCard, maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                  {viewTask.task_number}
                </div>
                <h3 style={{ margin: "4px 0 8px", fontSize: 20, color: "#0f172a", lineHeight: 1.3 }}>
                  {viewTask.title}
                </h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge meta={STATUS_META[viewTask.status]} />
                  <Badge meta={PRIORITY_META[viewTask.priority]} />
                  {viewTask.is_overdue && (
                    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#fee2e2", color: "#991b1b" }}>
                      ⚠ Overdue
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setViewTask(null)} style={closeBtn} title="Close"><IconClose size={18} /></button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <DetailRow icon={<IconUser size={14} />} label="Assigned To"
                value={viewTask.assigned_to_name || viewTask.assigned_department || "—"} />
              <DetailRow icon={<IconUser size={14} />} label="Assigned By" value={viewTask.assigned_by_name || "—"} />
              <DetailRow icon={<IconClock size={14} />} label="Assigned Date" value={fmt(viewTask.assigned_date)} />
              <DetailRow icon={<IconClock size={14} />} label="Due Date"
                value={fmt(viewTask.due_date)} danger={viewTask.is_overdue} />
              <DetailRow icon={<IconClock size={14} />} label="Created" value={fmt(viewTask.created_at)} />
              <DetailRow icon={<IconClock size={14} />} label="Completed" value={fmt(viewTask.completed_at)} />
            </div>

            {viewTask.description && (
              <div style={{ marginBottom: 14 }}>
                <div style={fieldLabel}>Description</div>
                <div style={fieldValue}>{viewTask.description}</div>
              </div>
            )}
            {viewTask.remarks && (
              <div style={{ marginBottom: 14 }}>
                <div style={fieldLabel}>Remarks / Instructions</div>
                <div style={{ ...fieldValue, background: "#fefce8", borderLeft: "3px solid #eab308", paddingLeft: 10 }}>
                  {viewTask.remarks}
                </div>
              </div>
            )}

            {viewTask.has_attachment && (
              <div style={{ marginBottom: 14 }}>
                <div style={fieldLabel}>Attachment</div>
                <button className="btn-secondary"
                  onClick={() => downloadAttachment(viewTask)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, borderRadius: 8 }}>
                  <IconClip size={14} /> {viewTask.attachment_filename || "Download file"}
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
              <button className="btn-secondary" onClick={() => setViewTask(null)} style={{ borderRadius: 8 }}>Close</button>
              <button className="btn-primary" onClick={() => startEdit(viewTask)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8 }}>
                <IconEdit size={14} /> Edit Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit modal ─────────────────────────────────────────── */}
      {showForm && (
        <div style={modalBackdrop} onClick={resetForm}>
          <div style={{ ...modalCard, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>
                {form.id ? "Edit Task" : "Create New Task"}
              </h3>
              <button onClick={resetForm} style={closeBtn} title="Close"><IconClose size={18} /></button>
            </div>

            <div className="form-grid">
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Title *</label>
                <input className="form-control" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Description</label>
                <textarea className="form-control" style={{ minHeight: 80 }}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Assign to Staff</label>
                <select className="form-control" value={form.assigned_to_id}
                  onChange={(e) => setForm({ ...form, assigned_to_id: e.target.value, assigned_department: "" })}>
                  <option value="">— None —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.department ? ` — ${u.department}` : ""}{u.designation ? ` (${u.designation})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">…or Assign to Department</label>
                <select className="form-control" value={form.assigned_department}
                  onChange={(e) => setForm({ ...form, assigned_department: e.target.value, assigned_to_id: "" })}>
                  <option value="">— None —</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Assigned Date</label>
                <input type="date" className="form-control" value={form.assigned_date}
                  onChange={(e) => setForm({ ...form, assigned_date: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Due Date *</label>
                <input type="date" className="form-control" value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Priority</label>
                <select className="form-control" value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Remarks / Instructions</label>
                <textarea className="form-control" style={{ minHeight: 60 }}
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  placeholder="Anything the assignee should know…" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Attachment (optional)</label>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
              <button className="btn-secondary" onClick={resetForm} disabled={saving} style={{ borderRadius: 8 }}>Cancel</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={saving} style={{ borderRadius: 8 }}>
                {saving ? "Saving…" : form.id ? "Update Task" : "Create & Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── shared modal styles ──────────────────────────── */
const modalBackdrop = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
  backdropFilter: "blur(4px)", display: "flex", alignItems: "center",
  justifyContent: "center", zIndex: 1000, padding: 16,
  animation: "fadeIn .2s ease",
};
const modalCard = {
  width: "100%", maxHeight: "90vh", overflowY: "auto",
  background: "#fff", borderRadius: 16, padding: 24,
  boxShadow: "0 25px 50px -12px rgba(0,0,0,.25)",
  animation: "slideUp .25s ease",
};
const closeBtn = {
  width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0",
  background: "#f8fafc", color: "#475569", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};
const fieldLabel = {
  fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase",
  letterSpacing: "0.05em", marginBottom: 4,
};
const fieldValue = { fontSize: 13, color: "#334155", lineHeight: 1.6, whiteSpace: "pre-wrap" };

function DetailRow({ icon, label, value, danger }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 13, color: danger ? "#dc2626" : "#0f172a", fontWeight: danger ? 600 : 500 }}>
        {value}
      </div>
    </div>
  );
}