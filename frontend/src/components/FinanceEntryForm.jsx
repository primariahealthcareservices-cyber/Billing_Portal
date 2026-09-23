// frontend/src/components/FinanceEntryForm.jsx
import React, { useEffect, useState } from "react";
import { X, Plus, Trash2, FileText } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/axios.js";

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

let itemKeyCounter = 0;
const nextItemKey = () => {
  itemKeyCounter += 1;
  return `item-${Date.now()}-${itemKeyCounter}`;
};

const emptyItem = () => ({
  _key: nextItemKey(),
  item_name: "",
  quantity: "1",
  unit_price: "",
});

const emptyEmployee = () => ({
  _key: nextItemKey(),
  exec_department: "",
  employee_name: "",
  salary_amount: "",
  allowance_amount: "",
  total: 0,
  remarks: "",
});

const formatCurrency = (value) => {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(number);
};

const apiOrigin = (api.defaults.baseURL || "")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");

const invoiceHref = (entry) => {
  if (!entry?.invoice_url) return null;
  const token = localStorage.getItem("token");
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
  if (entry.invoice_url.startsWith("http://") || entry.invoice_url.startsWith("https://")) {
    return `${entry.invoice_url}${entry.invoice_url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  }
  return `${apiOrigin}${entry.invoice_url}${tokenParam}`;
};

// Department mapping for dropdown display (keys vs labels)
const DEPARTMENTS_CONFIG = [
  { label: "Corporate Management", value: "Corporate" },
  { label: "Office Administration", value: "Adminstrationfunctionalunit" },
  { label: "CareDx", value: "Caredx" },
  { label: "IT Development", value: "IT" },
  { label: "IT Sales", value: "IT Sales" },
  { label: "MedTech", value: "MedTech" },
  { label: "PCM", value: "PCM" },
  { label: "Research Development", value: "ResearchDevelopment" },
  { label: "Dental", value: "Dental" },
];

/* ---------------- CATEGORY FIELD MAPS ---------------- */

const OFFICE_ADMIN_CATEGORY_FIELDS = {
  "Travel & Entertainment (T&E)": { showEmployeeName: true, showVehicleType: true, labelName: "Employee/Person Name", labelVehicle: "Transport/Travel Type", showPurpose: true },
  "Marketing": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Office Supplies & Equipment": { showEmployeeName: true, showVehicleType: false, labelName: "Asset/Item Name", showPurpose: true },
  "General Operations": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Innovation": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Miscellaneous": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Business Services Revenue": { showEmployeeName: true, showVehicleType: false, labelName: "Service Name", showPurpose: false },
  "Supplies & Equipment": { showEmployeeName: true, showVehicleType: false, labelName: "Item/Equipment Name", showPurpose: true },
  "Guest Concierge": { showEmployeeName: true, showVehicleType: false, labelName: "Guest/Person Name", showPurpose: true },
  "Facilities & Overhead": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Consulting": { showEmployeeName: true, showVehicleType: false, labelName: "Consultant/Company Name", showPurpose: true },
  "Management Fees": { showEmployeeName: true, showVehicleType: false, labelName: "Vendor/Company Name", showPurpose: true },
  "Other": { showEmployeeName: true, showVehicleType: false, labelName: "Name/Item", showPurpose: true },
  "Outsourced Services": { showEmployeeName: true, showVehicleType: false, labelName: "Vendor/Company Name", showPurpose: true },
  "Events-Conferences-Training": { showEmployeeName: true, showVehicleType: false, labelName: "Event/Training Name", showPurpose: true },
};

const IT_CATEGORY_FIELDS = {
  "Travel & Entertainment (T&E)": { showEmployeeName: true, showVehicleType: true, labelName: "Employee/Person Name", labelVehicle: "Transport/Travel Type", showPurpose: true },
  "Marketing": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Supplies & Equipments": { showEmployeeName: true, showVehicleType: false, labelName: "Item/Equipment Name", showPurpose: true },
  "General Operations": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Innovation": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Miscellaneous": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Business Services Revenue": { showEmployeeName: true, showVehicleType: false, labelName: "Service Name", showPurpose: false },
  "Guest Concierge": { showEmployeeName: true, showVehicleType: false, labelName: "Guest/Person Name", showPurpose: true },
  "Facilities & Overhead": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Outsourced Services": { showEmployeeName: true, showVehicleType: false, labelName: "Vendor/Company Name", showPurpose: true },
  "Events-Conferences-Training": { showEmployeeName: true, showVehicleType: false, labelName: "Event/Training Name", showPurpose: true },
  "Consulting": { showEmployeeName: true, showVehicleType: false, labelName: "Consultant/Company Name", showPurpose: true },
  "Management Fees": { showEmployeeName: true, showVehicleType: false, labelName: "Vendor/Company Name", showPurpose: true },
  "Other": { showEmployeeName: true, showVehicleType: false, labelName: "Name/Item", showPurpose: true },
};

const IT_SALES_CATEGORY_FIELDS = {
  "Travel & Entertainment (T&E)": { showEmployeeName: true, showVehicleType: true, labelName: "Employee/Person Name", labelVehicle: "Transport/Travel Type", showPurpose: true },
  "Marketing": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Sales Enablement & Tech Stack": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Legal/Administrative Expenses": { showEmployeeName: true, showVehicleType: false, labelName: "Vendor/Person Name", showPurpose: true },
  "Outsourced Services": { showEmployeeName: true, showVehicleType: false, labelName: "Vendor/Company Name", showPurpose: true },
  "Facilities & Overhead": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Supplies & Equipments": { showEmployeeName: true, showVehicleType: false, labelName: "Item/Equipment Name", showPurpose: true },
  "Guest Concierge": { showEmployeeName: true, showVehicleType: false, labelName: "Guest/Person Name", showPurpose: true },
  "Events-Conferences-Training": { showEmployeeName: true, showVehicleType: false, labelName: "Event/Training Name", showPurpose: true },
  "Business Services Revenue": { showEmployeeName: true, showVehicleType: false, labelName: "Service Name", showPurpose: false },
  "Miscellaneous": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "General Operations": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Innovation": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Consulting": { showEmployeeName: true, showVehicleType: false, labelName: "Consultant/Company Name", showPurpose: true },
  "Management Fees": { showEmployeeName: true, showVehicleType: false, labelName: "Vendor/Company Name", showPurpose: true },
  "Other": { showEmployeeName: true, showVehicleType: false, labelName: "Name/Item", showPurpose: true },
  "Hardware Sales": { showEmployeeName: true, showVehicleType: false, labelName: "Customer/Client Name", showPurpose: true },
  "Professional Services & Implementation": { showEmployeeName: true, showVehicleType: false, labelName: "Service/Project Name", showPurpose: true },
  "Software Licenses & SaaS Subscriptions": { showEmployeeName: true, showVehicleType: false, labelName: "Product/Service Name", showPurpose: true },
  "Managed Services & Support (MSP)": { showEmployeeName: true, showVehicleType: false, labelName: "Client/Service Name", showPurpose: true },
  "Hardware & Infrastructure Reselling": { showEmployeeName: true, showVehicleType: false, labelName: "Customer/Client Name", showPurpose: true },
  "Support & Maintenance": { showEmployeeName: true, showVehicleType: false, labelName: "Client/Service Name", showPurpose: true },
  "Internal allocations": { showEmployeeName: true, showVehicleType: false, labelName: "Department/Team Name", showPurpose: true },
};

const MEDTECH_CATEGORY_FIELDS = {
  "Travel & Entertainment (T&E)": { showEmployeeName: true, showVehicleType: true, labelName: "Employee/Person Name", labelVehicle: "Transport/Travel Type", showPurpose: true },
  "Marketing": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Supplies & Equipments": { showEmployeeName: true, showVehicleType: false, labelName: "Item/Equipment Name", showPurpose: true },
  "Facilities & Overhead": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "General Operations": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Innovation": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Guest Concierge": { showEmployeeName: true, showVehicleType: false, labelName: "Guest/Person Name", showPurpose: true },
  "Business Services Revenue": { showEmployeeName: true, showVehicleType: false, labelName: "Service Name", showPurpose: false },
  "Miscellaneous": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Outsourced Services": { showEmployeeName: true, showVehicleType: false, labelName: "Vendor/Company Name", showPurpose: true },
  "Events-Conferences-Training": { showEmployeeName: true, showVehicleType: false, labelName: "Event/Training Name", showPurpose: true },
  "B2B Revenue": { showEmployeeName: true, showVehicleType: false, labelName: "Client/Business Name", showPurpose: true },
  "B2C Revenue": { showEmployeeName: true, showVehicleType: false, labelName: "Customer/Client Name", showPurpose: true },
  "Other": { showEmployeeName: true, showVehicleType: false, labelName: "Name/Item", showPurpose: true },
};

const PCM_CATEGORY_FIELDS = {
  "Personnel & Payroll": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Outsourced Services": { showEmployeeName: true, showVehicleType: false, labelName: "Vendor/Company Name", showPurpose: true },
  "Facilities & Overhead": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Marketing": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Guest Concierge": { showEmployeeName: true, showVehicleType: false, labelName: "Guest/Person Name", showPurpose: true },
  "Events-Conferences-Training": { showEmployeeName: true, showVehicleType: false, labelName: "Event/Training Name", showPurpose: true },
  "Business Services Revenue": { showEmployeeName: true, showVehicleType: false, labelName: "Service Name", showPurpose: false },
  "Miscellaneous": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "General Operations": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Innovation": { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name", showPurpose: true },
  "Supplies & Equipment": { showEmployeeName: true, showVehicleType: false, labelName: "Item/Equipment Name", showPurpose: true },
  "Other": { showEmployeeName: true, showVehicleType: false, labelName: "Name/Item", showPurpose: true },
};

/**
 * NEW — Dental category fields.
 * ⚠️ Update these keys to match exactly what /dental/options returns from your backend.
 */
const DENTAL_CATEGORY_FIELDS = {
  // ── Expenses ─────────────────────────────────────────────────────────
  "Travel & Entertainment (T&E)":       { showEmployeeName: true, showVehicleType: true,  labelName: "Employee/Person Name",  labelVehicle: "Transport/Travel Type", showPurpose: true },
  "Marketing":                          { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name",                                        showPurpose: true },
  "Dental Supplies & Consumables":      { showEmployeeName: true, showVehicleType: false, labelName: "Item/Supply Name",                                             showPurpose: true },
  "Equipment Purchase & Maintenance":   { showEmployeeName: true, showVehicleType: false, labelName: "Equipment/Vendor Name",                                        showPurpose: true },
  "Lab Fees & Prosthetics":             { showEmployeeName: true, showVehicleType: false, labelName: "Lab/Vendor Name",                                              showPurpose: true },
  "Facilities & Overhead":              { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name",                                         showPurpose: true },
  "General Operations":                 { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name",                                         showPurpose: true },
  "Innovation":                         { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name",                                         showPurpose: true },
  "Guest Concierge":                    { showEmployeeName: true, showVehicleType: false, labelName: "Guest/Person Name",                                            showPurpose: true },
  "Business Services Revenue":          { showEmployeeName: true, showVehicleType: false, labelName: "Service Name",                                                 showPurpose: false },
  "Miscellaneous":                      { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name",                                         showPurpose: true },
  "Outsourced Services":                { showEmployeeName: true, showVehicleType: false, labelName: "Vendor/Company Name",                                          showPurpose: true },
  "Events-Conferences-Training":        { showEmployeeName: true, showVehicleType: false, labelName: "Event/Training Name",                                          showPurpose: true },
  "Consulting":                         { showEmployeeName: true, showVehicleType: false, labelName: "Consultant/Company Name",                                      showPurpose: true },
  "Management Fees":                    { showEmployeeName: true, showVehicleType: false, labelName: "Vendor/Company Name",                                          showPurpose: true },
  "Personnel & Payroll":                { showEmployeeName: true, showVehicleType: false, labelName: "Employee/Person Name",                                         showPurpose: true },

  // ── Income ───────────────────────────────────────────────────────────
  "Dental Operations":                  { showEmployeeName: true, showVehicleType: false, labelName: "Doctor/Staff Name",    showPurpose: true },
  "Doctor Consultation":                { showEmployeeName: true, showVehicleType: false, labelName: "Doctor Name",          showPurpose: true },
  "Clinical Procedures":                { showEmployeeName: true, showVehicleType: false, labelName: "Doctor/Staff Name",    showPurpose: true },
 "Diagnostics & X-Ray":                { showEmployeeName: true, showVehicleType: false, labelName: "Technician Name",      showPurpose: true },
  // ── Both ────────────────────────────────────────────────────────────
  "Other":                              { showEmployeeName: true, showVehicleType: false, labelName: "Name/Item",            showPurpose: true },
};

export default function FinanceEntryForm({
  open,
  onClose,
  onSaved,
  department,
  options,
  editingEntry,
}) {
  const apiBase = String(department || "").toLowerCase().replace(/\s/g, "");

  const isOfficeAdmin = department === "Adminstrationfunctionalunit";
  const isIT = department === "IT";
  const isITSales = department === "IT Sales";
  const isMedTech = department === "MedTech";
  const isPCM = department === "PCM";
  const isDental = department === "Dental"; // ✅ NEW

  const salaryCategoryName = options?.is_salary_category || "Payroll Salaries";
  const ledgerCategoryName = "Ledger";

  // Categories that require item-level details (for MedTech)
  const MEDTECH_ITEM_CATEGORIES = ["Supplies & Equipments"];

  const createEmptyForm = () => ({
    entry_type: "Income",
    category: options?.categories?.Income?.[0] || "",
    sub_category: "",
    generated_by: "",
    revenue_type: options?.revenue_types?.[0] || "",
    patient_name: "",
    patient_place: "",
    client_name: "",
    gst_number: "",
    gst_tax_percent: "",
    tax_invoice_number: "",
    amount: "",
    remarks: "",
    entry_date: today(),
    exec_department: "",
    employee_name: "",
    salary_amount: "",
    allowance_amount: "",
    vehicle_type: "",
    team: "",
    purpose: "",   
  });

  const [form, setForm] = useState(createEmptyForm());
  const [otherCategory, setOtherCategory] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [removeInvoice, setRemoveInvoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState([emptyEmployee()]);

  // --- Ledger specific states ---
  const [ledgerCustomer, setLedgerCustomer] = useState("");
  const [ledgerNewAmount, setLedgerNewAmount] = useState("");
  const [ledgerPaid, setLedgerPaid] = useState("");
  const [ledgerBalance, setLedgerBalance] = useState(0);
  const [ledgerHistory, setLedgerHistory] = useState([]);
  const [ledgerLoadingHistory, setLedgerLoadingHistory] = useState(false);
  const [ledgerOutstanding, setLedgerOutstanding] = useState(0);
  const [ledgerTotalAmount, setLedgerTotalAmount] = useState(0);

  // --- Goodwill client suggestions ---
  const [clientSuggestions, setClientSuggestions] = useState([]);

  const isSalaryCategory =
    !isOfficeAdmin && !isIT && !isITSales && !isMedTech && !isPCM && !isDental &&
    form.category === salaryCategoryName;

  const isLedger = isMedTech && form.category === ledgerCategoryName;
  const isGoodwill = isMedTech && form.category === "Goodwill";

  const isEditingSalaryEntry =
    isSalaryCategory && !!(editingEntry && editingEntry.id !== undefined && editingEntry.id !== null);

  const itFieldConfig = isIT ? IT_CATEGORY_FIELDS[form.category] : null;
  const showITFields = isIT && itFieldConfig && form.category !== salaryCategoryName;
  const isITSalaryCategory = isIT && form.category === salaryCategoryName;

  const itSalesFieldConfig = isITSales ? IT_SALES_CATEGORY_FIELDS[form.category] : null;
  const showITSalesFields = isITSales && itSalesFieldConfig && form.category !== salaryCategoryName;
  const isITSalesSalaryCategory = isITSales && form.category === salaryCategoryName;

  const medTechFieldConfig = isMedTech ? MEDTECH_CATEGORY_FIELDS[form.category] : null;
  const showMedTechFields =
    isMedTech && medTechFieldConfig &&
    form.category !== salaryCategoryName &&
    form.category !== ledgerCategoryName &&
    form.category !== "Goodwill";
  const isMedTechSalaryCategory = isMedTech && form.category === salaryCategoryName;

  const pcmFieldConfig = isPCM ? PCM_CATEGORY_FIELDS[form.category] : null;
  const showPCMFields = isPCM && pcmFieldConfig && form.category !== salaryCategoryName;
  const isPCMSalaryCategory = isPCM && form.category === salaryCategoryName;

  const officeFieldConfig = isOfficeAdmin ? OFFICE_ADMIN_CATEGORY_FIELDS[form.category] : null;
  const showOfficeFields = isOfficeAdmin && officeFieldConfig;

  // ✅ NEW — Dental
  const dentalFieldConfig = isDental ? DENTAL_CATEGORY_FIELDS[form.category] : null;
  const showDentalFields = isDental && dentalFieldConfig && form.category !== salaryCategoryName;
  const isDentalSalaryCategory = isDental && form.category === salaryCategoryName;

  const usingCategoryFields =
    showOfficeFields || showITFields || showITSalesFields ||
    showMedTechFields || showPCMFields || showDentalFields;

  // Fetch client suggestions when Goodwill is selected
  useEffect(() => {
    if (isGoodwill) {
      const fetchClients = async () => {
        try {
          const res = await api.get(`/${apiBase}/clients`);
          setClientSuggestions(res.data.clients || []);
        } catch {
          // ignore
        }
      };
      fetchClients();
    }
  }, [isGoodwill, apiBase]);

  useEffect(() => {
    if (!open) return;

    const populateForm = (entry) => {
      const categoryList = options?.categories?.[entry.entry_type] || [];
      const isCustomCategory = categoryList.includes("Others") && !categoryList.includes(entry.category);

      setForm({
        entry_type: entry.entry_type || "Income",
        category: isCustomCategory ? "Others" : entry.category || "",
        sub_category: entry.sub_category || "",
        generated_by: entry.generated_by || "",
        revenue_type: entry.revenue_type || options?.revenue_types?.[0] || "",
        patient_name: entry.patient_name || "",
        patient_place: entry.patient_place || "",
        client_name: entry.client_name || "",
        gst_number: entry.gst_number || "",
        gst_tax_percent: entry.gst_tax_percent !== undefined && entry.gst_tax_percent !== null ? String(entry.gst_tax_percent) : "",
        tax_invoice_number: entry.tax_invoice_number || "",
        amount: entry.amount !== undefined && entry.amount !== null ? String(entry.amount) : "",
        remarks: entry.remarks || "",
        entry_date: entry.entry_date || today(),
        exec_department: entry.exec_department || "",
        employee_name: entry.employee_name || "",
        salary_amount: entry.salary_amount !== undefined && entry.salary_amount !== null ? String(entry.salary_amount) : "",
        allowance_amount: entry.allowance_amount !== undefined && entry.allowance_amount !== null ? String(entry.allowance_amount) : "",
        vehicle_type: entry.vehicle_type || "",
        team: entry.team || "",
        purpose: entry.purpose || "", 
      });
      setOtherCategory(isCustomCategory ? entry.category : "");

      if (Array.isArray(entry.items) && entry.items.length > 0) {
        setItems(entry.items.map((item) => ({
          _key: nextItemKey(),
          item_name: item.item_name || "",
          quantity: String(item.quantity ?? "1"),
          unit_price: String(item.unit_price ?? ""),
        })));
      } else {
        setItems([emptyItem()]);
      }

      const isSalary = entry.category === salaryCategoryName;
      if (isSalary) {
        setEmployees([{
          _key: nextItemKey(),
          exec_department: entry.exec_department || "",
          employee_name: entry.employee_name || "",
          salary_amount: entry.salary_amount !== undefined && entry.salary_amount !== null ? String(entry.salary_amount) : "",
          allowance_amount: entry.allowance_amount !== undefined && entry.allowance_amount !== null ? String(entry.allowance_amount) : "",
          total: (Number(entry.salary_amount) || 0) + (Number(entry.allowance_amount) || 0),
          remarks: entry.remarks || "",
        }]);
      } else {
        setEmployees([emptyEmployee()]);
      }

      if (entry._type === "ledger") {
        setLedgerCustomer(entry.customer_name || "");
        const total = entry.total_amount || 0;
        const paid = entry.paid || 0;
        setLedgerTotalAmount(total);
        setLedgerPaid(String(paid));
        setLedgerBalance(total - paid);
        setLedgerNewAmount("");
      } else {
        setLedgerCustomer("");
        setLedgerNewAmount("");
        setLedgerPaid("");
        setLedgerBalance(0);
        setLedgerHistory([]);
        setLedgerOutstanding(0);
        setLedgerTotalAmount(0);
      }

      setInvoiceFile(null);
      setRemoveInvoice(false);
    };

    if (editingEntry) {
      populateForm(editingEntry);
    } else {
      setForm(createEmptyForm());
      setOtherCategory("");
      setItems([emptyItem()]);
      setEmployees([emptyEmployee()]);
      setLedgerCustomer("");
      setLedgerNewAmount("");
      setLedgerPaid("");
      setLedgerBalance(0);
      setLedgerHistory([]);
      setLedgerOutstanding(0);
      setLedgerTotalAmount(0);
      setInvoiceFile(null);
      setRemoveInvoice(false);
    }
  }, [editingEntry, open, options, salaryCategoryName]);

  useEffect(() => {
    if (!isLedger || !ledgerCustomer.trim()) {
      setLedgerHistory([]);
      setLedgerOutstanding(0);
      return;
    }
    const fetchHistory = async () => {
      setLedgerLoadingHistory(true);
      try {
        const res = await api.get(`/${apiBase}/ledger/history`, {
          params: { customer: ledgerCustomer.trim() },
        });
        const history = res.data.history || [];
        setLedgerHistory(history);
        if (history.length > 0) {
          const last = history[history.length - 1];
          setLedgerOutstanding(last.balance || 0);
        } else {
          setLedgerOutstanding(0);
        }
      } catch (err) {
        toast.error("Failed to fetch ledger history.");
      } finally {
        setLedgerLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [isLedger, ledgerCustomer, apiBase]);

  useEffect(() => {
    if (isLedger) {
      const isEditingLedger = editingEntry && editingEntry._type === "ledger";
      if (isEditingLedger) {
        const total = ledgerTotalAmount;
        const paid = parseFloat(ledgerPaid) || 0;
        setLedgerBalance(total - paid);
      } else {
        const outstanding = ledgerOutstanding || 0;
        const newAmt = parseFloat(ledgerNewAmount) || 0;
        const paid = parseFloat(ledgerPaid) || 0;
        const total = outstanding + newAmt;
        setLedgerTotalAmount(total);
        setLedgerBalance(total - paid);
      }
    }
  }, [isLedger, ledgerOutstanding, ledgerNewAmount, ledgerPaid, ledgerTotalAmount, editingEntry]);

  if (!open || !options) return null;

  const categoryOptionsForType = options?.categories?.[form.entry_type] || [];
  const revenueTypes = options?.revenue_types || [];
  const gstRequired = (options?.gst_required_categories || []).includes(form.category);
  const isOthersCategory = form.category === "Others";
  const isOfficeAdminSalary = isOfficeAdmin && form.category === salaryCategoryName;

  const handleTypeChange = (event) => {
    const newType = event.target.value;
    let firstCategory = options?.categories?.[newType]?.[0] || "";
    if (newType === "Ledger") {
      firstCategory = "Ledger";
    }
    setForm((prev) => ({ ...prev, entry_type: newType, category: firstCategory }));
    setOtherCategory("");
    if (!isSalaryCategory) setEmployees([emptyEmployee()]);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, category: value }));
    if (value !== "Others") setOtherCategory("");
    if (value !== salaryCategoryName) {
      setEmployees([emptyEmployee()]);
    } else {
      if (employees.length === 0) setEmployees([emptyEmployee()]);
    }
    if (value !== ledgerCategoryName) {
      setLedgerCustomer("");
      setLedgerNewAmount("");
      setLedgerPaid("");
      setLedgerBalance(0);
      setLedgerHistory([]);
      setLedgerOutstanding(0);
      setLedgerTotalAmount(0);
    }
  };

  const handleEmployeeChange = (key, field, value) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp._key !== key) return emp;
        const updated = { ...emp, [field]: value };
        if (field === "salary_amount" || field === "allowance_amount") {
          const sal = parseFloat(updated.salary_amount) || 0;
          const allow = parseFloat(updated.allowance_amount) || 0;
          updated.total = sal + allow;
        }
        return updated;
      })
    );
  };

  const handleAddEmployee = () => setEmployees((prev) => [...prev, emptyEmployee()]);
  const handleRemoveEmployee = (key) => {
    if (employees.length === 1) {
      toast.error("At least one employee is required.");
      return;
    }
    setEmployees((prev) => prev.filter((emp) => emp._key !== key));
  };

  const handleItemChange = (key, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item._key !== key) return item;
        return { ...item, [field]: value };
      })
    );
  };

  const handleAddItem = () => {
    setItems((prev) => [...prev, emptyItem()]);
  };

  const handleRemoveItem = (key) => {
    if (items.length === 1) {
      toast.error("At least one item is required.");
      return;
    }
    setItems((prev) => prev.filter((item) => item._key !== key));
  };

  const salaryTotal = employees.reduce((sum, emp) => sum + (emp.total || 0), 0);
  const itemsTotal = options?.show_items
    ? items.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        return sum + qty * price;
      }, 0)
    : 0;

  const baseAmount = isSalaryCategory
    ? salaryTotal
    : (options?.show_items && !usingCategoryFields ? itemsTotal : Number(form.amount) || 0);
  const gstTaxPercentValue = Number(form.gst_tax_percent) || 0;
  const gstTaxAmount = options?.show_gst_tax
    ? Number(((baseAmount * gstTaxPercentValue) / 100).toFixed(2))
    : 0;
  const grandTotal = Number((baseAmount + gstTaxAmount).toFixed(2));

  const handleInvoiceChange = (event) => {
    const file = event.target.files?.[0] || null;
    setInvoiceFile(file);
    setRemoveInvoice(false);
  };

  /* ---------------- SUBMIT HANDLER ---------------- */
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.entry_date) {
      toast.error("Please select the entry date.");
      return;
    }
    if (!form.category) {
      toast.error("Please select a category.");
      return;
    }

    // --- LEDGER SUBMISSION ---
    if (isLedger) {
      if (!ledgerCustomer.trim()) {
        toast.error("Customer name is required.");
        return;
      }
      const isEditingLedger = editingEntry && editingEntry._type === "ledger";
      let totalAmount;
      if (isEditingLedger) {
        totalAmount = ledgerTotalAmount;
      } else {
        const newAmt = parseFloat(ledgerNewAmount) || 0;
        totalAmount = ledgerOutstanding + newAmt;
      }
      if (totalAmount <= 0) {
        toast.error("Total amount must be greater than 0.");
        return;
      }
      const paid = parseFloat(ledgerPaid) || 0;
      setSaving(true);
      try {
        const payload = {
          entry_type: "Ledger",
          category: "Ledger",
          customer_name: ledgerCustomer.trim(),
          entry_date: form.entry_date,
          total_amount: totalAmount,
          paid: paid,
          remarks: form.remarks || "",
        };
        const url = `/${apiBase}/entries`;
        if (editingEntry && editingEntry._type === "ledger") {
          await api.put(`${url}/${editingEntry.id}`, payload);
          toast.success("Ledger entry updated.");
        } else {
          await api.post(url, payload);
          toast.success("Ledger entry saved.");
        }
        if (typeof onSaved === "function") await onSaved();
        onClose();
      } catch (err) {
        const msg = err.response?.data?.message || "Failed to save ledger entry.";
        toast.error(msg);
      } finally {
        setSaving(false);
      }
      return;
    }

    // --- Goodwill validation ---
    if (isGoodwill) {
      if (!form.client_name.trim()) {
        toast.error("Client name is required for Goodwill entries.");
        return;
      }
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Please enter a valid amount.");
        return;
      }
    }

    // --- Salary lock validations ---
    if (isOfficeAdmin && form.category === salaryCategoryName) {
      toast.error("Salary must be entered by Corporate Management only.");
      return;
    }
    if (isITSalaryCategory) {
      toast.error("Salaries must be entered by Corporate Management only.");
      return;
    }
    if (isITSalesSalaryCategory) {
      toast.error("Salaries must be entered by Corporate Management only.");
      return;
    }
    if (isMedTechSalaryCategory) {
      toast.error("Salaries must be entered by Corporate Management only.");
      return;
    }
    if (isPCMSalaryCategory) {
      toast.error("Salaries must be entered by Corporate Management only.");
      return;
    }
    // ✅ NEW — Dental salary lock
    if (isDentalSalaryCategory) {
      toast.error("Salaries must be entered by Corporate Management only.");
      return;
    }

    if (isSalaryCategory) {
      let valid = true;
      for (const emp of employees) {
        if (!emp.exec_department) {
          toast.error("Please select a department for all employees.");
          valid = false;
          break;
        }
        if (!emp.employee_name.trim()) {
          toast.error("Please enter employee name for all employees.");
          valid = false;
          break;
        }
        const sal = parseFloat(emp.salary_amount) || 0;
        const allow = parseFloat(emp.allowance_amount) || 0;
        if (sal <= 0 && allow <= 0) {
          toast.error(`For ${emp.employee_name || "employee"}, at least one of Salary or TADA must be greater than 0.`);
          valid = false;
          break;
        }
      }
      if (!valid) return;
      return submitSalaryEntries();
    }

    if (isOfficeAdmin && officeFieldConfig) {
      if (officeFieldConfig.showEmployeeName && !form.employee_name.trim()) {
        toast.error(`Please enter ${officeFieldConfig.labelName || "name"}.`);
        return;
      }
      if (officeFieldConfig.showVehicleType && !form.vehicle_type.trim()) {
        toast.error(`Please enter ${officeFieldConfig.labelVehicle || "vehicle type"}.`);
        return;
      }
      if (officeFieldConfig.showPurpose && !form.remarks.trim()) {
        toast.error("Please enter the purpose.");
        return;
      }
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Please enter a valid amount.");
        return;
      }
    }

    if (isIT && showITFields) {
      if (itFieldConfig.showEmployeeName && !form.employee_name.trim()) {
        toast.error(`Please enter ${itFieldConfig.labelName || "name"}.`);
        return;
      }
      if (itFieldConfig.showVehicleType && !form.vehicle_type.trim()) {
        toast.error(`Please enter ${itFieldConfig.labelVehicle || "vehicle type"}.`);
        return;
      }
      if (itFieldConfig.showPurpose && !form.remarks.trim()) {
        toast.error("Please enter the purpose.");
        return;
      }
      if (!form.remarks.trim()) {
        toast.error("Remarks are required.");
        return;
      }
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Please enter a valid amount.");
        return;
      }
    }

    if (isITSales && showITSalesFields) {
      if (itSalesFieldConfig.showEmployeeName && !form.employee_name.trim()) {
        toast.error(`Please enter ${itSalesFieldConfig.labelName || "name"}.`);
        return;
      }
      if (itSalesFieldConfig.showVehicleType && !form.vehicle_type.trim()) {
        toast.error(`Please enter ${itSalesFieldConfig.labelVehicle || "vehicle type"}.`);
        return;
      }
      if (itSalesFieldConfig.showPurpose && !form.remarks.trim()) {
        toast.error("Please enter the purpose.");
        return;
      }
      if (!form.remarks.trim()) {
        toast.error("Remarks are required.");
        return;
      }
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Please enter a valid amount.");
        return;
      }
      if (form.entry_type === "Income" && !form.generated_by.trim()) {
        toast.error("Please enter the employee name (Generated By) for Income entries.");
        return;
      }
    }

    if (isMedTech && showMedTechFields) {
      if (medTechFieldConfig.showEmployeeName && !form.employee_name.trim()) {
        toast.error(`Please enter ${medTechFieldConfig.labelName || "name"}.`);
        return;
      }
      if (medTechFieldConfig.showVehicleType && !form.vehicle_type.trim()) {
        toast.error(`Please enter ${medTechFieldConfig.labelVehicle || "vehicle type"}.`);
        return;
      }
      if (medTechFieldConfig.showPurpose && !form.remarks.trim()) {
        toast.error("Please enter the purpose.");
        return;
      }
      if (!form.remarks.trim()) {
        toast.error("Remarks are required.");
        return;
      }
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Please enter a valid amount.");
        return;
      }
    }

    if (isPCM && showPCMFields) {
      if (pcmFieldConfig.showEmployeeName && !form.employee_name.trim()) {
        toast.error(`Please enter ${pcmFieldConfig.labelName || "name"}.`);
        return;
      }
      if (pcmFieldConfig.showVehicleType && !form.vehicle_type.trim()) {
        toast.error(`Please enter ${pcmFieldConfig.labelVehicle || "vehicle type"}.`);
        return;
      }
      if (pcmFieldConfig.showPurpose && !form.remarks.trim()) {
        toast.error("Please enter the purpose.");
        return;
      }
      if (!form.remarks.trim()) {
        toast.error("Remarks are required.");
        return;
      }
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Please enter a valid amount.");
        return;
      }
    }

    // ✅ NEW — Dental validation (mirrors IT block)
    if (isDental && showDentalFields) {
      if (dentalFieldConfig.showEmployeeName && !form.employee_name.trim()) {
        toast.error(`Please enter ${dentalFieldConfig.labelName || "name"}.`);
        return;
      }
      if (dentalFieldConfig.showVehicleType && !form.vehicle_type.trim()) {
        toast.error(`Please enter ${dentalFieldConfig.labelVehicle || "vehicle type"}.`);
        return;
      }
      if (dentalFieldConfig.showPurpose && !form.remarks.trim()) {
        toast.error("Please enter the purpose.");
        return;
      }
      if (!form.remarks.trim()) {
        toast.error("Remarks are required.");
        return;
      }
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Please enter a valid amount.");
        return;
      }
      if (form.entry_type === "Income" && !form.generated_by.trim()) {
        toast.error("Please enter the employee name (Generated By) for Income entries.");
        return;
      }
    }

    if (!isOfficeAdmin && !isIT && !isITSales && !isMedTech && !isPCM && !isDental && !usingCategoryFields && options.show_generated_by && !form.generated_by.trim()) {
      toast.error("Please enter the employee name (Generated By).");
      return;
    }
    if (!usingCategoryFields && options.show_patient_fields && !form.patient_name.trim()) {
      toast.error("Please enter the patient name.");
      return;
    }
    if (options.show_gst_number && gstRequired && !form.gst_number.trim()) {
      toast.error(`GST Number is required for ${form.category} entries.`);
      return;
    }
    if (isOthersCategory && !otherCategory.trim()) {
      toast.error("Please enter a category name.");
      return;
    }

    // ---- Category-dependent item validation ----
    let cleanItems = [];
    let requireItems = false;

    if (options.show_items && !isGoodwill) {
      if (department === "MedTech") {
        requireItems = MEDTECH_ITEM_CATEGORIES.includes(form.category);
      } else {
        requireItems = true;
      }

      if (requireItems) {
        cleanItems = items
          .map((item) => {
            const qty = Number(item.quantity);
            const price = Number(item.unit_price);
            return { item_name: item.item_name.trim(), quantity: qty, unit_price: price };
          })
          .filter((item) => item.item_name);
        if (cleanItems.length === 0) {
          toast.error("Add at least one item (name, quantity, unit price).");
          return;
        }
      } else {
        const amount = Number(form.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          toast.error("Please enter a valid amount.");
          return;
        }
        cleanItems = [];
      }
    } else {
      if (!isGoodwill) {
        const amount = Number(form.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          toast.error("Please enter a valid amount.");
          return;
        }
      }
    }

    submitSingleEntry(cleanItems);
  };

  /* ---------------- submitSingleEntry ---------------- */
  const submitSingleEntry = async (cleanItems) => {
    setSaving(true);
    try {
      let body;
      let config = {};

      let itemsTotal = 0;
      if (options.show_items && cleanItems && cleanItems.length > 0) {
        itemsTotal = cleanItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      }

      const isEditing = editingEntry && editingEntry.id !== undefined && editingEntry.id !== null;

      let requireItems = false;
      if (options.show_items && !isGoodwill) {
        if (department === "MedTech") {
          requireItems = MEDTECH_ITEM_CATEGORIES.includes(form.category);
        } else {
          requireItems = true;
        }
      }

      if (options.show_invoice && !isEditing) {
        const formData = new FormData();
        Object.keys(form).forEach((key) => {
          if (form[key] !== null && form[key] !== undefined) {
            formData.append(key, form[key]);
          }
        });
        if (isOthersCategory) formData.append("other_category", otherCategory.trim());
        if (isOfficeAdmin) {
          formData.append("employee_name", form.employee_name || "");
          formData.append("vehicle_type", form.vehicle_type || "");
        }
        if (isIT && showITFields) {
          formData.append("employee_name", form.employee_name || "");
          formData.append("purpose", form.purpose || "");
          formData.append("vehicle_type", form.vehicle_type || "");
        }
        if (isITSales && showITSalesFields) {
          formData.append("employee_name", form.employee_name || "");
          formData.append("purpose", form.purpose || "");
          formData.append("vehicle_type", form.vehicle_type || "");
          formData.append("client_name", form.client_name || "");
          formData.append("gst_number", form.gst_number || "");
          formData.append("generated_by", form.generated_by || "");
        }
        if (isMedTech && showMedTechFields) {
          formData.append("employee_name", form.employee_name || "");
          formData.append("purpose", form.purpose || "");
          formData.append("vehicle_type", form.vehicle_type || "");
        }
        if (isPCM && showPCMFields) {
          formData.append("employee_name", form.employee_name || "");
          formData.append("purpose", form.purpose || "");
          formData.append("vehicle_type", form.vehicle_type || "");
        }
        // ✅ NEW — Dental multipart fields
        if (isDental && showDentalFields) {
          formData.append("employee_name", form.employee_name || "");
          formData.append("purpose", form.purpose || "");
          formData.append("vehicle_type", form.vehicle_type || "");
          formData.append("client_name", form.client_name || "");
          formData.append("gst_number", form.gst_number || "");
          formData.append("generated_by", form.generated_by || "");
        }
        if (options.show_items && !isGoodwill) {
          formData.append("items", JSON.stringify(cleanItems || []));
          formData.append("amount", itemsTotal);
        } else {
          formData.append("amount", parseFloat(form.amount) || 0);
        }
        if (invoiceFile) formData.append("invoice", invoiceFile);
        if (isITSales) {
          formData.append("team", form.team || "");
        }
        body = formData;
        config = { headers: { "Content-Type": "multipart/form-data" } };
      } else {
        body = { ...form };
        body.amount = parseFloat(form.amount) || 0;
        if (isOthersCategory) body.other_category = otherCategory.trim();
        if (isOfficeAdmin) {
          body.employee_name = form.employee_name || null;
          body.vehicle_type = form.vehicle_type || null;
        }
        if (isIT && showITFields) {
          body.employee_name = form.employee_name || null;
          body.purpose = form.purpose || null;
          body.vehicle_type = form.vehicle_type || null;
        }
        if (isITSales && showITSalesFields) {
          body.employee_name = form.employee_name || null;
          body.purpose = form.purpose || null;
          body.vehicle_type = form.vehicle_type || null;
        }
        if (isMedTech && showMedTechFields) {
          body.employee_name = form.employee_name || null;
          body.purpose = form.purpose || null;
          body.vehicle_type = form.vehicle_type || null;
        }
        if (isPCM && showPCMFields) {
          body.employee_name = form.employee_name || null;
          body.purpose = form.purpose || null;
          body.vehicle_type = form.vehicle_type || null;
        }
        // ✅ NEW — Dental JSON fields
        if (isDental && showDentalFields) {
          body.employee_name = form.employee_name || null;
          body.purpose = form.purpose || null;
          body.vehicle_type = form.vehicle_type || null;
        }
        if (isITSales) {
          body.team = form.team || null;
        }
        if (!options.show_generated_by) delete body.generated_by;
        if (!options.show_revenue_type) delete body.revenue_type;
        if (!options.show_patient_fields) {
          delete body.patient_name;
          delete body.patient_place;
        }
        if (!options.show_client_name) delete body.client_name;
        if (!options.show_gst_number) delete body.gst_number;
        if (!options.show_gst_tax) delete body.gst_tax_percent;
        if (!options.show_tax_invoice_number) delete body.tax_invoice_number;
        if (options.show_items && requireItems && !isGoodwill) {
          body.items = cleanItems || [];
          body.amount = itemsTotal;
        } else {
          delete body.items;
          body.amount = parseFloat(form.amount) || 0;
        }
        if (removeInvoice && isEditing) {
          body.remove_invoice = "true";
        }
      }

      const url = `/${apiBase}/entries`;
      if (isEditing) {
        await api.put(`${url}/${editingEntry.id}`, body, config);
        toast.success("Entry updated successfully.");
      } else {
        await api.post(url, body, config);
        toast.success("Entry added successfully.");
      }
      if (typeof onSaved === "function") await onSaved();
      onClose();
    } catch (error) {
      console.error("❌ Finance entry error:", error);
      const responseData = error.response?.data;
      let errorMessage = "Something went wrong while saving the entry.";
      if (responseData) {
        if (responseData.errors && Array.isArray(responseData.errors)) {
          errorMessage = responseData.errors.join(" ");
        } else if (responseData.message) {
          errorMessage = responseData.message;
        } else {
          try {
            errorMessage = JSON.stringify(responseData);
          } catch {
            errorMessage = "An unknown error occurred.";
          }
        }
      }
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- submitSalaryEntries ---------------- */
  const submitSalaryEntries = async () => {
    setSaving(true);
    try {
      const isEditing = editingEntry && editingEntry.id !== undefined && editingEntry.id !== null;
      const url = `/${apiBase}/entries`;

      if (isEditing) {
        const emp = employees[0] || emptyEmployee();
        const salaryAmount = parseFloat(emp.salary_amount) || 0;
        const allowanceAmount = parseFloat(emp.allowance_amount) || 0;
        const body = {
          entry_type: "Expenses",
          category: salaryCategoryName,
          exec_department: emp.exec_department,
          employee_name: emp.employee_name.trim(),
          salary_amount: salaryAmount,
          allowance_amount: allowanceAmount,
          amount: salaryAmount + allowanceAmount,
          remarks: emp.remarks || "",
          entry_date: form.entry_date,
        };
        await api.put(`${url}/${editingEntry.id}`, body);
        toast.success("Entry updated successfully.");
      } else {
        const payload = {
          entries: employees.map((emp) => ({
            exec_department: emp.exec_department,
            employee_name: emp.employee_name.trim(),
            salary_amount: parseFloat(emp.salary_amount) || 0,
            allowance_amount: parseFloat(emp.allowance_amount) || 0,
            remarks: emp.remarks || "",
            entry_date: form.entry_date,
          })),
        };
        await api.post(url, payload);
        toast.success(`Added ${payload.entries.length} salary entries.`);
      }
      if (typeof onSaved === "function") await onSaved();
      onClose();
    } catch (error) {
      console.error("Salary entry error:", error);
      const errors = error.response?.data?.errors;
      const message = Array.isArray(errors)
        ? errors.join(" ")
        : error.response?.data?.message || "Something went wrong while saving salary entries.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- Standard fields renderer ---------------- */
  const renderStandardFields = () => {
    return (
      <>
        {options.show_client_name && (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Client Name</label>
              <input name="client_name" value={form.client_name} onChange={handleChange} placeholder="Enter the client name" className="form-control" />
            </div>
            {options.show_gst_number && (
              <div className="form-group">
                <label className="form-label">GST Number {gstRequired ? `(required for ${form.category})` : "(optional)"}</label>
                <input name="gst_number" value={form.gst_number} onChange={handleChange} placeholder="e.g. 22AAAAA0000A1Z5" className="form-control" />
              </div>
            )}
          </div>
        )}

        {(options.show_gst_tax || options.show_tax_invoice_number) && (
          <div className="form-row">
            {options.show_gst_tax && (
              <div className="form-group">
                <label className="form-label">GST Tax (%)</label>
                <input type="number" min="0" max="100" step="0.01" name="gst_tax_percent" value={form.gst_tax_percent} onChange={handleChange} placeholder="e.g. 18" className="form-control" />
              </div>
            )}
            {options.show_tax_invoice_number && (
              <div className="form-group">
                <label className="form-label">Tax Invoice Number</label>
                <input name="tax_invoice_number" value={form.tax_invoice_number} onChange={handleChange} placeholder="e.g. INV-2026-0142" className="form-control" />
              </div>
            )}
          </div>
        )}

        {options.show_patient_fields && (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Patient Name</label>
              <input name="patient_name" value={form.patient_name} onChange={handleChange} placeholder="e.g. Ramesh Kumar" className="form-control" />
            </div>
            <div className="form-group">
              <label className="form-label">Patient Place</label>
              <input name="patient_place" value={form.patient_place} onChange={handleChange} placeholder="e.g. Guntur" className="form-control" />
            </div>
          </div>
        )}

        {(options.show_generated_by || options.show_revenue_type) && (
          <div className="form-row">
            {options.show_generated_by && (
              <div className="form-group">
                <label className="form-label">Generated By</label>
                <input name="generated_by" value={form.generated_by} onChange={handleChange} placeholder="e.g. John Mathew" className="form-control" />
              </div>
            )}
            {options.show_revenue_type && (
              <div className="form-group">
                <label className="form-label">Revenue Type</label>
                <select name="revenue_type" value={form.revenue_type} onChange={handleChange} className="form-control">
                  {revenueTypes.map((rt) => (
                    <option key={rt} value={rt}>{rt}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {options.show_invoice && (
          <div className="form-group">
            <label className="form-label">Invoice</label>
            {editingEntry && editingEntry.invoice_url && !removeInvoice && (
              <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <a href={invoiceHref(editingEntry)} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <FileText size={15} /> <span>View current invoice</span>
                </a>
                <button type="button" className="btn-icon btn-icon--danger" onClick={() => setRemoveInvoice(true)} title="Remove invoice">
                  <Trash2 size={15} />
                </button>
              </div>
            )}
            {removeInvoice && <p className="text-muted" style={{ marginBottom: 8, fontSize: 13 }}>Current invoice will be removed when you save.</p>}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx" onChange={handleInvoiceChange} className="form-control" />
            <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Accepted: PDF, JPG, PNG, GIF, WEBP, DOC, DOCX, XLS, XLSX.</p>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Remarks</label>
          <textarea name="remarks" value={form.remarks} onChange={handleChange} rows={3} placeholder="Optional notes about this entry" className="form-control" />
        </div>
      </>
    );
  };

  const renderOfficeAdminFields = () => {
    if (!showOfficeFields) return null;
    const config = officeFieldConfig;
    return (
      <>
        {config.showEmployeeName && (
          <div className="form-group">
            <label className="form-label">{config.labelName || "Name"}</label>
            <input name="employee_name" value={form.employee_name || ""} onChange={handleChange} placeholder={`Enter ${config.labelName || "name"}`} className="form-control" />
          </div>
        )}
        {config.showVehicleType && (
          <div className="form-group">
            <label className="form-label">{config.labelVehicle || "Vehicle Type"}</label>
            <input name="vehicle_type" value={form.vehicle_type || ""} onChange={handleChange} placeholder="e.g. Car, Bike, Cab" className="form-control" />
          </div>
        )}
        {config.showPurpose && (
          <div className="form-group">
            <label className="form-label">Purpose / Remarks</label>
            <textarea name="remarks" value={form.remarks || ""} onChange={handleChange} rows={3} placeholder="Enter purpose or additional notes" className="form-control" />
          </div>
        )}
        {!config.showPurpose && (
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <textarea name="remarks" value={form.remarks || ""} onChange={handleChange} rows={3} placeholder="Optional notes" className="form-control" />
          </div>
        )}
      </>
    );
  };

  const renderITFields = () => {
    if (!showITFields) return null;
    const config = itFieldConfig;
    return (
      <>
        {config.showEmployeeName && (
          <div className="form-group">
            <label className="form-label">{config.labelName || "Name"}</label>
            <input name="employee_name" value={form.employee_name || ""} onChange={handleChange} placeholder={`Enter ${config.labelName || "name"}`} className="form-control" />
          </div>
        )}
        {config.showVehicleType && (
          <div className="form-group">
            <label className="form-label">{config.labelVehicle || "Vehicle Type"}</label>
            <input name="vehicle_type" value={form.vehicle_type || ""} onChange={handleChange} placeholder="e.g. Car, Bike, Cab" className="form-control" />
          </div>
        )}
        {config.showPurpose && (
          <div className="form-group">
            <label className="form-label">Purpose</label>
            <input name="purpose" value={form.purpose || ""} onChange={handleChange} placeholder="Brief purpose" className="form-control" />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Remarks <span style={{ color: "red" }}>*</span></label>
          <textarea name="remarks" value={form.remarks || ""} onChange={handleChange} rows={3} placeholder="Detailed remarks (required)" className="form-control" required />
        </div>
      </>
    );
  };

  const renderITSalesFields = () => {
    if (!showITSalesFields) return null;
    const config = itSalesFieldConfig;
    return (
      <>
        {config.showEmployeeName && (
          <div className="form-group">
            <label className="form-label">{config.labelName || "Name"}</label>
            <input name="employee_name" value={form.employee_name || ""} onChange={handleChange} placeholder={`Enter ${config.labelName || "name"}`} className="form-control" />
          </div>
        )}
        {config.showVehicleType && (
          <div className="form-group">
            <label className="form-label">{config.labelVehicle || "Vehicle Type"}</label>
            <input name="vehicle_type" value={form.vehicle_type || ""} onChange={handleChange} placeholder="e.g. Car, Bike, Cab" className="form-control" />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Generated By {form.entry_type === "Income" && <span style={{ color: "red" }}>*</span>}</label>
          <input name="generated_by" value={form.generated_by || ""} onChange={handleChange} placeholder="Enter employee name" className="form-control" />
        </div>
        <div className="form-row">
          {options.show_client_name && (
            <div className="form-group">
              <label className="form-label">Client Name</label>
              <input name="client_name" value={form.client_name || ""} onChange={handleChange} placeholder="Enter the client name" className="form-control" />
            </div>
          )}
          {options.show_gst_number && (
            <div className="form-group">
              <label className="form-label">GST Number {gstRequired ? `(required for ${form.category})` : "(optional)"}</label>
              <input name="gst_number" value={form.gst_number || ""} onChange={handleChange} placeholder="e.g. 22AAAAA0000A1Z5" className="form-control" />
            </div>
          )}
        </div>
        {config.showPurpose && (
          <div className="form-group">
            <label className="form-label">Purpose</label>
            <input name="purpose" value={form.purpose || ""} onChange={handleChange} placeholder="Brief purpose" className="form-control" />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Remarks <span style={{ color: "red" }}>*</span></label>
          <textarea name="remarks" value={form.remarks || ""} onChange={handleChange} rows={3} placeholder="Detailed remarks (required)" className="form-control" required />
        </div>
      </>
    );
  };

  const renderMedTechFields = () => {
    if (!showMedTechFields) return null;
    const config = medTechFieldConfig;
    return (
      <>
        {config.showEmployeeName && (
          <div className="form-group">
            <label className="form-label">{config.labelName || "Name"}</label>
            <input name="employee_name" value={form.employee_name || ""} onChange={handleChange} placeholder={`Enter ${config.labelName || "name"}`} className="form-control" />
          </div>
        )}
        {config.showVehicleType && (
          <div className="form-group">
            <label className="form-label">{config.labelVehicle || "Vehicle Type"}</label>
            <input name="vehicle_type" value={form.vehicle_type || ""} onChange={handleChange} placeholder="e.g. Car, Bike, Cab" className="form-control" />
          </div>
        )}
        {config.showPurpose && (
          <div className="form-group">
            <label className="form-label">Purpose</label>
            <input name="purpose" value={form.purpose || ""} onChange={handleChange} placeholder="Brief purpose" className="form-control" />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Remarks <span style={{ color: "red" }}>*</span></label>
          <textarea name="remarks" value={form.remarks || ""} onChange={handleChange} rows={3} placeholder="Detailed remarks (required)" className="form-control" required />
        </div>
      </>
    );
  };

  const renderPCMFields = () => {
    if (!showPCMFields) return null;
    const config = pcmFieldConfig;
    return (
      <>
        {config.showEmployeeName && (
          <div className="form-group">
            <label className="form-label">{config.labelName || "Name"}</label>
            <input name="employee_name" value={form.employee_name || ""} onChange={handleChange} placeholder={`Enter ${config.labelName || "name"}`} className="form-control" />
          </div>
        )}
        {config.showVehicleType && (
          <div className="form-group">
            <label className="form-label">{config.labelVehicle || "Vehicle Type"}</label>
            <input name="vehicle_type" value={form.vehicle_type || ""} onChange={handleChange} placeholder="e.g. Car, Bike, Cab" className="form-control" />
          </div>
        )}
        {config.showPurpose && (
          <div className="form-group">
            <label className="form-label">Purpose</label>
            <input name="purpose" value={form.purpose || ""} onChange={handleChange} placeholder="Brief purpose" className="form-control" />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Remarks <span style={{ color: "red" }}>*</span></label>
          <textarea name="remarks" value={form.remarks || ""} onChange={handleChange} rows={3} placeholder="Detailed remarks (required)" className="form-control" required />
        </div>
      </>
    );
  };

  // ✅ NEW — Dental fields renderer (mirrors IT Sales style)
  const renderDentalFields = () => {
    if (!showDentalFields) return null;
    const config = dentalFieldConfig;
    return (
      <>
        {config.showEmployeeName && (
          <div className="form-group">
            <label className="form-label">{config.labelName || "Name"}</label>
            <input name="employee_name" value={form.employee_name || ""} onChange={handleChange} placeholder={`Enter ${config.labelName || "name"}`} className="form-control" />
          </div>
        )}
        {config.showVehicleType && (
          <div className="form-group">
            <label className="form-label">{config.labelVehicle || "Vehicle Type"}</label>
            <input name="vehicle_type" value={form.vehicle_type || ""} onChange={handleChange} placeholder="e.g. Car, Bike, Cab" className="form-control" />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Generated By {form.entry_type === "Income" && <span style={{ color: "red" }}>*</span>}</label>
          <input name="generated_by" value={form.generated_by || ""} onChange={handleChange} placeholder="Enter employee name" className="form-control" />
        </div>
        <div className="form-row">
          {options.show_client_name && (
            <div className="form-group">
              <label className="form-label">Client Name</label>
              <input name="client_name" value={form.client_name || ""} onChange={handleChange} placeholder="Enter the client name" className="form-control" />
            </div>
          )}
          {options.show_gst_number && (
            <div className="form-group">
              <label className="form-label">GST Number {gstRequired ? `(required for ${form.category})` : "(optional)"}</label>
              <input name="gst_number" value={form.gst_number || ""} onChange={handleChange} placeholder="e.g. 22AAAAA0000A1Z5" className="form-control" />
            </div>
          )}
        </div>
        {config.showPurpose && (
          <div className="form-group">
            <label className="form-label">Purpose</label>
            <input name="purpose" value={form.purpose || ""} onChange={handleChange} placeholder="Brief purpose" className="form-control" />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Remarks <span style={{ color: "red" }}>*</span></label>
          <textarea name="remarks" value={form.remarks || ""} onChange={handleChange} rows={3} placeholder="Detailed remarks (required)" className="form-control" required />
        </div>
      </>
    );
  };

  /* ---------------- Ledger fields ---------------- */
  const renderLedgerFields = () => {
    const isEditingLedger = editingEntry && editingEntry._type === "ledger";

    let enhancedHistory = [];
    let prevBalance = 0;
    for (const entry of ledgerHistory) {
      const total = entry.total_amount || 0;
      const paid = entry.paid || 0;
      const balance = entry.balance || 0;
      const debit = Math.max(0, total - prevBalance);
      const credit = paid;
      let particulars = "—";
      if (debit > 0 && credit > 0) particulars = "Sale & Payment";
      else if (debit > 0) particulars = "Sale";
      else if (credit > 0) particulars = "Payment";
      enhancedHistory.push({ ...entry, debit, credit, particulars });
      prevBalance = balance;
    }

    return (
      <>
        <div className="form-group">
          <label className="form-label">Customer Name</label>
          <input type="text" value={ledgerCustomer} onChange={(e) => setLedgerCustomer(e.target.value)} placeholder="Enter customer name" className="form-control" required />
        </div>

        {ledgerCustomer.trim() && (
          <div className="form-group">
            <p style={{ fontSize: "0.9rem", color: "#6b7280", marginBottom: 4 }}>
              Outstanding Balance: <strong>{formatCurrency(ledgerOutstanding)}</strong>
            </p>
            {ledgerLoadingHistory ? (
              <p>Loading history...</p>
            ) : ledgerHistory.length > 0 ? (
              <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "8px" }}>
                <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #d1d5db" }}>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>Date</th>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>Particulars</th>
                      <th style={{ textAlign: "right", padding: "4px 8px" }}>Debit (₹)</th>
                      <th style={{ textAlign: "right", padding: "4px 8px" }}>Credit (₹)</th>
                      <th style={{ textAlign: "right", padding: "4px 8px" }}>Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enhancedHistory.map((entry) => (
                      <tr key={entry.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "4px 8px" }}>{entry.entry_date}</td>
                        <td style={{ padding: "4px 8px" }}>{entry.particulars}</td>
                        <td style={{ textAlign: "right", padding: "4px 8px" }}>{entry.debit > 0 ? formatCurrency(entry.debit) : "—"}</td>
                        <td style={{ textAlign: "right", padding: "4px 8px" }}>{entry.credit > 0 ? formatCurrency(entry.credit) : "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 600, padding: "4px 8px" }}>{formatCurrency(entry.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "#9ca3af" }}>No previous transactions.</p>
            )}
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{isEditingLedger ? "Total Amount (₹)" : "New Amount to Add (₹)"}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={isEditingLedger ? ledgerTotalAmount : ledgerNewAmount}
              onChange={(e) => {
                if (isEditingLedger) {
                  const val = parseFloat(e.target.value) || 0;
                  setLedgerTotalAmount(val);
                  const paid = parseFloat(ledgerPaid) || 0;
                  setLedgerBalance(val - paid);
                } else {
                  setLedgerNewAmount(e.target.value);
                }
              }}
              placeholder="0.00"
              className="form-control"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Paid (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={ledgerPaid}
              onChange={(e) => {
                const paid = parseFloat(e.target.value) || 0;
                setLedgerPaid(e.target.value);
                if (isEditingLedger) {
                  setLedgerBalance(ledgerTotalAmount - paid);
                } else {
                  const total = ledgerOutstanding + parseFloat(ledgerNewAmount) || 0;
                  setLedgerBalance(total - paid);
                }
              }}
              placeholder="0.00"
              className="form-control"
            />
          </div>
        </div>

        {!isEditingLedger && (
          <div className="form-group">
            <label className="form-label">Total Amount (auto-calculated)</label>
            <input type="text" value={formatCurrency(ledgerTotalAmount)} disabled className="form-control" style={{ backgroundColor: "#f3f4f6" }} />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Balance (auto-calculated)</label>
          <input type="text" value={formatCurrency(ledgerBalance)} disabled className="form-control" style={{ backgroundColor: "#f3f4f6" }} />
        </div>

        <div className="form-group">
          <label className="form-label">Date</label>
          <input type="date" name="entry_date" value={form.entry_date} onChange={handleChange} className="form-control" required />
        </div>

        <div className="form-group">
          <label className="form-label">Remarks</label>
          <textarea name="remarks" value={form.remarks} onChange={handleChange} rows={2} placeholder="Optional notes" className="form-control" />
        </div>

        <div style={{ marginTop: 12, background: "#f0f9ff", padding: "8px", borderRadius: "4px" }}>
          <p style={{ fontSize: "0.9rem" }}>
            <strong>Note:</strong> To add new amount, enter the amount in "New Amount to Add". To record a payment, set "New Amount" to 0 and enter the paid amount.
          </p>
        </div>
      </>
    );
  };

  /* ---------------- MAIN RENDER ---------------- */
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{editingEntry ? "Edit Finance Entry" : "New Finance Entry"}</h2>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label className="form-label">Department</label>
            <input value={department || ""} disabled className="form-control" />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select name="entry_type" value={form.entry_type} onChange={handleTypeChange} className="form-control">
                {(options.entry_types || []).map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              {form.entry_type === "Ledger" ? (
                <input value="Ledger" disabled className="form-control" />
              ) : (
                <select name="category" value={form.category} onChange={handleCategoryChange} className="form-control">
                  {categoryOptionsForType
                    .filter((cat) => !(isOfficeAdmin && cat === salaryCategoryName))
                    .map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
              )}
            </div>
          </div>

          {isOthersCategory && (
            <div className="form-group">
              <label className="form-label">Other Category Name</label>
              <input value={otherCategory} onChange={(e) => setOtherCategory(e.target.value)} placeholder="Enter a category name" className="form-control" />
            </div>
          )}

          {/* ===== ITEMS SECTION ===== */}
          {options.show_items && !isGoodwill && (
            (department !== "MedTech" || (department === "MedTech" && MEDTECH_ITEM_CATEGORIES.includes(form.category))) ? (
              <div className="form-group">
                <label className="form-label">Items</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((item) => (
                    <div key={item._key} style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 32px", gap: 8, alignItems: "center" }}>
                      <input value={item.item_name} onChange={(e) => handleItemChange(item._key, "item_name", e.target.value)} placeholder="Item name" className="form-control" />
                      <input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => handleItemChange(item._key, "quantity", e.target.value)} placeholder="Qty" className="form-control" />
                      <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => handleItemChange(item._key, "unit_price", e.target.value)} placeholder="Unit price" className="form-control" />
                      <button type="button" className="btn-icon btn-icon--danger" onClick={() => handleRemoveItem(item._key)} title="Remove item" disabled={items.length === 1}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={handleAddItem} className="btn btn-secondary" style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Plus size={15} /> Add New Item
                </button>
                <div style={{ marginTop: 12, textAlign: "right" }}>
                  {options.show_gst_tax ? (
                    <>
                      <div style={{ fontSize: 13, color: "var(--color-ink-500)" }}>Subtotal: {formatCurrency(baseAmount)}</div>
                      <div style={{ fontSize: 13, color: "var(--color-ink-500)" }}>GST Tax ({gstTaxPercentValue || 0}%): {formatCurrency(gstTaxAmount)}</div>
                      <div style={{ fontWeight: 700, marginTop: 4 }}>Total Amount: {formatCurrency(grandTotal)}</div>
                    </>
                  ) : (
                    <div style={{ fontWeight: 600 }}>Total Amount: {formatCurrency(itemsTotal)}</div>
                  )}
                </div>
              </div>
            ) : null
          )}

          {/* ===== AMOUNT FIELD ===== */}
          {(!options.show_items || (department === "MedTech" && !MEDTECH_ITEM_CATEGORIES.includes(form.category))) && !isLedger && !isGoodwill && !isSalaryCategory && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Amount (₹)</label>
                <input type="number" step="0.01" min="0" name="amount" value={form.amount} onChange={handleChange} placeholder="0.00" className="form-control" required />
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input type="date" name="entry_date" value={form.entry_date} onChange={handleChange} className="form-control" />
              </div>
            </div>
          )}

          {(!options.show_items || (department === "MedTech" && !MEDTECH_ITEM_CATEGORIES.includes(form.category))) && options.show_gst_tax && !isLedger && !isGoodwill && !isSalaryCategory && (
            <p className="text-muted" style={{ textAlign: "right", fontSize: 13, marginTop: -8 }}>
              GST Tax ({gstTaxPercentValue || 0}%): {formatCurrency(gstTaxAmount)}
              {" · "}
              <strong style={{ color: "var(--color-ink-800)" }}>Total: {formatCurrency(grandTotal)}</strong>
            </p>
          )}

          {/* ===== Salary warnings ===== */}
          {isOfficeAdmin && form.category === salaryCategoryName && (
            <div className="alert alert-info" style={{ background: "#f0f0ff", padding: "12px", borderRadius: "8px", marginBottom: "12px" }}>
              <strong>⚠️ Salary must be entered by Corporate Management only.</strong>
              <p style={{ marginTop: "4px", fontSize: "0.9rem" }}>Please use the Corporate Management dashboard to add salary records for Office Administration employees.</p>
            </div>
          )}

          {isITSales && !isITSalesSalaryCategory && (
            <div className="form-group">
              <label className="form-label">Team</label>
              <input name="team" value={form.team || ""} onChange={handleChange} placeholder="e.g. Sales Team, Enterprise Sales, B2B Team" className="form-control" />
            </div>
          )}

          {isITSalaryCategory && (
            <div className="alert alert-info" style={{ background: "#f0f0ff", padding: "12px", borderRadius: "8px", marginBottom: "12px" }}>
              <strong>⚠️ Salaries must be entered by Corporate Management only.</strong>
              <p style={{ marginTop: "4px", fontSize: "0.9rem" }}>Please use the Corporate Management dashboard to add salary records for IT Development employees.</p>
            </div>
          )}

          {isITSalesSalaryCategory && (
            <div className="alert alert-info" style={{ background: "#f0f0ff", padding: "12px", borderRadius: "8px", marginBottom: "12px" }}>
              <strong>⚠️ Salaries must be entered by Corporate Management only.</strong>
              <p style={{ marginTop: "4px", fontSize: "0.9rem" }}>Please use the Corporate Management dashboard to add salary records for IT Sales employees.</p>
            </div>
          )}

          {isMedTechSalaryCategory && (
            <div className="alert alert-info" style={{ background: "#f0f0ff", padding: "12px", borderRadius: "8px", marginBottom: "12px" }}>
              <strong>⚠️ Salaries must be entered by Corporate Management only.</strong>
              <p style={{ marginTop: "4px", fontSize: "0.9rem" }}>Please use the Corporate Management dashboard to add salary records for MedTech employees.</p>
            </div>
          )}

          {isPCMSalaryCategory && (
            <div className="alert alert-info" style={{ background: "#f0f0ff", padding: "12px", borderRadius: "8px", marginBottom: "12px" }}>
              <strong>⚠️ Salaries must be entered by Corporate Management only.</strong>
              <p style={{ marginTop: "4px", fontSize: "0.9rem" }}>Please use the Corporate Management dashboard to add salary records for PCM employees.</p>
            </div>
          )}

          {/* ✅ NEW — Dental salary warning */}
          {isDentalSalaryCategory && (
            <div className="alert alert-info" style={{ background: "#f0f0ff", padding: "12px", borderRadius: "8px", marginBottom: "12px" }}>
              <strong>⚠️ Salaries must be entered by Corporate Management only.</strong>
              <p style={{ marginTop: "4px", fontSize: "0.9rem" }}>Please use the Corporate Management dashboard to add salary records for Dental employees.</p>
            </div>
          )}

          {/* ========== SALARY CATEGORY ========== */}
          {isSalaryCategory && (
            <div className="form-group">
              <label className="form-label">Employees</label>
              {employees.map((emp) => (
                <div key={emp._key} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, marginBottom: 12, position: "relative" }}>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Department</label>
                      <select value={emp.exec_department} onChange={(e) => handleEmployeeChange(emp._key, "exec_department", e.target.value)} className="form-control">
                        <option value="">Select Department</option>
                        {(options.exec_departments || []).map((deptKey) => {
                          const deptLabel = DEPARTMENTS_CONFIG.find((d) => d.value === deptKey)?.label || deptKey;
                          return <option key={deptKey} value={deptKey}>{deptLabel}</option>;
                        })}
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Employee Name</label>
                      <input value={emp.employee_name} onChange={(e) => handleEmployeeChange(emp._key, "employee_name", e.target.value)} placeholder="Employee name" className="form-control" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Salary (₹)</label>
                      <input type="number" min="0" step="0.01" value={emp.salary_amount} onChange={(e) => handleEmployeeChange(emp._key, "salary_amount", e.target.value)} placeholder="0.00" className="form-control" />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">TADA (₹)</label>
                      <input type="number" min="0" step="0.01" value={emp.allowance_amount} onChange={(e) => handleEmployeeChange(emp._key, "allowance_amount", e.target.value)} placeholder="0.00" className="form-control" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Total (Salary + TADA)</label>
                      <input value={formatCurrency(emp.total)} disabled className="form-control" style={{ backgroundColor: "#f3f4f6" }} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Remarks</label>
                      <input value={emp.remarks || ""} onChange={(e) => handleEmployeeChange(emp._key, "remarks", e.target.value)} placeholder="Optional" className="form-control" />
                    </div>
                  </div>
                  {!isEditingSalaryEntry && (
                    <button type="button" className="btn-icon btn-icon--danger" onClick={() => handleRemoveEmployee(emp._key)} style={{ position: "absolute", top: 8, right: 8 }} title="Remove employee">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
              {!isEditingSalaryEntry && (
                <button type="button" onClick={handleAddEmployee} className="btn btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Plus size={15} /> Add Employee
                </button>
              )}

              <div className="form-row" style={{ marginTop: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Date <span style={{ color: "red" }}>*</span></label>
                  <input type="date" name="entry_date" value={form.entry_date} onChange={handleChange} className="form-control" required />
                </div>
              </div>
              <div style={{ marginTop: 12, textAlign: "right", fontWeight: "bold" }}>
                Total Salary Expense: {formatCurrency(salaryTotal)}
              </div>
            </div>
          )}

          {/* ===== LEDGER FIELDS ===== */}
          {isLedger && renderLedgerFields()}

          {/* ===== GOODWILL FIELDS ===== */}
          {isGoodwill && (
            <>
              <div className="form-group">
                <label className="form-label">Client Name <span style={{ color: "red" }}>*</span></label>
                <input list="clientList" name="client_name" value={form.client_name || ""} onChange={handleChange} placeholder="Search or enter client name" className="form-control" required />
                <datalist id="clientList">
                  {clientSuggestions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount (₹) <span style={{ color: "red" }}>*</span></label>
                  <input type="number" step="0.01" min="0" name="amount" value={form.amount} onChange={handleChange} placeholder="0.00" className="form-control" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Date <span style={{ color: "red" }}>*</span></label>
                  <input type="date" name="entry_date" value={form.entry_date} onChange={handleChange} className="form-control" required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Remarks</label>
                <textarea name="remarks" value={form.remarks} onChange={handleChange} rows={3} placeholder="Optional notes" className="form-control" />
              </div>
            </>
          )}

          {/* ===== OFFICE ADMIN FIELDS ===== */}
          {isOfficeAdmin && !isOfficeAdminSalary && !isLedger && (
            <>
              {officeFieldConfig && (
                <>
                  {officeFieldConfig.showEmployeeName && (
                    <div className="form-group">
                      <label className="form-label">{officeFieldConfig.labelName || "Name"}</label>
                      <input name="employee_name" value={form.employee_name || ""} onChange={handleChange} placeholder={`Enter ${officeFieldConfig.labelName || "name"}`} className="form-control" />
                    </div>
                  )}
                  {officeFieldConfig.showVehicleType && (
                    <div className="form-group">
                      <label className="form-label">{officeFieldConfig.labelVehicle || "Vehicle Type"}</label>
                      <input name="vehicle_type" value={form.vehicle_type || ""} onChange={handleChange} placeholder="e.g. Car, Bike, Cab" className="form-control" />
                    </div>
                  )}
                  {officeFieldConfig.showPurpose && (
                    <div className="form-group">
                      <label className="form-label">Purpose / Remarks</label>
                      <textarea name="remarks" value={form.remarks || ""} onChange={handleChange} rows={3} placeholder="Enter purpose or additional notes" className="form-control" />
                    </div>
                  )}
                </>
              )}
              {!officeFieldConfig?.showPurpose && (
                <div className="form-group">
                  <label className="form-label">Remarks</label>
                  <textarea name="remarks" value={form.remarks || ""} onChange={handleChange} rows={3} placeholder="Optional notes" className="form-control" />
                </div>
              )}
            </>
          )}

          {/* ===== IT FIELDS ===== */}
          {isIT && !isITSalaryCategory && !isLedger && (
            showITFields ? renderITFields() : renderStandardFields()
          )}

          {/* ===== IT SALES FIELDS ===== */}
          {isITSales && !isITSalesSalaryCategory && !isLedger && (
            showITSalesFields ? renderITSalesFields() : renderStandardFields()
          )}

          {/* ===== MEDTECH FIELDS ===== */}
          {isMedTech && !isMedTechSalaryCategory && !isLedger && !isGoodwill && (
            showMedTechFields ? renderMedTechFields() : renderStandardFields()
          )}

          {/* ===== PCM FIELDS ===== */}
          {isPCM && !isPCMSalaryCategory && !isLedger && (
            showPCMFields ? renderPCMFields() : renderStandardFields()
          )}

          {/* ✅ NEW — DENTAL FIELDS */}
          {isDental && !isDentalSalaryCategory && !isLedger && (
            showDentalFields ? renderDentalFields() : renderStandardFields()
          )}

          {/* ===== STANDARD FIELDS ===== */}
          {!isSalaryCategory && !isOfficeAdmin && !isIT && !isITSales && !isMedTech && !isPCM && !isDental && !isLedger && !isGoodwill && renderStandardFields()}

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={saving}>Cancel</button>
            <button
              type="submit"
              disabled={
                saving ||
                isITSalaryCategory ||
                isITSalesSalaryCategory ||
                isMedTechSalaryCategory ||
                isPCMSalaryCategory ||
                isDentalSalaryCategory ||   // ✅ NEW
                isOfficeAdminSalary
              }
              className="btn btn-primary"
            >
              {saving ? "Saving..." : editingEntry ? "Update Entry" : "Save Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}