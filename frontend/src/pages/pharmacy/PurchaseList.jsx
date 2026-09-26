import React, { useEffect, useState } from "react";
import PharmacyCrud from "../../components/pharmacy/PharmacyCrud.jsx";
import api from "../../api/axios.js";

export default function PurchaseList() {
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    api
      .get("/pharmacy/vendors")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data.results || [];
        setVendors(
          list.map((v) => ({
            value: v.id,
            label: v.vendor_name,   // change if your field is different
          }))
        );
      })
      .catch((err) => console.error("Vendor load failed:", err));
  }, []);

  return (
    <div style={{ padding: "1.5rem" }}>
      <PharmacyCrud
        title="Purchase History"
        apiPath="/pharmacy/purchases"
        idKey="id"                 // ← change to purchase_id if that's your key
        columns={[
          { key: "purchase_number", label: "Number" },
          {
            key: "vendor_name",
            label: "Vendor",
            render: (_, item) => item.vendor?.vendor_name || "—",
          },
          { key: "purchase_date", label: "Date" },
          {
            key: "grand_total",
            label: "Total",
            render: (v) => `₹${Number(v).toFixed(2)}`,
          },
          { key: "status", label: "Status" },
        ]}
        formFields={[
          // IMPORTANT: use `name`, not `key` — PharmacyCrud reads field.name
          { name: "purchase_number", label: "Purchase Number", type: "text", required: true },
          {
            name: "vendor_id",
            label: "Vendor",
            type: "select",
            required: true,
            options: vendors,     // ← filled from API above
          },
          { name: "purchase_date", label: "Date", type: "date", required: true },
          { name: "grand_total", label: "Total", type: "number" },
          {
            name: "status",
            label: "Status",
            type: "select",
            options: [
              { value: "pending", label: "Pending" },
              { value: "received", label: "Received" },
              { value: "cancelled", label: "Cancelled" },
            ],
          },
        ]}
        initialForm={() => ({
          purchase_number: "",
          vendor_id: "",
          purchase_date: new Date().toISOString().slice(0, 10),
          grand_total: 0,
          status: "pending",
        })}
      />
    </div>
  );
}