import React, { useState, useEffect } from "react";
import PharmacyCrud from "../../components/pharmacy/PharmacyCrud.jsx";
import api from "../../api/axios.js";

export default function MedicineList() {
  const [categories, setCategories] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/pharmacy/categories"),
      api.get("/pharmacy/manufacturers"),
    ])
      .then(([catRes, manRes]) => {
        // Handle both flat arrays and wrapped responses
        const cats = Array.isArray(catRes.data)
          ? catRes.data
          : catRes.data.categories || [];
        const mans = Array.isArray(manRes.data)
          ? manRes.data
          : manRes.data.manufacturers || [];
        setCategories(cats);
        setManufacturers(mans);
      })
      .catch((err) => {
        console.error("Failed to load dropdown data:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const manufacturerOptions = manufacturers.map((m) => ({
    value: m.id,
    label: m.name,
  }));

  return (
    <div style={{ padding: "1.5rem" }}>
      <PharmacyCrud
        title="Medicines"
        apiPath="/pharmacy/medicines"
        transformData={(d) => d.medicines || d.data || []}   // <-- THE FIX
        columns={[
          { key: "medicine_code", label: "Code" },
          { key: "medicine_name", label: "Name" },
          { key: "generic_name", label: "Generic" },
          {
            key: "category",
            label: "Category",
            render: (_, item) => item.category?.name || "—",
          },
          {
            key: "manufacturer",
            label: "Manufacturer",
            render: (_, item) => item.manufacturer?.name || "—",
          },
          { key: "strength", label: "Strength" },
          { key: "form", label: "Form" },
          { key: "unit", label: "Unit" },
          { key: "gst_percentage", label: "GST%" },
          { key: "reorder_level", label: "Reorder" },
        ]}
        formFields={[
          { name: "medicine_code", label: "Code", required: false },
          { name: "medicine_name", label: "Name", required: true },
          { name: "generic_name", label: "Generic Name" },
          {
            name: "category_id",
            label: "Category",
            type: "select",
            options: categoryOptions,
          },
          {
            name: "manufacturer_id",
            label: "Manufacturer",
            type: "select",
            options: manufacturerOptions,
          },
          { name: "dosage", label: "Dosage" },
          { name: "strength", label: "Strength" },
          { name: "form", label: "Form" },
          { name: "unit", label: "Unit" },
          { name: "pack_size", label: "Pack Size", type: "number" },
          { name: "hsn_code", label: "HSN Code" },
          { name: "gst_percentage", label: "GST %", type: "number" },
          { name: "reorder_level", label: "Reorder Level", type: "number" },
          {
            name: "prescription_required",
            label: "Prescription Required",
            type: "select",
            options: [
              { value: true, label: "Yes" },
              { value: false, label: "No" },
            ],
          },
        ]}
        initialForm={() => ({
          medicine_code: "",
          medicine_name: "",
          generic_name: "",
          category_id: "",
          manufacturer_id: "",
          dosage: "",
          strength: "",
          form: "",
          unit: "",
          pack_size: 0,
          hsn_code: "",
          gst_percentage: 0,
          reorder_level: 0,
          prescription_required: false,
        })}
      />
    </div>
  );
}