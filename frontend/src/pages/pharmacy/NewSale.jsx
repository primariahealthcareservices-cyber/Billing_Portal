import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../api/axios.js";
import Navbar from "../../components/Navbar.jsx";

export default function NewSale() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "" });
  const [items, setItems] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMedicine, setSelectedMedicine] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  // Fetch medicines on search
  useEffect(() => {
    if (searchTerm.length < 2) {
      setMedicines([]);
      return;
    }
    const fetchMedicines = async () => {
      try {
        const res = await api.get("/pharmacy/medicines", { params: { search: searchTerm } });
        setMedicines(res.data.medicines || []);
      } catch {
        toast.error("Failed to search medicines.");
      }
    };
    const timer = setTimeout(fetchMedicines, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch batches for a medicine
  const fetchBatches = async (medicineId) => {
    try {
      const res = await api.get(`/pharmacy/medicines/${medicineId}/batches`);
      return res.data.batches || [];
    } catch {
      toast.error("Failed to fetch batches.");
      return [];
    }
  };

  const addItem = async () => {
    if (!selectedMedicine) {
      toast.error("Please select a medicine.");
      return;
    }
    if (!selectedBatch) {
      toast.error("Please select a batch.");
      return;
    }
    if (quantity <= 0) {
      toast.error("Quantity must be positive.");
      return;
    }
    // Check stock
    if (quantity > selectedBatch.quantity) {
      toast.error(`Only ${selectedBatch.quantity} units available.`);
      return;
    }

    setItems([
      ...items,
      {
        batch_id: selectedBatch.id,
        medicine_name: selectedMedicine.medicine_name,
        batch_number: selectedBatch.batch_number,
        expiry: selectedBatch.expiry_date,
        mrp: selectedBatch.mrp,
        selling_rate: selectedBatch.selling_rate || selectedBatch.mrp,
        quantity,
        gst_percentage: selectedBatch.gst_percentage || 0,
        discount_percentage: selectedBatch.discount_percentage || 0,
        amount: quantity * (selectedBatch.selling_rate || selectedBatch.mrp),
      },
    ]);

    // Reset selection
    setSelectedMedicine(null);
    setSelectedBatch(null);
    setQuantity(1);
    setSearchTerm("");
    setMedicines([]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const discountAmount = (subtotal * discount) / 100;
    const gstTotal = items.reduce(
      (sum, item) => sum + (item.amount * (item.gst_percentage || 0)) / 100,
      0
    );
    const grandTotal = subtotal - discountAmount + gstTotal + roundOff;
    return { subtotal, discountAmount, gstTotal, grandTotal };
  };

  const { subtotal, discountAmount, gstTotal, grandTotal } = calculateTotals();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.length === 0) {
      toast.error("Add at least one item.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email || undefined,
        sale_date: new Date().toISOString().split("T")[0],
        subtotal,
        discount: discountAmount,
        gst_total: gstTotal,
        round_off: roundOff,
        grand_total: grandTotal,
        paid_amount: grandTotal, // assume full payment for simplicity
        payment_method: paymentMethod,
        items: items.map((item) => ({
          batch_id: item.batch_id,
          quantity: item.quantity,
          selling_rate: item.selling_rate,
          mrp: item.mrp,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
        })),
      };
      await api.post("/pharmacy/sales", payload);
      toast.success("Sale created successfully!");
      navigate("/dashboard/pharmacy");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create sale.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <Navbar title="New Sale" roleColor="#10b981" />
      <main className="page-main">
        <div className="card" style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ marginBottom: "1.5rem" }}>🧾 New Sale</h2>

          <form onSubmit={handleSubmit}>
            {/* Customer */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              <div className="form-group">
                <label className="form-label">Customer Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={customer.name}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  placeholder="Walk-in Customer"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input
                  type="text"
                  className="form-control"
                  value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
              <div className="form-group" style={{ gridColumn: "span 2" }}>
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={customer.email}
                  onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                  placeholder="Email (optional)"
                />
              </div>
            </div>

            {/* Medicine Search & Add */}
            <div style={{ background: "#f9fafb", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="form-group" style={{ flex: 2, minWidth: 200 }}>
                  <label className="form-label">Search Medicine</label>
                  <div style={{ position: "relative" }}>
                    <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
                    <input
                      className="form-control"
                      style={{ paddingLeft: 32 }}
                      placeholder="Type medicine name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  {medicines.length > 0 && (
                    <ul style={{ listStyle: "none", padding: 0, margin: "4px 0", background: "white", border: "1px solid #e2e8f0", borderRadius: 4, maxHeight: 150, overflowY: "auto" }}>
                      {medicines.map((med) => (
                        <li
                          key={med.id}
                          style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
                          onClick={async () => {
                            setSelectedMedicine(med);
                            const batches = await fetchBatches(med.id);
                            const batch = batches.length > 0 ? batches[0] : null;
                            setSelectedBatch(batch);
                            setSearchTerm(med.medicine_name);
                            setMedicines([]);
                          }}
                        >
                          {med.medicine_name} ({med.strength || ""} {med.form || ""})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {selectedMedicine && (
                  <>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Batch</label>
                      <select
                        className="form-control"
                        value={selectedBatch?.id || ""}
                        onChange={(e) => {
                          const batch = selectedMedicine?.batches?.find(b => b.id === parseInt(e.target.value));
                          setSelectedBatch(batch);
                        }}
                      >
                        <option value="">Select batch</option>
                        {selectedMedicine.batches?.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.batch_number} (Qty: {b.quantity})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 0.5 }}>
                      <label className="form-label">Qty</label>
                      <input
                        type="number"
                        className="form-control"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                        min={1}
                      />
                    </div>
                    <button type="button" className="btn btn-primary" onClick={addItem} style={{ marginTop: "auto" }}>
                      <Plus size={16} /> Add
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Items Table */}
            {items.length > 0 && (
              <div style={{ marginBottom: "1.5rem", overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Batch</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>MRP</th>
                      <th>GST%</th>
                      <th>Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.medicine_name}</td>
                        <td>{item.batch_number}</td>
                        <td>{item.quantity}</td>
                        <td>₹{item.selling_rate}</td>
                        <td>₹{item.mrp}</td>
                        <td>{item.gst_percentage}%</td>
                        <td>₹{item.amount.toFixed(2)}</td>
                        <td>
                          <button type="button" className="btn-icon btn-icon--danger" onClick={() => removeItem(idx)}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem", marginBottom: "1.5rem" }}>
              <div>Subtotal: <strong>₹{subtotal.toFixed(2)}</strong></div>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                <label>Discount %</label>
                <input
                  type="number"
                  className="form-control"
                  style={{ width: 80 }}
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  min={0}
                  max={100}
                />
                <span>₹{discountAmount.toFixed(2)}</span>
              </div>
              <div>GST Total: <strong>₹{gstTotal.toFixed(2)}</strong></div>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                <label>Round Off</label>
                <input
                  type="number"
                  className="form-control"
                  style={{ width: 80 }}
                  value={roundOff}
                  onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>Grand Total: ₹{grandTotal.toFixed(2)}</div>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                <label>Payment Method</label>
                <select className="form-control" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => navigate("/dashboard/pharmacy")}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Creating..." : "Complete Sale"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}