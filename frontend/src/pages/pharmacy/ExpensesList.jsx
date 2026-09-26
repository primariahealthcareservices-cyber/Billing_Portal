import React from "react";
import PharmacyCrud from "../../components/pharmacy/PharmacyCrud.jsx";

export default function ExpensesList() {
  return (
    <div style={{ padding: "1.5rem" }}>
      <PharmacyCrud
        title="Expenses"
        apiPath="/pharmacy/expenses"
        columns={[
          { key: "expense_number", label: "Number" },
          { key: "category_name", label: "Category", render: (_, item) => item.category?.name || "—" },
          { key: "amount", label: "Amount", render: (v) => `₹${Number(v).toFixed(2)}` },
          { key: "expense_date", label: "Date" },
          { key: "payment_method", label: "Payment" },
        ]}
        formFields={[
          { name: "expense_category_id", label: "Category", type: "select", options: [] },
          { name: "amount", label: "Amount", type: "number", required: true },
          { name: "payment_method", label: "Payment Method", type: "select", options: [{ value: "Cash", label: "Cash" }, { value: "Card", label: "Card" }, { value: "UPI", label: "UPI" }, { value: "Bank Transfer", label: "Bank Transfer" }] },
          { name: "expense_date", label: "Date", type: "date" },
          { name: "description", label: "Description", type: "textarea" },
          { name: "reference_number", label: "Reference Number" },
        ]}
        initialForm={() => ({
          expense_number: "",
          expense_category_id: "",
          amount: 0,
          payment_method: "Cash",
          expense_date: new Date().toISOString().split("T")[0],
          description: "",
          reference_number: "",
        })}
      />
    </div>
  );
}