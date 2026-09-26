import React from "react";
import PharmacyCrud from "../../components/pharmacy/PharmacyCrud.jsx";

export default function VendorsList() {
  return (
    <PharmacyCrud
      title="Vendors"
      apiPath="/pharmacy/vendors"
      idKey="id"
      columns={[
        { key: "vendor_code", label: "Code" },
        { key: "vendor_name", label: "Name" },
        { key: "contact_person", label: "Contact" },
        { key: "phone", label: "Phone" },
        { key: "status", label: "Status" },
        {
          key: "credit_limit",
          label: "Credit Limit",
          render: (v) => (v != null ? `₹${Number(v).toFixed(2)}` : "—"),
        },
      ]}
      formFields={[
        { name: "vendor_name", label: "Vendor Name", required: true },
        { name: "contact_person", label: "Contact Person" },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email", type: "email" },
        { name: "address", label: "Address", type: "textarea" },
        { name: "gst_number", label: "GST Number" },
        { name: "drug_license_number", label: "Drug License No." },
        { name: "payment_terms", label: "Payment Terms" },
        { name: "credit_limit", label: "Credit Limit", type: "number" },
        { name: "opening_balance", label: "Opening Balance", type: "number" },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "Active", label: "Active" },
            { value: "Inactive", label: "Inactive" },
          ],
        },
      ]}
      initialForm={() => ({
        vendor_name: "",
        contact_person: "",
        phone: "",
        email: "",
        address: "",
        gst_number: "",
        drug_license_number: "",
        payment_terms: "",
        credit_limit: 0,
        opening_balance: 0,
        status: "Active",
      })}
    />
  );
}