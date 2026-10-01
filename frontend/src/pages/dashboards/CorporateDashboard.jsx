// frontend/src/pages/dashboards/CorporateDashboard.jsx
import React, { useState } from "react";
import FinanceDashboard from "../../components/FinanceDashboard.jsx";
import CopperBookPage from "../../components/CopperBookPage.jsx";

export default function CorporateDashboard() {
  const [showCopperBook, setShowCopperBook] = useState(false);

  // When CopperBook is open, render it full-screen with a Back button.
  if (showCopperBook) {
    return <CopperBookPage onBack={() => setShowCopperBook(false)} />;
  }

  // Otherwise, render the normal Finance dashboard and pass the
  // onCopperBook callback so the Navbar can show the CopperBook button.
  return (
    <FinanceDashboard
      department="Corporate"
      title="Corporate Management"
      roleColor="#1e293b"
      paginateByCategory={true}
      itemsPerPage={30}
      onCopperBook={() => setShowCopperBook(true)}
    />
  );
}