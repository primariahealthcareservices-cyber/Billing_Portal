// frontend/src/pages/dashboards/EvergladesDashboard.jsx
import React from "react";
import FinanceDashboard from "../../components/FinanceDashboard.jsx";

export default function EvergladesDashboard() {
  return (
    <FinanceDashboard
      department="Everglades"
      title="Everglades Dashboard"
      roleColor="#0d9488"
    />
  );
}