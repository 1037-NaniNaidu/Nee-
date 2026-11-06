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
/* =========================================
   PART 3 - PRODUCTS
========================================= */

function renderProducts(content) {
  const data = getData();

  content.innerHTML = `
    <div class="section-head">
      <h3>Product Management</h3>
      <button class="primary"
        onclick="openProductForm()">
        + Add Product
      </button>
    </div>

    <input id="productSearch"
      placeholder="Search products..."
      oninput="filterProducts()">

    <div id="productFormArea"></div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Remaining Stock</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="productTable"></tbody>
      </table>
    </div>
  `;

  drawProducts();
}

function drawProducts() {
  const data = getData();
  const table = $("productTable");

  if (!table) return;

  if (!data.products.length) {
    table.innerHTML = `
      <tr>
        <td colspan="4" class="empty">
          No products added yet.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = data.products.map(product => `
    <tr>
      <td>${escapeHTML(product.name)}</td>
      <td>${money(product.price)}</td>
      <td>${Number(product.stock || 0)}</td>
      <td>
        <div class="actions">
          <button class="secondary"
            onclick="editProduct('${product.id}')">
            Edit
          </button>

          <button class="danger"
            onclick="deleteProduct('${product.id}')">
            Delete
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

function filterProducts() {
  const search = $("productSearch").value.toLowerCase();

  document.querySelectorAll("#productTable tr").forEach(row => {
    row.style.display =
      row.textContent.toLowerCase().includes(search)
        ? ""
        : "none";
  });
}

function openProductForm(product = null) {
  editingProductId = product ? product.id : null;

  $("productFormArea").innerHTML = `
    <div class="form-card">
      <h3>${product ? "Edit Product" : "Add Product"}</h3>

      <label>Product Name
        <input id="productName"
          value="${escapeHTML(product?.name || "")}">
      </label>

      <label>Selling Price (₹)
        <input id="productPrice"
          type="number" min="0" step="0.01"
          value="${product?.price ?? ""}">
      </label>

      <label>Total Stock
        <input id="productStock"
          type="number" min="0" step="1"
          value="${product?.stock ?? ""}">
      </label>

      <div class="form-actions">
        <button class="primary"
          onclick="saveProduct()">
          Save Product
        </button>

        <button class="secondary"
          onclick="closeProductForm()">
          Cancel
        </button>
      </div>
    </div>
  `;
}

function closeProductForm() {
  editingProductId = null;
  $("productFormArea").innerHTML = "";
}

function saveProduct() {
  const data = getData();

  const name = $("productName").value.trim();
  const price = Number($("productPrice").value);
  const stock = Number($("productStock").value);

  if (!name || $("productPrice").value === "" ||
      $("productStock").value === "") {
    showToast("Please complete all product fields.");
    return;
  }

  if (!Number.isFinite(price) || price < 0 ||
      !Number.isInteger(stock) || stock < 0) {
    showToast("Enter a valid price and stock.");
    return;
  }

  if (editingProductId) {
    const product = data.products.find(
      item => item.id === editingProductId
    );

    if (product) {
      product.name = name;
      product.price = price;
      product.stock = stock;
    }
  } else {
    data.products.push({
      id: makeId(),
      name,
      price,
      stock,
      createdAt: new Date().toISOString()
    });
  }

  saveData();
  closeProductForm();
  drawProducts();
  showToast("Product saved.");
}

function editProduct(id) {
  const product = getData().products.find(
    item => item.id === id
  );

  if (product) openProductForm(product);
}

function deleteProduct(id) {
  const data = getData();

  if (!confirm("Move this product to Recycle Bin?")) return;

  const index = data.products.findIndex(
    item => item.id === id
  );

  if (index < 0) return;

  const product = data.products.splice(index, 1)[0];

  data.bin.push({
    id: makeId(),
    type: "product",
    record: product,
    deletedAt: new Date().toISOString()
  });

  saveData();
  drawProducts();
  showToast("Product moved to Recycle Bin.");
}

/* =========================================
   PART 3 - CUSTOMERS
========================================= */

function renderCustomers(content) {
  const data = getData();

  content.innerHTML = `
    <div class="section-head">
      <h3>Customer Management</h3>

      <button class="primary"
        onclick="openCustomerForm()">
        + Add Customer
      </button>
    </div>

    <input id="customerSearch"
      placeholder="Search customers..."
      oninput="filterCustomers()">

    <div id="customerFormArea"></div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Total Purchases</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody id="customerTable"></tbody>
      </table>
    </div>
  `;

  drawCustomers();
}

function drawCustomers() {
  const data = getData();
  const table = $("customerTable");

  if (!table) return;

  if (!data.customers.length) {
    table.innerHTML = `
      <tr>
        <td colspan="4" class="empty">
          No customers added yet.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = data.customers.map(customer => {
    const purchases = data.sales
      .filter(sale => sale.customerId === customer.id);

    const total = totalSales(purchases);

    return `
      <tr>
        <td>${escapeHTML(customer.name)}</td>
        <td>${escapeHTML(customer.phone || "—")}</td>
        <td>${money(total)}</td>
        <td>
          <div class="actions">
            <button class="secondary"
              onclick="editCustomer('${customer.id}')">
              Edit
            </button>

            <button class="secondary"
              onclick="viewCustomer('${customer.id}')">
              History
            </button>

            <button class="danger"
              onclick="deleteCustomer('${customer.id}')">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterCustomers() {
  const search = $("customerSearch").value.toLowerCase();

  document.querySelectorAll("#customerTable tr").forEach(row => {
    row.style.display =
      row.textContent.toLowerCase().includes(search)
        ? ""
        : "none";
  });
}

function openCustomerForm(customer = null) {
  editingCustomerId = customer ? customer.id : null;

  $("customerFormArea").innerHTML = `
    <div class="form-card">
      <h3>${customer ? "Edit Customer" : "Add Customer"}</h3>

      <label>Customer Name
        <input id="customerName"
          value="${escapeHTML(customer?.name || "")}">
      </label>

      <label>Phone Number
        <input id="customerPhone"
          inputmode="tel"
          value="${escapeHTML(customer?.phone || "")}">
      </label>

      <label>Additional Information
        <textarea id="customerInfo">${escapeHTML(
          customer?.info || ""
        )}</textarea>
      </label>

      <div class="form-actions">
        <button class="primary"
          onclick="saveCustomer()">
          Save Customer
        </button>

        <button class="secondary"
          onclick="closeCustomerForm()">
          Cancel
        </button>
      </div>
    </div>
  `;
}

function closeCustomerForm() {
  editingCustomerId = null;
  $("customerFormArea").innerHTML = "";
}

function saveCustomer() {
  const data = getData();

  const name = $("customerName").value.trim();
  const phone = $("customerPhone").value.trim();
  const info = $("customerInfo").value.trim();

  if (!name) {
    showToast("Enter customer name.");
    return;
  }

  if (editingCustomerId) {
    const customer = data.customers.find(
      item => item.id === editingCustomerId
    );

    if (customer) {
      customer.name = name;
      customer.phone = phone;
      customer.info = info;
    }
  } else {
    data.customers.push({
      id: makeId(),
      name,
      phone,
      info,
      createdAt: new Date().toISOString()
    });
  }

  saveData();
  closeCustomerForm();
  drawCustomers();
  showToast("Customer saved.");
}

function editCustomer(id) {
  const customer = getData().customers.find(
    item => item.id === id
  );

  if (customer) openCustomerForm(customer);
}

function deleteCustomer(id) {
  const data = getData();

  if (!confirm("Move this customer to Recycle Bin?")) return;

  const index = data.customers.findIndex(
    item => item.id === id
  );

  if (index < 0) return;

  const customer = data.customers.splice(index, 1)[0];

  data.bin.push({
    id: makeId(),
    type: "customer",
    record: customer,
    deletedAt: new Date().toISOString()
  });

  saveData();
  drawCustomers();
  showToast("Customer moved to Recycle Bin.");
}

function viewCustomer(id) {
  const data = getData();

  const customer = data.customers.find(
    item => item.id === id
  );

  if (!customer) return;

  const purchases = data.sales.filter(
    sale => sale.customerId === id
  );

  const total = totalSales(purchases);

  $("pageContent").innerHTML = `
    <div class="section-head">
      <h3>${escapeHTML(customer.name)}</h3>

      <button class="secondary"
        onclick="showPage('customers')">
        Back
      </button>
    </div>

    <div class="panel">
      <p>Phone: ${escapeHTML(customer.phone || "—")}</p>
      <p>Total purchases: <b>${money(total)}</b></p>
      <p>Number of sales: <b>${purchases.length}</b></p>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Amount</th>
          </tr>
        </thead>

        <tbody>
          ${purchases.map(sale => `
            <tr>
              <td>${formatDate(sale.date)}</td>
              <td>${money(sale.total)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* =========================================
   PART 3 - SALES
========================================= */

function renderSales(content) {
  const data = getData();

  content.innerHTML = `
    <div class="section-head">
      <h3>Create New Sale</h3>
    </div>

    <div class="form-card">
      <label>Select Customer
        <select id="saleCustomer">
          <option value="">General Sale</option>

          ${data.customers.map(customer => `
            <option value="${customer.id}">
              ${escapeHTML(customer.name)}
            </option>
          `).join("")}
        </select>
      </label>

      <label>Select Product
        <select id="saleProduct">
          <option value="">Choose product</option>

          ${data.products.map(product => `
            <option value="${product.id}">
              ${escapeHTML(product.name)}
              — ${money(product.price)}
              — Stock: ${product.stock}
            </option>
          `).join("")}
        </select>
      </label>

      <label>Quantity
        <input id="saleQuantity"
          type="number" min="1" step="1" value="1">
      </label>

      <button class="primary"
        onclick="addToCart()">
        Add to Cart
      </button>
    </div>

    <div class="panel">
      <h3>Cart</h3>

      <div id="cartArea"></div>

      <h3 id="cartTotal">Total: ₹0.00</h3>

      <button class="primary"
        onclick="completeSale()">
        Confirm Sale
      </button>

      <button class="secondary"
        onclick="clearCart()">
        Clear Cart
      </button>
    </div>
  `;

  drawCart();
}

function addToCart() {
  const data = getData();

  const productId = $("saleProduct").value;
  const quantity = Number($("saleQuantity").value);

  const product = data.products.find(
    item => item.id === productId
  );

  if (!product) {
    showToast("Select a product.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    showToast("Enter a valid quantity.");
    return;
  }

  const existing = cart.find(
    item => item.productId === productId
  );

  const alreadyAdded = existing ? existing.quantity : 0;

  if (alreadyAdded + quantity > Number(product.stock)) {
    showToast("Not enough stock available.");
    return;
  }

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      productId,
      name: product.name,
      price: Number(product.price),
      quantity
    });
  }

  drawCart();
  showToast("Added to cart.");
}

function drawCart() {
  const area = $("cartArea");

  if (!area) return;

  if (!cart.length) {
    area.innerHTML = `
      <div class="empty">Your cart is empty.</div>
    `;

    $("cartTotal").textContent = "Total: ₹0.00";
    return;
  }

  area.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Quantity</th>
            <th>Total</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          ${cart.map((item, index) => `
            <tr>
              <td>${escapeHTML(item.name)}</td>
              <td>${money(item.price)}</td>

              <td>
                <input type="number"
                  min="1"
                  value="${item.quantity}"
                  onchange="changeCartQuantity(${index}, this.value)">
              </td>

              <td>${money(item.price * item.quantity)}</td>

              <td>
                <button class="danger"
                  onclick="removeCartItem(${index})">
                  Remove
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  const total = cart.reduce(
    (sum, item) =>
      sum + item.price * item.quantity,
    0
  );

  $("cartTotal").textContent = "Total: " + money(total);
}

function changeCartQuantity(index, value) {
  const data = getData();
  const quantity = Number(value);
  const item = cart[index];

  if (!item) return;

  const product = data.products.find(
    product => product.id === item.productId
  );

  if (!Number.isInteger(quantity) || quantity <= 0 ||
      !product || quantity > Number(product.stock)) {
    showToast("Invalid quantity or insufficient stock.");
    drawCart();
    return;
  }

  item.quantity = quantity;
  drawCart();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  drawCart();
}

function clearCart() {
  cart = [];
  drawCart();
}

function completeSale() {
  const data = getData();

  if (!cart.length) {
    showToast("Your cart is empty.");
    return;
  }

  for (const item of cart) {
    const product = data.products.find(
      product => product.id === item.productId
    );

    if (!product || product.stock < item.quantity) {
      showToast("Stock changed. Check your cart.");
      return;
    }
  }

  const customerId = $("saleCustomer").value;

  const customer = data.customers.find(
    item => item.id === customerId
  );

  const total = cart.reduce(
    (sum, item) =>
      sum + item.price * item.quantity,
    0
  );

  const sale = {
    id: makeId(),
    date: todayKey(),
    time: new Date().toLocaleTimeString("en-IN"),
    customerId: customerId || "",
    customerName: customer ? customer.name : "General Sale",
    items: cart.map(item => ({ ...item })),
    total
  };

  cart.forEach(item => {
    const product = data.products.find(
      product => product.id === item.productId
    );

    product.stock -= item.quantity;
  });

  data.sales.push(sale);

  if (!saveDatabase()) {
    data.sales.pop();

    cart.forEach(item => {
      const product = data.products.find(
        product => product.id === item.productId
      );

      if (product) product.stock += item.quantity;
    });

    return;
  }

  cart = [];

  showToast("Sale recorded successfully.");
  showPage("sales");
}

/* =========================================
   END OF PART 3
========================================= */
