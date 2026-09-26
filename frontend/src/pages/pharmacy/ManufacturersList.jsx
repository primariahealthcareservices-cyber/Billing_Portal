import React from "react";
import PharmacyCrud from "../../components/pharmacy/PharmacyCrud.jsx";

export default function ManufacturersList() {
  return (
    <PharmacyCrud
      title="Manufacturers"
      apiPath="/pharmacy/manufacturers"
      idKey="id"
      columns={[
        { key: "name", label: "Name" },
        { key: "contact", label: "Contact" },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
        { key: "gst_number", label: "GST No." },
        {
          key: "total_price",
          label: "Total",
          render: (v) => `₹${Number(v || 0).toFixed(2)}`,
        },
        {
          key: "paid",
          label: "Paid",
          render: (v) => `₹${Number(v || 0).toFixed(2)}`,
        },
        {
          key: "balance",
          label: "Balance",
          render: (v) => {
            const n = Number(v || 0);
            const color = n > 0 ? "#b91c1c" : "#16a34a";
            return <span style={{ color, fontWeight: 600 }}>₹{n.toFixed(2)}</span>;
          },
        },
        {
          key: "payment_status",
          label: "Status",
          render: (v) => {
            const colors = {
              Paid: "#16a34a",
              Partial: "#d97706",
              Pending: "#b91c1c",
            };
            return (
              <span
                style={{
                  background: colors[v] || "#6b7280",
                  color: "white",
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              >
                {v || "Pending"}
              </span>
            );
          },
        },
      ]}
      formFields={[
        { name: "name", label: "Name", required: true },
        { name: "contact", label: "Contact Person" },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email", type: "email" },
        { name: "address", label: "Address", type: "textarea" },
        { name: "gst_number", label: "GST Number" },

        // --- payment tracking ---
        {
          name: "payment_type",
          label: "Payment Type",
          type: "select",
          options: [
            { value: "Cash", label: "Cash" },
            { value: "Card", label: "Card" },
            { value: "UPI", label: "UPI" },
            { value: "Credit", label: "Credit" },
          ],
        },
        { name: "paid", label: "Paid Amount", type: "number" },
        {
          name: "payment_status",
          label: "Payment Status",
          type: "select",
          options: [
            { value: "Pending", label: "Pending" },
            { value: "Partial", label: "Partial" },
            { value: "Paid", label: "Paid" },
          ],
        },

        // --- product catalog / purchase line items ---
        {
          name: "products",
          label: "Products (buy / catalog)",
          type: "lineItems",
          columns: [
            { key: "product_name", label: "Product", type: "text" },
            { key: "quantity", label: "Qty", type: "number" },
            { key: "unit_price", label: "Unit Price", type: "number" },
            { key: "price", label: "Price", type: "number" },
          ],
          newRow: () => ({
            product_name: "",
            quantity: 0,
            unit_price: 0,
            price: 0,
          }),
          autoCompute: (row) => {
            const qty = Number(row.quantity || 0);
            const unit = Number(row.unit_price || 0);
            // if the user hasn't overridden price, compute it
            const auto = qty * unit;
            return {
              ...row,
              price: row.price && Number(row.price) !== 0 ? row.price : auto,
            };
          },
        },
      ]}
      initialForm={() => ({
        name: "",
        contact: "",
        phone: "",
        email: "",
        address: "",
        gst_number: "",
        payment_type: "",
        paid: 0,
        payment_status: "Pending",
        products: [],
      })}
    />
  );
}