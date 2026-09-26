import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "../../components/Navbar.jsx"; // Adjust path if needed
import PharmacySidebar from "./PharmacySidebar.jsx";
import "./pharmacylayout.css"; // Ensure CSS is imported

export default function PharmacyLayoutRoute() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => setSidebarOpen((s) => !s);

  return (
    <div className="pharmacy-layout-wrapper">
      {/* 1. Topbar - Static across all pharmacy pages */}
      <Navbar />

      {/* 2. Body: Sidebar + Dynamic Content */}
      <div className="pharmacy-layout-body">
        <PharmacySidebar isOpen={sidebarOpen} toggleSidebar={toggleSidebar} />
        
        <main className={`pharmacy-content ${sidebarOpen ? "with-sidebar" : "full-width"}`}>
          {/* 3. Dynamic Content - Renders the specific page (Overview, New Purchase, etc.) */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}