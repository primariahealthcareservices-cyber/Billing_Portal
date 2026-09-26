import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../api/axios.js";
import Navbar from "../../components/Navbar.jsx";

export default function NewPurchase() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMedicine, setSelectedMedicine] = useState(null);
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [purchaseRate, setPurchaseRate] = useState(0);
  const [mrp, setMrp] = useState(0);
  const [sellingRate, setSellingRate] = useState(0);
  const [gstPercentage, setGstPercentage] = useState(0);
  const [discountPercentage, setDiscountPercentage] = useState(0);

  // Fetch vendors
  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const res = await api.get("/pharmacy/vendors");
        setVendors(res.data.vendors || []);
      } catch {
        toast.error("Failed to load vendors.");
      }
    };
    fetchVendors();
  }, []);

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

  const addItem = () => {
    if (!selectedMedicine) {
      toast.error("Please select a medicine.");
      return;
    }
    if (!batchNumber) {
      toast.error("Batch number is required.");
      return;
    }
    if (!expiryDate) {
      toast.error("Expiry date is required.");
      return;
    }
    if (quantity <= 0 || purchaseRate <= 0 || mrp <= 0) {
      toast.error("Quantity, purchase rate, and MRP must be positive.");
      return;
    }

    setItems([
      ...items,
      {
        medicine_id: selectedMedicine.id,
        medicine_name: selectedMedicine.medicine_name,
        batch_number: batchNumber,
        manufacturing_date: new Date().toISOString().split("T")[0],
        expiry_date: expiryDate,
        quantity,
        purchase_rate: purchaseRate,
        mrp,
        selling_rate: sellingRate || mrp,
        gst_percentage: gstPercentage,
        discount_percentage: discountPercentage,
        amount: quantity * purchaseRate,
      },
    ]);

    // Reset fields
    setSelectedMedicine(null);
    setBatchNumber("");
    setExpiryDate("");
    setQuantity(1);
    setPurchaseRate(0);
    setMrp(0);
    setSellingRate(0);
    setGstPercentage(0);
    setDiscountPercentage(0);
    setSearchTerm("");
    setMedicines([]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const discount = items.reduce((sum, item) => sum + (item.amount * (item.discount_percentage || 0)) / 100, 0);
    const gst = items.reduce((sum, item) => sum + (item.amount * (item.gst_percentage || 0)) / 100, 0);
    const other = 0; // can add other charges later
    const grandTotal = subtotal - discount + gst + other;
    return { subtotal, discount, gst, other, grandTotal };
  };

  const { subtotal, discount, gst, other, grandTotal } = calculateTotals();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedVendor) {
      toast.error("Please select a vendor.");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one item.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        vendor_id: selectedVendor.id,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        purchase_date: new Date().toISOString().split("T")[0],
        subtotal,
        discount,
        gst_total: gst,
        other_charges: other,
        grand_total: grandTotal,
        paid_amount: grandTotal, // assume full payment
        items: items.map((item) => ({
          medicine_id: item.medicine_id,
          batch_number: item.batch_number,
          manufacturing_date: item.manufacturing_date,
          expiry_date: item.expiry_date,
          quantity: item.quantity,
          purchase_rate: item.purchase_rate,
          mrp: item.mrp,
          selling_rate: item.selling_rate,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
        })),
      };
      await api.post("/pharmacy/purchases", payload);
      toast.success("Purchase created successfully!");
      navigate("/dashboard/pharmacy");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create purchase.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <Navbar title="New Purchase" roleColor="#10b981" />
      <main className="page-main">
        <div className="card" style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ marginBottom: "1.5rem" }}>📦 New Purchase</h2>

          <form onSubmit={handleSubmit}>
            {/* Vendor & Invoice */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              <div className="form-group">
                <label className="form-label">Vendor</label>
                <select
                  className="form-control"
                  value={selectedVendor?.id || ""}
                  onChange={(e) => {
                    const vendor = vendors.find(v => v.id === parseInt(e.target.value));
                    setSelectedVendor(vendor);
                  }}
                  required
                >
                  <option value="">Select Vendor</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.vendor_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Invoice Number</label>
                <input
                  type="text"
                  className="form-control"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-001"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Invoice Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
            </div>

            {/* Add Item */}
            <div style={{ background: "#f9fafb", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr", gap: "0.5rem", alignItems: "flex-end" }}>
                <div className="form-group">
                  <label className="form-label">Medicine</label>
                  <div style={{ position: "relative" }}>
                    <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
                    <input
                      className="form-control"
                      style={{ paddingLeft: 32 }}
                      placeholder="Search medicine..."
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
                          onClick={() => {
                            setSelectedMedicine(med);
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
                <div className="form-group">
                  <label className="form-label">Batch</label>
                  <input
                    type="text"
                    className="form-control"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    placeholder="Batch"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Expiry</label>
                  <input
                    type="date"
                    className="form-control"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Qty</label>
                  <input
                    type="number"
                    className="form-control"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                    min={1}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Purchase Rate</label>
                  <input
                    type="number"
                    className="form-control"
                    value={purchaseRate}
                    onChange={(e) => setPurchaseRate(parseFloat(e.target.value) || 0)}
                    min={0}
                    step={0.01}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">MRP</label>
                  <input
                    type="number"
                    className="form-control"
                    value={mrp}
                    onChange={(e) => setMrp(parseFloat(e.target.value) || 0)}
                    min={0}
                    step={0.01}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Rate</label>
                  <input
                    type="number"
                    className="form-control"
                    value={sellingRate}
                    onChange={(e) => setSellingRate(parseFloat(e.target.value) || 0)}
                    min={0}
                    step={0.01}
                    placeholder="MRP if empty"
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.5rem", marginTop: "0.5rem", alignItems: "flex-end" }}>
                <div className="form-group">
                  <label className="form-label">GST %</label>
                  <input
                    type="number"
                    className="form-control"
                    value={gstPercentage}
                    onChange={(e) => setGstPercentage(parseFloat(e.target.value) || 0)}
                    min={0}
                    max={100}
                    step={0.1}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Discount %</label>
                  <input
                    type="number"
                    className="form-control"
                    value={discountPercentage}
                    onChange={(e) => setDiscountPercentage(parseFloat(e.target.value) || 0)}
                    min={0}
                    max={100}
                    step={0.1}
                  />
                </div>
                <button type="button" className="btn btn-primary" onClick={addItem} style={{ marginBottom: "0.25rem" }}>
                  <Plus size={16} /> Add
                </button>
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
                        <td>₹{item.purchase_rate}</td>
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
              <div>Discount: ₹{discount.toFixed(2)}</div>
              <div>GST: ₹{gst.toFixed(2)}</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>Grand Total: ₹{grandTotal.toFixed(2)}</div>
            </div>

            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => navigate("/dashboard/pharmacy")}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Saving..." : "Complete Purchase"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}