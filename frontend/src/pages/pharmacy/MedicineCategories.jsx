import React from "react";
import PharmacyCrud from "../../components/pharmacy/PharmacyCrud.jsx";

export default function MedicineCategories() {
  return (
    <PharmacyCrud
      title="Categories"
      apiPath="/pharmacy/categories"
      idKey="id"
      columns={[
        { key: "name", label: "Name" },
        { key: "description", label: "Description" },
      ]}
      formFields={[
        { name: "name", label: "Name", required: true },
        { name: "description", label: "Description", type: "textarea" },
      ]}
      initialForm={() => ({ name: "", description: "" })}
    />
  );
}