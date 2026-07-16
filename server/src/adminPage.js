// The Zapp admin panel — a single self-contained page served at /admin.
// All data comes from /api/admin/* using the key the admin enters (kept in
// localStorage, sent as the x-admin-key header).
export const ADMIN_PAGE = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zapp Admin</title><style>
:root{--bg:#0F1115;--surface:#181B22;--border:#262B35;--text:#F2F3F5;--muted:#8A919E;--yellow:#FFD11E;--danger:#FF5A5F;--green:#2ecc71}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--text)}
.wrap{max-width:1080px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0}h1 .bolt{color:var(--yellow)}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
button{cursor:pointer;border:0;border-radius:10px;padding:9px 16px;font-weight:700;font-size:14px}
.btn-y{background:var(--yellow);color:#15171C}.btn-ghost{background:var(--surface);color:var(--text);border:1px solid var(--border)}
.btn-danger{background:transparent;color:var(--danger);border:1px solid var(--danger)}
.btn-sm{padding:5px 10px;font-size:12px;border-radius:8px}
input{background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:10px;padding:10px 14px;font-size:15px;outline:none;width:100%}
input:focus{border-color:var(--yellow)}
.tabs{display:flex;gap:8px;margin:18px 0}
.tab{padding:8px 18px;border-radius:999px;background:var(--surface);border:1px solid var(--border);color:var(--muted);font-weight:600;cursor:pointer}
.tab.active{background:var(--yellow);color:#15171C;border-color:var(--yellow)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px}
.card .n{font-size:28px;font-weight:800}.card .l{color:var(--muted);font-size:13px;margin-top:4px}
.card.hl .n{color:var(--yellow)}.card.gr .n{color:var(--green)}
table{width:100%;border-collapse:collapse;margin-top:14px;background:var(--surface);border-radius:14px;overflow:hidden}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);font-size:14px}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px}
tr:last-child td{border-bottom:0}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700}
.pill.b{background:rgba(255,90,95,.15);color:var(--danger)}.pill.ok{background:rgba(46,204,113,.15);color:var(--green)}
.muted{color:var(--muted)}.sys{margin-top:18px;color:var(--muted);font-size:13px}
#login{max-width:380px;margin:14vh auto 0;text-align:center}
#login .logo{font-size:44px}#login h2{margin:10px 0 22px}
#login button{width:100%;margin-top:12px;padding:12px}
.err{color:var(--danger);margin-top:10px;min-height:18px;font-size:14px}
.rowactions{display:flex;gap:6px;justify-content:flex-end}
.searchbar{display:flex;gap:10px;margin-top:14px}
@media(max-width:640px){th:nth-child(5),td:nth-child(5){display:none}}
</style></head><body>

<div id="login">
  <div class="logo">⚡</div>
  <h2>Zapp <span style="color:var(--yellow)">Admin</span></h2>
  <input id="key" type="password" placeholder="Admin key" autocomplete="current-password">
  <button class="btn-y" onclick="login()">Sign in</button>
  <div class="err" id="loginErr"></div>
</div>

<div class="wrap" id="panel" style="display:none">
  <div class="top">
    <h1>⚡ Zapp <span class="bolt">Admin</span></h1>
    <button class="btn-ghost" onclick="logout()">Log out</button>
  </div>
  <div class="tabs">
    <div class="tab active" data-tab="overview" onclick="show('overview')">Overview</div>
    <div class="tab" data-tab="users" onclick="show('users')">Users</div>
    <div class="tab" data-tab="reports" onclick="show('reports')">Reports</div>
  </div>

  <div id="tab-overview">
    <div class="cards" id="cards"></div>
    <div class="sys" id="sys"></div>
  </div>

  <div id="tab-users" style="display:none">
    <div class="searchbar">
      <input id="q" placeholder="Search by name or phone…" oninput="debouncedUsers()">
    </div>
    <table><thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Status</th><th>Msgs</th><th>Reports</th><th></th></tr></thead>
    <tbody id="usersBody"></tbody></table>
  </div>

  <div id="tab-reports" style="display:none">
    <table><thead><tr><th>ID</th><th>Reporter</th><th>Reported</th><th>Reason</th><th>When</th><th></th></tr></thead>
    <tbody id="reportsBody"></tbody></table>
  </div>
</div>

