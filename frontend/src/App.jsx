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

// ---------- PHARMACY IMPORTS (all unique) ----------
import PharmacyDashboard from "./pages/dashboards/PharmacyDashboard.jsx";
import PharmacyLayoutRoute from "./pages/pharmacy/PharmacyLayoutRoute.jsx";
import NewSale from "./pages/pharmacy/NewSale.jsx";
import NewPurchase from "./pages/pharmacy/NewPurchase.jsx";
import MedicineList from "./pages/pharmacy/MedicineList.jsx";
import MedicineCategories from "./pages/pharmacy/MedicineCategories.jsx";
import ManufacturersList from "./pages/pharmacy/ManufacturersList.jsx";
import VendorsList from "./pages/pharmacy/VendorsList.jsx";
import VendorPayments from "./pages/pharmacy/VendorPayments.jsx";
import PurchaseList from "./pages/pharmacy/PurchaseList.jsx";
import PurchaseReturns from "./pages/pharmacy/PurchaseReturns.jsx";
import InventoryStock from "./pages/pharmacy/InventoryStock.jsx";
import InventoryBatches from "./pages/pharmacy/InventoryBatches.jsx";
import LowStock from "./pages/pharmacy/LowStock.jsx";
import ExpiryList from "./pages/pharmacy/ExpiryList.jsx";
import StockMovements from "./pages/pharmacy/StockMovements.jsx";
import SalesList from "./pages/pharmacy/SalesList.jsx";
import SalesReturns from "./pages/pharmacy/SalesReturns.jsx";
import CustomersList from "./pages/pharmacy/CustomersList.jsx";
import ExpensesList from "./pages/pharmacy/ExpensesList.jsx";
import InvoicesList from "./pages/pharmacy/InvoicesList.jsx";
import Reports from "./pages/pharmacy/Reports.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      {/* IT Dashboard */}
      <Route
        path="/dashboard/it"
        element={
          <ProtectedRoute allowedRoles={["IT"]}>
            <ITDashboard />
          </ProtectedRoute>
        }
      />

      {/* IT Sales Dashboard */}
      <Route
        path="/dashboard/itsales"
        element={
          <ProtectedRoute allowedRoles={["IT Sales"]}>
            <ITSalesDashboard />
          </ProtectedRoute>
        }
      />

      {/* PCM Dashboard */}
      <Route
        path="/dashboard/pcm"
        element={
          <ProtectedRoute allowedRoles={["PCM"]}>
            <PCMDashboard />
          </ProtectedRoute>
        }
      />

      {/* MedTech Dashboard */}
      <Route
        path="/dashboard/medtech"
        element={
          <ProtectedRoute allowedRoles={["MedTech"]}>
            <MedTechDashboard />
          </ProtectedRoute>
        }
      />

      {/* Caredx Dashboard */}
      <Route
        path="/dashboard/caredx"
        element={
          <ProtectedRoute allowedRoles={["Caredx"]}>
            <CaredxDashboard />
          </ProtectedRoute>
        }
      />

      {/* Corporate Dashboard */}
      <Route
        path="/dashboard/corporate"
        element={
          <ProtectedRoute allowedRoles={["Corporate"]}>
            <CorporateDashboard />
          </ProtectedRoute>
        }
      />

      {/* Admin Functional Unit Dashboard */}
      <Route
        path="/dashboard/adminfunctionalunit"
        element={
          <ProtectedRoute allowedRoles={["Adminstrationfunctionalunit"]}>
            <AdminFunctionalUnitDashboard />
          </ProtectedRoute>
        }
      />

      {/* Research & Development Dashboard */}
      <Route
        path="/dashboard/researchdevelopment"
        element={
          <ProtectedRoute allowedRoles={["ResearchDevelopment"]}>
            <ResearchDevelopmentDashboard />
          </ProtectedRoute>
        }
      />

      {/* SuperAdmin Dashboard */}
      <Route
        path="/dashboard/admin"
        element={
          <ProtectedRoute allowedRoles={["SuperAdmin"]}>
            <SuperAdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Sales Enterprise Dashboard */}
      <Route
        path="/dashboard/salesenterprise"
        element={
          <ProtectedRoute allowedRoles={["SalesEnterprise", "SuperAdmin"]}>
            <SalesEnterpriseDashboard mode="full" />
          </ProtectedRoute>
        }
      />

      {/* ==================== PHARMACY MODULE ==================== */}
      {/* Pharmacy Dashboard with nested routes (sidebar + content) */}
      <Route
        path="/dashboard/pharmacy"
        element={
          <ProtectedRoute allowedRoles={["Pharmacy", "SuperAdmin"]}>
            <PharmacyLayoutRoute />
          </ProtectedRoute>
        }
      >
        <Route index element={<PharmacyDashboard />} />
        <Route path="medicines" element={<MedicineList />} />
        <Route path="categories" element={<MedicineCategories />} />
        <Route path="manufacturers" element={<ManufacturersList />} />
        <Route path="vendors" element={<VendorsList />} />
        <Route path="vendor-payments" element={<VendorPayments />} />
        <Route path="purchases" element={<PurchaseList />} />
        <Route path="purchases/new" element={<NewPurchase />} />
        <Route path="purchase-returns" element={<PurchaseReturns />} />
        <Route path="inventory" element={<InventoryStock />} />
        <Route path="inventory/batches" element={<InventoryBatches />} />
        <Route path="inventory/low-stock" element={<LowStock />} />
        <Route path="inventory/expiry" element={<ExpiryList />} />
        <Route path="inventory/movements" element={<StockMovements />} />
        <Route path="sales" element={<SalesList />} />
        <Route path="sales/new" element={<NewSale />} />
        <Route path="sales-returns" element={<SalesReturns />} />
        <Route path="customers" element={<CustomersList />} />
        <Route path="expenses" element={<ExpensesList />} />
        <Route path="invoices" element={<InvoicesList />} />
        <Route path="reports" element={<Reports />} />
      </Route>

      {/* Standalone New Sale / POS (outside sidebar, full page) */}
      <Route
        path="/pharmacy/sales/new"
        element={
          <ProtectedRoute allowedRoles={["Pharmacy", "SuperAdmin"]}>
            <NewSale />
          </ProtectedRoute>
        }
      />

      {/* Standalone New Purchase (outside sidebar, full page) */}
      <Route
        path="/pharmacy/purchases/new"
        element={
          <ProtectedRoute allowedRoles={["Pharmacy", "SuperAdmin"]}>
            <NewPurchase />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Login />} />
    </Routes>
  );
}