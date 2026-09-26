import React from "react";
import { Link } from "react-router-dom";           // ← ADD
import PharmacyCrud from "../../components/pharmacy/PharmacyCrud.jsx";

function calcSaleTotals(form) {
  const subtotal = Number(form.subtotal) || 0;
  const discount = Number(form.discount) || 0;
  const gstPercent = Number(form.gst_percent) || 0;

  const taxable = Math.max(subtotal - discount, 0);
  const gst_total = +((taxable * gstPercent) / 100).toFixed(2);
  const grand_total = +(taxable + gst_total).toFixed(2);

  return { gst_total, grand_total };
}

export default function SalesList() {
  return (
    <div style={{ padding: "1.5rem" }}>
      <PharmacyCrud
        title="Sales History"
        apiPath="/pharmacy/sales"
        columns={[
          { key: "sale_number", label: "Number" },
          { key: "customer_name", label: "Customer" },
          { key: "sale_date", label: "Date" },
          {
            key: "grand_total",
            label: "Total",
            render: (v) => `₹${Number(v || 0).toFixed(2)}`,
          },
          { key: "payment_method", label: "Payment" },
          { key: "status", label: "Status" },
          {
            key: "_invoice",
            label: "Invoice",
            render: (_, item) => (
              <Link                                   // ← was <a>
                to={`/dashboard/pharmacy/invoices/${item.id}`}   // ← use the layout route
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  background: "#2563eb",
                  color: "white",
                  borderRadius: 4,
                  fontSize: 12,
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                🖨 Invoice
              </Link>
            ),
          },
        ]}
        formFields={[
          { name: "customer_name", label: "Customer Name", type: "text" },
          { name: "customer_phone", label: "Customer Phone", type: "text" },
          { name: "sale_date", label: "Sale Date", type: "date" },
          { name: "subtotal", label: "Subtotal", type: "number" },
          { name: "discount", label: "Discount", type: "number" },
          {
            name: "gst_percent",
            label: "GST %",
            type: "select",
            options: [
              { value: 0, label: "0%" },
              { value: 3, label: "3%" },
              { value: 5, label: "5%" },
              { value: 12, label: "12%" },
              { value: 18, label: "18%" },
              { value: 28, label: "28%" },
            ],
          },
          { name: "gst_total", label: "GST Amount", type: "number", readOnly: true },
          { name: "grand_total", label: "Grand Total", type: "number", required: true, readOnly: true },
          { name: "paid_amount", label: "Paid Amount", type: "number" },
          {
            name: "payment_method",
            label: "Payment Method",
            type: "select",
            options: [
              { value: "Cash", label: "Cash" },
              { value: "Card", label: "Card" },
              { value: "UPI", label: "UPI" },
              { value: "Credit", label: "Credit" },
            ],
          },
          {
            name: "status",
            label: "Status",
            type: "select",
            options: [
              { value: "Completed", label: "Completed" },
              { value: "Pending", label: "Pending" },
              { value: "Cancelled", label: "Cancelled" },
              { value: "Refunded", label: "Refunded" },
            ],
          },
          { name: "remarks", label: "Remarks", type: "textarea" },
        ]}
        initialForm={() => ({
          customer_name: "",
          customer_phone: "",
          sale_date: "",
          subtotal: "",
          discount: "",
          gst_percent: 0,
          gst_total: 0,
          grand_total: 0,
          paid_amount: "",
          payment_method: "",
          status: "Completed",
          remarks: "",
        })}
      />
    </div>
  );
}