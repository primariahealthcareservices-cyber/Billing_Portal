import React from "react";
import { Clock } from "lucide-react";

export default function ComingSoon({ title }) {
  return (
    <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
      <Clock size={48} style={{ color: "#94a3b8", marginBottom: "1rem" }} />
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, color: "#1e293b" }}>{title}</h2>
      <p style={{ color: "#64748b", marginTop: "0.5rem" }}>This module is under development. Coming soon!</p>
    </div>
  );
}