<script>
let KEY = localStorage.getItem("zapp.adminKey") || "";
const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const res = await fetch("/api/admin" + path, {
    ...opts,
    headers: { "x-admin-key": KEY, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 401) { logout(); throw new Error("invalid key"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}

async function login() {
  KEY = $("key").value.trim();
  $("loginErr").textContent = "";
  try {
    await api("/stats");
    localStorage.setItem("zapp.adminKey", KEY);
    $("login").style.display = "none";
    $("panel").style.display = "block";
    loadOverview(); loadUsers(); loadReports();
  } catch (e) {
    $("loginErr").textContent = e.message === "invalid key" ? "Wrong admin key." : e.message;
  }
}
function logout() {
  localStorage.removeItem("zapp.adminKey"); KEY = "";
  $("panel").style.display = "none"; $("login").style.display = "block";
}
function show(tab) {
  for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.tab === tab);
  for (const name of ["overview","users","reports"]) $("tab-" + name).style.display = name === tab ? "block" : "none";
  if (tab === "overview") loadOverview();
  if (tab === "users") loadUsers();
  if (tab === "reports") loadReports();
}

function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

async function loadOverview() {
  try {
    const s = await api("/stats");
    const card = (n, l, cls="") => '<div class="card '+cls+'"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>';
    $("cards").innerHTML =
      card(s.online, "Online now", "gr") +
      card(s.users, "Users", "hl") +
      card(s.messages, "Messages") +
      card(s.conversations, "Conversations") +
      card(s.calls, "Calls") +
      card(s.reports, "Reports") +
      card(s.blocks, "Blocks") +
      card(s.banned, "Banned");
    const up = Math.floor(s.uptimeSec/3600) + "h " + Math.floor((s.uptimeSec%3600)/60) + "m";
    $("sys").textContent = "Server " + s.revision + " · Node " + s.node + " · up " + up;
  } catch (e) { /* ignore */ }
}

let usersTimer;
function debouncedUsers(){ clearTimeout(usersTimer); usersTimer = setTimeout(loadUsers, 300); }

async function loadUsers() {
  try {
    const q = encodeURIComponent(($("q").value || "").trim());
    const { users } = await api("/users?q=" + q);
    $("usersBody").innerHTML = users.map(u =>
      "<tr><td>"+u.id+"</td><td>"+esc(u.name||"—")+"</td><td>"+esc(u.phone)+"</td>"+
      "<td>"+(u.banned?'<span class="pill b">banned</span>':'<span class="pill ok">active</span>')+"</td>"+
      "<td>"+u.messages+"</td><td>"+u.reports+"</td>"+
      '<td><div class="rowactions">'+
      '<button class="btn-ghost btn-sm" onclick="toggleBan('+u.id+','+(u.banned?0:1)+')">'+(u.banned?"Unban":"Ban")+"</button>"+
      '<button class="btn-danger btn-sm" onclick="delUser('+u.id+',\\''+esc(u.name||u.phone)+'\\')">Delete</button>'+
      "</div></td></tr>"
    ).join("") || '<tr><td colspan="7" class="muted">No users.</td></tr>';
  } catch (e) { /* ignore */ }
}

async function toggleBan(id, ban) {
  if (ban && !confirm("Ban this user? They will not be able to log in.")) return;
  await api("/users/" + id + "/ban", { method: ban ? "POST" : "DELETE" });
  loadUsers(); loadOverview();
}
async function delUser(id, name) {
  if (!confirm("PERMANENTLY delete " + name + "? All their messages, calls and data are removed. This cannot be undone.")) return;
  await api("/users/" + id, { method: "DELETE" });
  loadUsers(); loadOverview();
}

async function loadReports() {
  try {
    const { reports } = await api("/reports");
    $("reportsBody").innerHTML = reports.map(r =>
      "<tr><td>"+r.id+"</td><td>"+esc(r.reporter.name)+"</td><td>"+esc(r.reported.name)+"</td>"+
      "<td>"+esc(r.reason||"—")+"</td><td class=\\"muted\\">"+esc(r.createdAt)+"</td>"+
      '<td><div class="rowactions"><button class="btn-ghost btn-sm" onclick="delReport('+r.id+')">Dismiss</button></div></td></tr>'
    ).join("") || '<tr><td colspan="6" class="muted">No reports. 🎉</td></tr>';
  } catch (e) { /* ignore */ }
}
async function delReport(id) { await api("/reports/" + id, { method: "DELETE" }); loadReports(); loadOverview(); }

// Auto-login if a key is saved; refresh overview periodically.
if (KEY) login();
setInterval(() => { if (KEY && $("panel").style.display !== "none") loadOverview(); }, 15000);
</script></body></html>`;
