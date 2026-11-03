(() => {
"use strict";
const $ = id => document.getElementById(id);
const money = n => "₹" + Number(n || 0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const today = () => new Date().toISOString().slice(0,10);
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const config = { url:"YOUR_SUPABASE_PROJECT_URL", key:"YOUR_SUPABASE_ANON_PUBLIC_KEY" };
let db=null, session=null, profile=null, products=[], customers=[], sales=[], ledger=[], cart=[], reportSales=[], authMode="login";
let busy=false;

function msg(text, error=false){$("globalMessage").textContent=text||"";$("globalMessage").style.color=error?"#c62828":"#16834a";}
function authMsg(text){$("authMessage").textContent=text||"";}
function loading(on){const el=$("loading");if(el)el.classList.toggle("hidden",!on);}
function configured(){return config.url.startsWith("https://")&&!config.key.includes("YOUR_");}
function setAuthMode(mode){authMode=mode;$("loginTab").classList.toggle("active",mode==="login");$("registerTab").classList.toggle("active",mode==="register");$("registerFields").classList.toggle("hidden",mode!=="register");$("authSubmit").textContent=mode==="login"?"Login":"Create account";$("authPassword").autocomplete=mode==="login"?"current-password":"new-password";authMsg("");}
function showApp(on){$("authScreen").classList.toggle("hidden",on);$("app").classList.toggle("hidden",!on);}
function page(name){document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+name));document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===name));const titles={dashboard:"Dashboard",products:"Products",customers:"Customers",sales:"New sale",monthly:"Monthly accounts",reports:"Reports",settings:"Settings"};$("pageTitle").textContent=titles[name]||"Dashboard";$("pageEyebrow").textContent=name.toUpperCase();if(name==="sales")renderSaleProducts();if(name==="monthly")renderLedger();if(name==="reports")applyReport();}
function go(name){page(name);}
function phoneValue(){let p=$("authPhone").value.trim().replace(/\s+/g,"");if(/^\d{10}$/.test(p))p="+91"+p;return p;}
async function init(){
  $("loginTab").addEventListener("click",()=>setAuthMode("login"));$("registerTab").addEventListener("click",()=>setAuthMode("register"));
  $("authForm").addEventListener("submit",authSubmit);
  document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>go(b.dataset.page)));
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
  $("logoutBtn").addEventListener("click",logout);
  $("showProductForm").addEventListener("click",()=>toggleForm("productForm",true));$("cancelProduct").addEventListener("click",resetProductForm);$("productForm").addEventListener("submit",saveProduct);
  $("showCustomerForm").addEventListener("click",()=>toggleForm("customerForm",true));$("cancelCustomer").addEventListener("click",resetCustomerForm);$("customerForm").addEventListener("submit",saveCustomer);
  $("productSearch").addEventListener("input",renderProducts);$("customerSearch").addEventListener("input",renderCustomers);
  $("saleProductSearch").addEventListener("input",renderSaleProducts);$("clearCart").addEventListener("click",()=>{cart=[];renderCart();});$("completeSale").addEventListener("click",completeSale);
  $("ledgerCustomer").addEventListener("change",renderLedger);$("saveLedger").addEventListener("click",saveLedger);
  $("applyReport").addEventListener("click",applyReport);$("downloadReport").addEventListener("click",()=>makePdf(reportSales,"Sales report"));$("downloadRegular").addEventListener("click",()=>makePdf(filterDates(sales.filter(s=>!!s.customer_id)),"Regular customer sales"));$("downloadWalkin").addEventListener("click",()=>makePdf(filterDates(sales.filter(s=>!s.customer_id)),"Walk-in sales"));
  $("profileForm").addEventListener("submit",saveProfile);
  if(!configured()){authMsg("Setup required: add your Supabase project URL and anon public key in script.js. Follow README.txt and supabase_setup.sql.");return;}
  db=window.supabase.createClient(config.url,config.key);
  const {data:{session:s}}=await db.auth.getSession();session=s;
  db.auth.onAuthStateChange((_event,s)=>{session=s;if(s)loadApp();else showApp(false);});
  if(session)await loadApp();
}
async function authSubmit(e){
 e.preventDefault();if(!configured()){authMsg("First complete Supabase setup. Open README.txt and follow the steps.");return;}
 const phone=phoneValue(),password=$("authPassword").value;if(!phone){authMsg("Enter a valid phone number with country code.");return;}
 loading(true);authMsg("");
 try{
  if(authMode==="register"){
   const {data,error}=await db.auth.signUp({phone,password,options:{data:{full_name:$("regName").value.trim(),business_name:$("regBusiness").value.trim()}}});if(error)throw error;
   if(data.session){session=data.session;await loadApp();}
   else authMsg("Account created. If Supabase asks for phone confirmation, disable phone confirmation in Supabase Auth settings and try again. No OTP is used by this app.");
  }else{const {data,error}=await db.auth.signInWithPassword({phone,password});if(error)throw error;session=data.session;await loadApp();}
 }catch(err){authMsg(err.message||"Login failed.");}finally{loading(false);}
}
async function logout(){await db.auth.signOut();session=null;showApp(false);cart=[];}
async function loadApp(){
 if(!session)return;loading(true);msg("");
 try{
  const uid=session.user.id;
  const [pr,po,cu,sa,le]=await Promise.all([
   db.from("profiles").select("*").eq("user_id",uid).maybeSingle(),
   db.from("products").select("*").order("name"),
   db.from("customers").select("*").order("name"),
   db.from("sales").select("*,sale_items(*)").order("created_at",{ascending:false}),
   db.from("ledger_entries").select("*").order("entry_date",{ascending:false})
  ]);
  for(const r of [pr,po,cu,sa,le])if(r.error)throw r.error;
  profile=pr.data||{user_id:uid,full_name:session.user.user_metadata?.full_name||"",business_name:session.user.user_metadata?.business_name||"",phone:session.user.phone||""};
  if(!pr.data){const ins=await db.from("profiles").upsert(profile);if(ins.error)throw ins.error;}
  products=po.data||[];customers=cu.data||[];sales=sa.data||[];ledger=le.data||[];
  showApp(true);fillProfile();refreshAll();go("dashboard");
 }catch(err){showApp(true);msg("Could not load cloud data: "+err.message,true);}finally{loading(false);}
}
function fillProfile(){const name=profile.full_name||"Business";const business=profile.business_name||"My business";$("sideBusiness").textContent=business;$("topBusiness").textContent=business;$("topPhone").textContent=profile.phone||session.user.phone||"";$("userInitial").textContent=(name[0]||"A").toUpperCase();$("welcomeTitle").textContent="Welcome, "+name;$("profileName").value=profile.full_name||"";$("profileBusiness").value=profile.business_name||"";$("profilePhone").value=profile.phone||session.user.phone||"";}
function refreshAll(){renderDashboard();renderProducts();renderCustomers();renderSaleProducts();fillCustomerSelects();renderCart();applyReport();}
function renderDashboard(){
 const d=today(),todays=sales.filter(s=>s.sale_date===d),sum=a=>a.reduce((t,s)=>t+Number(s.total||0),0);
 $("statToday").textContent=money(sum(todays));$("statTodayCount").textContent=todays.length+" transactions";$("statAll").textContent=money(sum(sales));$("statProducts").textContent=products.length;$("statCustomers").textContent=customers.length;
 $("recentSales").innerHTML=sales.length?table(["Date","Customer","Total"],sales.slice(0,8).map(s=>[esc(s.sale_date),esc(s.customer_name||"Walk-in"),money(s.total)])):'<div class="empty">No sales recorded yet.</div>';
 const low=products.filter(p=>Number(p.stock)<=5);$("lowStock").innerHTML=low.length?table(["Product","Stock left"],low.map(p=>[esc(p.name),`<b class="${Number(p.stock)===0?"status-bad":"status-good"}">${p.stock}</b>`])):'<div class="empty">No low-stock products.</div>';
}
function table(headers,rows){return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;}
function renderProducts(){const q=$("productSearch").value.toLowerCase();const list=products.filter(p=>p.name.toLowerCase().includes(q));$("productsTable").innerHTML=list.length?table(["Product","Price","Stock","Actions"],list.map(p=>[esc(p.name),money(p.price),p.stock,`<button class="action" data-edit-product="${p.id}">Edit</button><button class="action" data-delete-product="${p.id}">Delete</button>`])):'<div class="empty">No products found. Add your first product.</div>';document.querySelectorAll("[data-edit-product]").forEach(b=>b.onclick=()=>editProduct(b.dataset.editProduct));document.querySelectorAll("[data-delete-product]").forEach(b=>b.onclick=()=>deleteProduct(b.dataset.deleteProduct));}
function toggleForm(id,on){$(id).classList.toggle("hidden",!on);}
function resetProductForm(){$("productForm").reset();$("productId").value="";toggleForm("productForm",false);}
function editProduct(id){const p=products.find(x=>x.id===id);if(!p)return;$("productId").value=p.id;$("productName").value=p.name;$("productPrice").value=p.price;$("productStock").value=p.stock;toggleForm("productForm",true);}
async function saveProduct(e){e.preventDefault();const id=$("productId").value;const row={user_id:session.user.id,name:$("productName").value.trim(),price:Number($("productPrice").value),stock:Number($("productStock").value)};if(!row.name||row.price<0||row.stock<0||!Number.isInteger(row.stock)){msg("Enter a product name, valid price and whole-number stock.",true);return;}const res=id?await db.from("products").update(row).eq("id",id).select().single():await db.from("products").insert(row).select().single();if(res.error){msg(res.error.message,true);return;}if(id)products=products.map(p=>p.id===id?res.data:p);else products.push(res.data);resetProductForm();refreshAll();msg("Product saved.");}
async function deleteProduct(id){if(!confirm("Delete this product? Past sales will remain in reports."))return;const r=await db.from("products").delete().eq("id",id);if(r.error){msg(r.error.message,true);return;}products=products.filter(p=>p.id!==id);refreshAll();msg("Product deleted.");}
function resetCustomerForm(){$("customerForm").reset();$("customerId").value="";toggleForm("customerForm",false);}
function renderCustomers(){const q=$("customerSearch").value.toLowerCase();const list=customers.filter(c=>(c.name+" "+(c.phone||"")).toLowerCase().includes(q));$("customersTable").innerHTML=list.length?table(["Customer","Phone","Actions"],list.map(c=>[esc(c.name),esc(c.phone||"—"),`<button class="action" data-edit-customer="${c.id}">Edit</button><button class="action" data-delete-customer="${c.id}">Delete</button>`])):'<div class="empty">No customers found.</div>';document.querySelectorAll("[data-edit-customer]").forEach(b=>b.onclick=()=>editCustomer(b.dataset.editCustomer));document.querySelectorAll("[data-delete-customer]").forEach(b=>b.onclick=()=>deleteCustomer(b.dataset.deleteCustomer));}
function editCustomer(id){const c=customers.find(x=>x.id===id);if(!c)return;$("customerId").value=id;$("customerName").value=c.name;$("customerPhone").value=c.phone||"";$("customerNotes").value=c.notes||"";toggleForm("customerForm",true);}
async function saveCustomer(e){e.preventDefault();const id=$("customerId").value;const row={user_id:session.user.id,name:$("customerName").value.trim(),phone:$("customerPhone").value.trim(),notes:$("customerNotes").value.trim()};if(!row.name){msg("Enter customer name.",true);return;}const res=id?await db.from("customers").update(row).eq("id",id).select().single():await db.from("customers").insert(row).select().single();if(res.error){msg(res.error.message,true);return;}if(id)customers=customers.map(c=>c.id===id?res.data:c);else customers.push(res.data);resetCustomerForm();refreshAll();msg("Customer saved.");}
async function deleteCustomer(id){if(!confirm("Delete this customer? Existing sales will keep the saved customer name."))return;const r=await db.from("customers").delete().eq("id",id);if(r.error){msg(r.error.message,true);return;}customers=customers.filter(c=>c.id!==id);ledger=ledger.filter(x=>x.customer_id!==id);refreshAll();msg("Customer deleted.");}
function fillCustomerSelects(){const opts=customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");$("saleCustomer").innerHTML='<option value="">Walk-in customer</option>'+opts;$("ledgerCustomer").innerHTML='<option value="">Select customer</option>'+opts;}
function renderSaleProducts(){const q=$("saleProductSearch").value.toLowerCase();const list=products.filter(p=>p.name.toLowerCase().includes(q)&&Number(p.stock)>0);$("saleProductList").innerHTML=list.length?list.map(p=>`<div class="pick-item"><div><b>${esc(p.name)}</b><small>${money(p.price)} · ${p.stock} in stock</small></div><button data-add-product="${p.id}">Add</button></div>`).join(""):'<div class="empty">No available products. Add products or update stock.</div>';document.querySelectorAll("[data-add-product]").forEach(b=>b.onclick=()=>addToCart(b.dataset.addProduct));}
function addToCart(id){const p=products.find(x=>x.id===id);if(!p)return;const item=cart.find(x=>x.product_id===id);if(item){if(item.quantity>=p.stock){msg("Not enough stock.",true);return;}item.quantity++;}else cart.push({product_id:p.id,name:p.name,price:Number(p.price),quantity:1,stock:Number(p.stock)});renderCart();}
function renderCart(){$("cartItems").innerHTML=cart.length?cart.map(i=>`<div class="cart-row"><div><b>${esc(i.name)}</b><small>${money(i.price)} each</small></div><div class="qty-controls"><button data-minus="${i.product_id}">−</button><b>${i.quantity}</b><button data-plus="${i.product_id}">+</button></div><b>${money(i.price*i.quantity)}</b></div>`).join(""):'<div class="empty">Your cart is empty.</div>';$("cartTotal").textContent=money(cart.reduce((t,i)=>t+i.price*i.quantity,0));document.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>changeQty(b.dataset.minus,-1));document.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>changeQty(b.dataset.plus,1));}
function changeQty(id,delta){const i=cart.find(x=>x.product_id===id);if(!i)return;const next=i.quantity+delta;if(next<=0)cart=cart.filter(x=>x.product_id!==id);else if(next>i.stock){msg("Not enough stock.",true);return;}else i.quantity=next;renderCart();}
async function completeSale(){if(!cart.length){msg("Add at least one product to the cart.",true);return;}const customerId=$("saleCustomer").value||null;if($("addToMonthly").checked&&!customerId){msg("Choose a regular customer for a monthly-account sale.",true);return;}const payload={p_customer_id:customerId,p_customer_name:customerId?(customers.find(c=>c.id===customerId)?.name||"Customer"):"Walk-in",p_sale_date:today(),p_items:cart.map(i=>({product_id:i.product_id,product_name:i.name,price:i.price,quantity:i.quantity})),p_add_to_monthly:$("addToMonthly").checked};loading(true);try{const r=await db.rpc("create_sale",payload);if(r.error)throw r.error;cart=[];await loadApp();go("sales");msg("Sale saved and stock updated.");}catch(e){msg("Sale not saved: "+e.message,true);}finally{loading(false);}}
function renderLedger(){const id=$("ledgerCustomer").value;if(!id){$("ledgerSummary").textContent="Select a customer to view their account.";$("ledgerTable").innerHTML="";return;}const entries=ledger.filter(x=>x.customer_id===id);const purchases=entries.filter(x=>x.entry_type==="purchase").reduce((t,x)=>t+Number(x.amount),0);const payments=entries.filter(x=>x.entry_type==="payment").reduce((t,x)=>t+Number(x.amount),0);$("ledgerSummary").textContent=`Purchases: ${money(purchases)}   ·   Payments: ${money(payments)}   ·   Balance due: ${money(purchases-payments)}`;$("ledgerTable").innerHTML=entries.length?table(["Date","Type","Description","Amount"],entries.map(x=>[esc(x.entry_date),x.entry_type==="payment"?"Payment received":"Purchase / due",esc(x.description||"—"),money(x.amount)])):'<div class="empty">No monthly entries for this customer.</div>';}
async function saveLedger(){const customer_id=$("ledgerCustomer").value,amount=Number($("ledgerAmount").value),entry_type=$("ledgerType").value,entry_date=$("ledgerDate").value;if(!customer_id||!amount||amount<=0||!entry_date){msg("Choose a customer and enter a valid amount and date.",true);return;}const r=await db.from("ledger_entries").insert({user_id:session.user.id,customer_id,entry_type,amount,entry_date,description:$("ledgerDescription").value.trim()}).select().single();if(r.error){msg(r.error.message,true);return;}ledger.unshift(r.data);$("ledgerAmount").value="";$("ledgerDescription").value="";renderLedger();msg("Monthly account entry saved.");}
function filterDates(list){const from=$("reportFrom").value,to=$("reportTo").value;return list.filter(s=>(!from||s.sale_date>=from)&&(!to||s.sale_date<=to));}
function applyReport(){if(!$("reportsTable"))return;let list=filterDates(sales);const cat=$("reportCategory").value;if(cat==="regular")list=list.filter(s=>!!s.customer_id);if(cat==="walkin")list=list.filter(s=>!s.customer_id);reportSales=list;$("reportTotal").textContent="Total: "+money(list.reduce((t,s)=>t+Number(s.total||0),0));$("reportsTable").innerHTML=list.length?table(["Date","Customer","Items","Total"],list.map(s=>[esc(s.sale_date),esc(s.customer_name||"Walk-in"),(s.sale_items||[]).map(i=>`${esc(i.product_name)} × ${i.quantity}`).join(", "),money(s.total)])):'<div class="empty">No sales in this date range.</div>';}
function makePdf(list,title){if(!window.jspdf?.jsPDF){msg("PDF library did not load. Check your internet connection and reload.",true);return;}const {jsPDF}=window.jspdf;const doc=new jsPDF();doc.setFontSize(17);doc.text("Areev Sales Manager",14,16);doc.setFontSize(12);doc.text(title,14,25);doc.setFontSize(9);doc.text("Business: "+(profile.business_name||""),14,32);let y=42;const rows=[];list.forEach(s=>(s.sale_items||[]).forEach(i=>rows.push([s.sale_date,s.customer_name||"Walk-in",i.product_name,String(i.quantity),money(i.price),money(i.price*i.quantity)])));doc.setFontSize(8);const headers=["Date","Customer","Product","Qty","Price","Amount"];const widths=[25,35,48,14,30,32];let x=14;headers.forEach((h,j)=>{doc.text(h,x,y);x+=widths[j];});y+=7;doc.line(14,y-4,196,y-4);rows.forEach(row=>{if(y>280){doc.addPage();y=18;}x=14;row.forEach((v,j)=>{let val=String(v);if(j===2&&val.length>26)val=val.slice(0,24)+"…";doc.text(val,x,y);x+=widths[j];});y+=6;});if(!rows.length)doc.text("No records for this report.",14,y);y+=8;if(y>280){doc.addPage();y=18;}doc.setFontSize(10);doc.text("Total: "+money(list.reduce((t,s)=>t+Number(s.total||0),0)),14,y);doc.save(title.toLowerCase().replace(/[^a-z0-9]+/g,"_")+".pdf");}
async function saveProfile(e){e.preventDefault();const row={user_id:session.user.id,full_name:$("profileName").value.trim(),business_name:$("profileBusiness").value.trim(),phone:profile.phone||session.user.phone||""};const r=await db.from("profiles").upsert(row).select().single();if(r.error){msg(r.error.message,true);return;}profile=r.data;fillProfile();msg("Profile saved.");}
document.addEventListener("DOMContentLoaded",init);
})();
