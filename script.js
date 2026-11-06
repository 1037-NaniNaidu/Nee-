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
/* =========================================
   PART 2 - LOGIN AND APPLICATION
========================================= */

function loginAccount() {
  const phone = $("authPhone").value.trim();
  const password = $("authPassword").value;

  const account = database.accounts.find(item =>
    item.phone === phone && item.password === password
  );

  if (!account) {
    $("authMessage").textContent =
      "Incorrect phone number or password.";
    return;
  }

  currentUser = account.id;
  localStorage.setItem(SESSION_KEY, currentUser);

  openApplication();
  showToast("Welcome back!");
}

function handleAuthSubmit(event) {
  event.preventDefault();

  if (authMode === "register") {
    createAccount();
  } else {
    loginAccount();
  }
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
  cart = [];

  $("app").classList.add("hidden");
  $("authScreen").classList.remove("hidden");

  $("authPassword").value = "";
  $("authMessage").textContent = "";

  setAuthMode("login");
}

function openApplication() {
  const account = getAccount();

  if (!account) {
    logout();
    return;
  }

  $("authScreen").classList.add("hidden");
  $("app").classList.remove("hidden");

  updateUserDetails();
  updateDate();

  showPage("dashboard");
}

function updateUserDetails() {
  const account = getAccount();
  if (!account) return;

  const name = account.profile?.name || account.name || "User";

  $("userName").textContent = name;
  $("userInitial").textContent =
    name.charAt(0).toUpperCase();
}

function updateDate() {
  const date = new Date();

  $("todayDate").textContent =
    date.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
}

/* =========================================
   PAGE NAVIGATION
========================================= */

const pageTitles = {
  dashboard: "Dashboard",
  products: "Products",
  customers: "Customers",
  sales: "Sales",
  notes: "Daily Sales Notes",
  reports: "Reports",
  profile: "Profile",
  settings: "Settings",
  bin: "Recycle Bin"
};

function showPage(page) {
  const data = getData();

  if (!data) return;

  currentPage = page;

  $("pageTitle").textContent =
    pageTitles[page] || "Dashboard";

  document.querySelectorAll(".nav-link[data-page]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });

  const content = $("pageContent");

  if (page === "dashboard") {
    renderDashboard(content);
  } else if (page === "products") {
    renderProducts(content);
  } else if (page === "customers") {
    renderCustomers(content);
  } else if (page === "sales") {
    renderSales(content);
  } else if (page === "notes") {
    renderNotes(content);
  } else if (page === "reports") {
    renderReports(content);
  } else if (page === "profile") {
    renderProfile(content);
  } else if (page === "settings") {
    renderSettings(content);
  } else if (page === "bin") {
    renderBin(content);
  }

  const sidebar = document.querySelector(".sidebar");
  sidebar.classList.remove("open");
}

/* =========================================
   DASHBOARD
========================================= */

function renderDashboard(content) {
  const data = getData();

  const todaySales = getTodaySales();
  const todayTotal = totalSales(todaySales);
  const allTotal = totalSales(data.sales);

  const stockCount = data.products.reduce(
    (sum, product) =>
      sum + Number(product.stock || 0),
    0
  );

  content.innerHTML = `
    <div class="section-head">
      <div>
        <h3>Welcome, ${escapeHTML(
          data.profile?.name || data.name || "User"
        )}!</h3>
        <p class="muted small">
          Here's your business overview.
        </p>
      </div>

      <button class="primary"
        onclick="showPage('sales')">
        + New Sale
      </button>
    </div>

    <div class="grid">

      <div class="stat">
        <div class="label">Today's Sales</div>
        <div class="value">${money(todayTotal)}</div>
      </div>

      <div class="stat">
        <div class="label">All-time Sales</div>
        <div class="value">${money(allTotal)}</div>
      </div>

      <div class="stat">
        <div class="label">Products</div>
        <div class="value">${data.products.length}</div>
      </div>

      <div class="stat">
        <div class="label">Customers</div>
        <div class="value">${data.customers.length}</div>
      </div>

    </div>

    <div class="panel">
      <h3>Quick Access</h3>

      <div class="shortcut-grid">

        <button class="shortcut"
          onclick="showPage('products')">
          <b>Products</b>
          <span class="small muted">
            Manage stock and prices
          </span>
        </button>

        <button class="shortcut"
          onclick="showPage('customers')">
          <b>Customers</b>
          <span class="small muted">
            Manage customer details
          </span>
        </button>

        <button class="shortcut"
          onclick="showPage('sales')">
          <b>New Sale</b>
          <span class="small muted">
            Record a new sale
          </span>
        </button>

        <button class="shortcut"
          onclick="showPage('reports')">
          <b>Reports</b>
          <span class="small muted">
            View sales reports
          </span>
        </button>

        <button class="shortcut"
          onclick="showPage('notes')">
          <b>Daily Notes</b>
          <span class="small muted">
            Record planned sales
          </span>
        </button>

        <button class="shortcut"
          onclick="showPage('profile')">
          <b>Profile</b>
          <span class="small muted">
            Edit your profile
          </span>
        </button>

        <button class="shortcut"
          onclick="showPage('settings')">
          <b>Settings</b>
          <span class="small muted">
            Manage preferences
          </span>
        </button>

        <button class="shortcut"
          onclick="showPage('bin')">
          <b>Recycle Bin</b>
          <span class="small muted">
            Restore deleted records
          </span>
        </button>

      </div>
    </div>

    <div class="panel">
      <h3>Today's Recent Sales</h3>

      ${
        todaySales.length
          ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Customer</th>
                    <th>Amount</th>
                  </tr>
                </thead>

                <tbody>
                  ${todaySales.slice().reverse()
                    .slice(0, 5).map(sale => `
                      <tr>
                        <td>${escapeHTML(
                          sale.time || "—"
                        )}</td>

                        <td>${escapeHTML(
                          sale.customerName || "General Sale"
                        )}</td>

                        <td>${money(sale.total)}</td>
                      </tr>
                    `).join("")}
                </tbody>
              </table>
            </div>
          `
          : `
            <div class="empty">
              No sales recorded today.
            </div>
          `
      }
    </div>

    <div class="panel">
      <h3>Stock Overview</h3>
      <p class="muted">
        Total remaining stock:
        <b>${stockCount}</b> units
      </p>
    </div>
  `;
}

/* =========================================
   END OF PART 2
========================================= */
