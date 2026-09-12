import React from "react";
import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import ITDashboard from "./pages/dashboards/ITDashboard.jsx";
import ITSalesDashboard from "./pages/dashboards/ITSalesDashboard.jsx";
import PCMDashboard from "./pages/dashboards/PCMDashboard.jsx";
import MedTechDashboard from "./pages/dashboards/MedTechDashboard.jsx";
import CaredxDashboard from "./pages/dashboards/CaredxDashboard.jsx";
import SuperAdminDashboard from "./pages/dashboards/SuperAdminDashboard.jsx";
import CorporateDashboard from "./pages/dashboards/CorporateDashboard.jsx";
import AdminFunctionalUnitDashboard from "./pages/dashboards/AdminFunctionalUnitDashboard.jsx";
import ResearchDevelopmentDashboard from "./pages/dashboards/ResearchDevelopmentDashboard.jsx";
import SalesEnterpriseDashboard from "./pages/dashboards/SalesEnterpriseDashboard.jsx";
import DentalDashboard from "./pages/dashboards/DentalDashboard.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route
        path="/dashboard/it"
        element={
          <ProtectedRoute allowedRoles={["IT"]}>
            <ITDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/itsales"
        element={
          <ProtectedRoute allowedRoles={["IT Sales"]}>
            <ITSalesDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/pcm"
        element={
          <ProtectedRoute allowedRoles={["PCM"]}>
            <PCMDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/medtech"
        element={
          <ProtectedRoute allowedRoles={["MedTech"]}>
            <MedTechDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/caredx"
        element={
          <ProtectedRoute allowedRoles={["Caredx"]}>
            <CaredxDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/corporate"
        element={
          <ProtectedRoute allowedRoles={["Corporate"]}>
            <CorporateDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/adminfunctionalunit"
        element={
          <ProtectedRoute allowedRoles={["Adminstrationfunctionalunit"]}>
            <AdminFunctionalUnitDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/researchdevelopment"
        element={
          <ProtectedRoute allowedRoles={["ResearchDevelopment"]}>
            <ResearchDevelopmentDashboard />
          </ProtectedRoute>
        }
      />
      <Route
  path="/dashboard/salesenterprise"
  element={
    <ProtectedRoute allowedRoles={["SalesEnterprise"]}>
      <SalesEnterpriseDashboard />
    </ProtectedRoute>
  }
/>
      <Route
        path="/dashboard/admin"
        element={
          <ProtectedRoute allowedRoles={["SuperAdmin"]}>
            <SuperAdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* NEW: Dental dashboard — path matches ROLE_ROUTES.Dental */}
      <Route
        path="/dashboard/dental"
        element={
          <ProtectedRoute allowedRoles={["Dental"]}>
            <DentalDashboard />
          </ProtectedRoute>
        }
        />

      <Route path="*" element={<Login />} />
    </Routes>
  );
}