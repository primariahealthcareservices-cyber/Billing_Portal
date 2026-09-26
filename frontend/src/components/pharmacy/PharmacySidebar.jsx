import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Pill, Tags, Factory, Truck, Wallet, ShoppingCart,
  Undo2, Boxes, Layers, AlertTriangle, CalendarClock, ArrowLeftRight,
  Receipt, RotateCcw, Users, FileText, FileStack, BarChart3, ChevronLeft, ChevronRight, ChevronDown
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [{ to: "/dashboard/pharmacy", label: "Overview", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Catalog",
    icon: Boxes,
    items: [
      { to: "/dashboard/pharmacy/medicines", label: "Medicines", icon: Pill },
      { to: "/dashboard/pharmacy/categories", label: "Categories", icon: Tags },
      { to: "/dashboard/pharmacy/manufacturers", label: "Manufacturers", icon: Factory },
    ],
  },
  {
    label: "Purchasing",
    icon: Truck,
    items: [
      { to: "/dashboard/pharmacy/vendors", label: "Vendors", icon: Truck },
      { to: "/dashboard/pharmacy/vendor-payments", label: "Vendor Payments", icon: Wallet },
      { to: "/dashboard/pharmacy/purchases", label: "Purchases", icon: ShoppingCart },
      { to: "/dashboard/pharmacy/purchase-returns", label: "Purchase Returns", icon: Undo2 },
    ],
  },
  {
    label: "Inventory",
    icon: Boxes,
    items: [
      { to: "/dashboard/pharmacy/inventory", label: "Stock", icon: Boxes },
      { to: "/dashboard/pharmacy/inventory/batches", label: "Batches", icon: Layers },
      { to: "/dashboard/pharmacy/inventory/low-stock", label: "Low Stock", icon: AlertTriangle },
      { to: "/dashboard/pharmacy/inventory/expiry", label: "Expiry", icon: CalendarClock },
      { to: "/dashboard/pharmacy/inventory/movements", label: "Stock Movements", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Sales",
    icon: Receipt,
    items: [
      { to: "/dashboard/pharmacy/sales", label: "Sales", icon: Receipt },
      { to: "/dashboard/pharmacy/sales-returns", label: "Sales Returns", icon: RotateCcw },
      { to: "/dashboard/pharmacy/customers", label: "Customers", icon: Users },
    ],
  },
  {
    label: "Finance",
    icon: FileText,
    items: [
      { to: "/dashboard/pharmacy/expenses", label: "Expenses", icon: FileText },
      { to: "/dashboard/pharmacy/invoices", label: "Invoices", icon: FileStack },
      { to: "/dashboard/pharmacy/reports", label: "Reports", icon: BarChart3 },
    ],
  },
];

export default function PharmacySidebar({ isOpen, toggleSidebar }) {
  // State to manage which dropdowns are open
  const [openSections, setOpenSections] = useState({
    Catalog: true,
    Purchasing: false,
    Inventory: false,
    Sales: false,
    Finance: false,
  });

  const toggleSection = (label) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside className={`pharmacy-sidebar ${isOpen ? "open" : "closed"}`}>
      {/* Header */}
      <div className="pharmacy-sidebar-header">
        <div className="pharmacy-sidebar-brand">
          {isOpen && <span className="pharmacy-sidebar-title">Pharmacy</span>}
        </div>
        <button className="pharmacy-sidebar-toggle" onClick={toggleSidebar}>
          {isOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="pharmacy-sidebar-nav">
        {NAV_SECTIONS.map((section) => {
          // If it's a single link (Overview), render it directly
          if (section.items.length === 1 && section.label === "Overview") {
            return (
              <NavLink
                key={section.items[0].to}
                to={section.items[0].to}
                end={section.items[0].end}
                className={({ isActive }) =>
                  `pharmacy-sidebar-link ${isActive ? "active" : ""}`
                }
              >
                <LayoutDashboard size={18} className="pharmacy-sidebar-icon" />
                {isOpen && <span>{section.items[0].label}</span>}
              </NavLink>
            );
          }

          // If it's a group, render the accordion
          const SectionIcon = section.icon;
          const isSectionOpen = openSections[section.label];

          return (
            <div className="pharmacy-sidebar-section" key={section.label}>
              {/* Main Category Toggle */}
              <button
                className={`pharmacy-sidebar-group-toggle ${isSectionOpen ? "open" : ""}`}
                onClick={() => toggleSection(section.label)}
              >
                <SectionIcon size={18} className="pharmacy-sidebar-icon" />
                {isOpen && <span>{section.label}</span>}
                {isOpen && (
                  <ChevronDown
                    size={14}
                    className={`pharmacy-sidebar-chevron ${isSectionOpen ? "rotate" : ""}`}
                  />
                )}
              </button>

              {/* Sub-category Links */}
              {isOpen && isSectionOpen && (
                <div className="pharmacy-sidebar-submenu">
                  {section.items.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) =>
                        `pharmacy-sidebar-submenu-link ${isActive ? "active" : ""}`
                      }
                    >
                      <Icon size={16} className="pharmacy-sidebar-icon" />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}