import React from "react";
import PharmacyLayout from "../../components/pharmacy/PharmacyLayout.jsx";
import { Outlet } from "react-router-dom";

export default function PharmacyLayoutRoute() {
  return (
    <PharmacyLayout>
      <Outlet />
    </PharmacyLayout>
  );
}