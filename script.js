"use strict";

const STORAGE_KEY = "areev_sales_manager_v1";
const SESSION_KEY = "areev_current_session_v1";

let database = loadDatabase();
let currentUser = null;
let currentPage = "dashboard";
let editingProductId = null;
let editingCustomerId = null;
let editingNoteId = null;
let cart = [];

function $(id) {
  return document.getElementById(id);
}

function makeId() {
  return Date.now().toString(36) +
    Math.random().toString(36).slice(2, 9);
}

function todayKey() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function money(value) {
  return "₹" + Number(value || 0).toFixed(2);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function loadDatabase() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      const data = JSON.parse(saved);
      if (data && Array.isArray(data.accounts)) {
        return data;
      }
    }
  } catch (error) {
    console.error(error);
  }

  return { accounts: [] };
}

function saveDatabase() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(database)
    );
    return true;
  } catch (error) {
    console.error(error);
    showToast("Could not save data.");
    return false;
  }
}

function getAccount() {
  return database.accounts.find(
    account => account.id === currentUser
  ) || null;
}

function getData() {
  const account = getAccount();
  if (!account) return null;

  if (!Array.isArray(account.products)) account.products = [];
  if (!Array.isArray(account.customers)) account.customers = [];
  if (!Array.isArray(account.sales)) account.sales = [];
  if (!Array.isArray(account.notes)) account.notes = [];
  if (!Array.isArray(account.bin)) account.bin = [];

  if (!account.profile) account.profile = {};
  if (!account.settings) account.settings = {};

  return account;
}

function saveData() {
  saveDatabase();
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function formatDate(dateString) {
  if (!dateString) return "—";

  const date = new Date(dateString + "T00:00:00");

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getTodaySales() {
  const data = getData();
  if (!data) return [];

  return data.sales.filter(
    sale => sale.date === todayKey()
  );
}

function totalSales(sales) {
  return sales.reduce(
    (sum, sale) => sum + Number(sale.total || 0),
    0
  );
}

/* ACCOUNT SYSTEM */

let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;

  $("registerFields").classList.toggle(
    "hidden",
    mode !== "register"
  );

  document.querySelectorAll("[data-auth]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.auth === mode
    );
  });

  $("authSubmit").textContent =
    mode === "register" ? "Create account" : "Login";

  $("authMessage").textContent = "";

  $("authPassword").autocomplete =
    mode === "register" ? "new-password" : "current-password";
}

function createAccount() {
  const name = $("regName").value.trim();
  const gender = $("regGender").value;
  const business = $("regBusiness").value.trim();
  const phone = $("authPhone").value.trim();
  const password = $("authPassword").value;
  const confirm = $("regConfirm").value;

  if (!name || !phone || !password || !business) {
    $("authMessage").textContent =
      "Please complete all required fields.";
    return;
  }

  if (!/^[0-9+()\\-\\s]{8,20}$/.test(phone)) {
    $("authMessage").textContent =
      "Enter a valid phone number.";
    return;
  }

  if (password.length < 6) {
    $("authMessage").textContent =
      "Password must contain at least 6 characters.";
    return;
  }

  if (password !== confirm) {
    $("authMessage").textContent =
      "Passwords do not match.";
    return;
  }

  if (database.accounts.some(a => a.phone === phone)) {
    $("authMessage").textContent =
      "Phone number already registered.";
    return;
  }

  const account = {
    id: makeId(),
    name,
    phone,
    gender,
    business,
    password,
    profile: {
      name,
      phone,
      gender,
      business,
      photo: ""
    },
    settings: {
      language: "en",
      whatsappNumber: "",
      reminderEnabled: false
    },
    products: [],
    customers: [],
    sales: [],
    notes: [],
    bin: [],
    createdAt: new Date().toISOString()
  };

  database.accounts.push(account);

  if (!saveDatabase()) {
    database.accounts.pop();
    $("authMessage").textContent = "Could not save account.";
    return;
  }

  currentUser = account.id;
  localStorage.setItem(SESSION_KEY, currentUser);

  openApplication();
  showToast("Account created successfully.");
}
