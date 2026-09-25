// frontend/src/components/StatCards.jsx
import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  FileText,
  CreditCard,
  Landmark,     // Capital icon
} from "lucide-react";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

function StatCard({ icon: Icon, label, value, iconClass, sub }) {
  return (
    <div className="card stat-card">
      <div className={`stat-icon ${iconClass}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        {sub && <p className="stat-sub">{sub}</p>}
      </div>
    </div>
  );
}

export default function StatCards({
  totalIncome,
  totalExpenses,
  totalCapital,
  profit,
  entryCount,
  teamMembers,
  paidToOtherLabs,
  showCapital = false,
}) {
  const isProfitNegative = profit < 0;

  return (
    <div className="stat-grid">
      {/* ✅ Capital card renders FIRST when enabled (CEO Dashboard) */}
      {showCapital && (
        <StatCard
          icon={Landmark}
          label="Capital"
          value={formatCurrency(totalCapital)}
          iconClass="stat-icon--capital"
        />
      )}

      <StatCard
        icon={TrendingUp}
        label="Income"
        value={formatCurrency(totalIncome)}
        iconClass="stat-icon--income"
      />
      <StatCard
        icon={TrendingDown}
        label="Expenses"
        value={formatCurrency(totalExpenses)}
        iconClass="stat-icon--expense"
      />
      <StatCard
        icon={Wallet}
        label="Profit"
        value={formatCurrency(profit)}
        iconClass={`stat-icon--profit ${isProfitNegative ? "negative" : ""}`}
      />
      <StatCard
        icon={FileText}
        label="Total Entries"
        value={entryCount ?? 0}
        iconClass="stat-icon--entries"
      />
      {teamMembers !== undefined && (
        <StatCard
          icon={Users}
          label="Team Members"
          value={teamMembers}
          iconClass="stat-icon--team"
        />
      )}
      {paidToOtherLabs !== undefined && paidToOtherLabs !== null && (
        <StatCard
          icon={CreditCard}
          label="Paid to Other Labs"
          value={formatCurrency(paidToOtherLabs)}
          iconClass="stat-icon--other-labs"
        />
      )}
    </div>
  );
}