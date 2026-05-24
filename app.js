const API = "http://localhost:5000";
let tasks = [], emails = [], buyersData = [], currentProduct = "";
let confirmCb = null;
let pipelineResult = null;

// ── UTILS ──
function toast(msg, type="info") {
  const el = document.getElementById("toast");
  el.textContent = msg; el.className = "toast show " + type;
  setTimeout(() => el.className = "toast", 3000);
}
function setDot(id, state) { document.getElementById(id).className = "dot " + state; }
function setBtn(loading) {
  const btn = document.getElementById("gen-btn");
  btn.disabled = loading;
  btn.innerHTML = loading ? '<span class="loader"></span>Generating…' : 'Generate Tasks';
}
function escHtml(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

// ── PAGE NAVIGATION ──
document.querySelectorAll(".nav-item[data-page]").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    item.classList.add("active");
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-" + item.dataset.page).classList.add("active");
    if (item.dataset.page === "buyers") loadBuyers();
    if (item.dataset.page === "activity") loadActivity();
    if (item.dataset.page === "settings") { checkHealth(); loadBuyers(); }
    if (item.dataset.page === "emails") renderEmailPage();
  });
});

// ── GENERATE TASKS ──
async function generateTasks() {
  const product = document.getElementById("product-input").value.trim();
  if (!product) { toast("Please describe your product first.", "error"); return; }
  currentProduct = product; setBtn(true); setDot("dot-ceo", "working");
  try {
    const res = await fetch(API + "/generate-tasks", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ product })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    tasks = data.tasks.map(t => ({...t, approved: false}));
    document.getElementById("stat-tasks").textContent = tasks.length;
    document.getElementById("task-count").textContent = tasks.length + " tasks";
    renderTasks(); setDot("dot-ceo", "done");
    toast("CEO built " + tasks.length + " tasks — review and approve", "success");
    refreshStats();
  } catch(err) { toast("Error: " + err.message, "error"); setDot("dot-ceo", "idle"); }
  setBtn(false);
}

// ── RENDER TASKS ──
function renderTasks() {
  const c = document.getElementById("task-list");
  if (!tasks.length) { c.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Enter a product brief and hit Generate Tasks</div></div>'; return; }

  // Pipeline Results summary card (shown once at top when results exist)
  let summaryHtml = '';
  if (pipelineResult) {
    const buyers = pipelineResult.buyers || [];
    const drafts = pipelineResult.emails || [];
    summaryHtml = '<div class="pipeline-summary">' +
      '<div class="ps-header" onclick="document.getElementById(\'ps-body\').classList.toggle(\'open\');this.querySelector(\'.chevron\').classList.toggle(\'open\')">' +
        '<span class="ps-title">📊 Pipeline Results</span>' +
        '<span class="ps-stats">' + buyers.length + ' buyers · ' + drafts.length + ' emails</span>' +
        '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</div>' +
      '<div class="ps-body" id="ps-body">';
    if (buyers.length) {
      summaryHtml += '<div class="ps-section"><div class="task-results-title">Buyers Found</div>';
      buyers.forEach(b => {
        summaryHtml += '<div class="task-result-row"><span class="tr-badge buyers">BUYER</span>' +
          '<span class="tr-value">' + escHtml(b.company || '?') + ' — ' + escHtml(b.contact_name || '') + ' (' + escHtml(b.email || '') + ')</span></div>';
      });
      summaryHtml += '</div>';
    }
    if (drafts.length) {
      summaryHtml += '<div class="ps-section"><div class="task-results-title">Emails Drafted</div>';
      drafts.forEach(em => {
        summaryHtml += '<div class="task-result-row"><span class="tr-badge emails">EMAIL</span>' +
          '<span class="tr-value"><strong>' + escHtml(em.buyer || '?') + '</strong> — ' + escHtml(em.subject || 'No subject') + '</span></div>';
      });
      summaryHtml += '</div>';
    }
    summaryHtml += '</div></div>';
  }

  // Individual task cards (clean — just show description + status)
  const tasksHtml = tasks.map((t, i) => {
    const pc = t.priority==="High"?"p-high":t.priority==="Med"?"p-med":"p-info";
    let statusNote = '';
    if (t.approved && pipelineResult) {
      if (t.agent === 'Sales') statusNote = '<div class="task-status-note green">✓ Found ' + (pipelineResult.buyers||[]).length + ' buyers</div>';
      else if (t.agent === 'Marketing') statusNote = '<div class="task-status-note green">✓ Drafted ' + (pipelineResult.emails||[]).length + ' emails</div>';
    } else if (t.approved && !pipelineResult) {
      statusNote = '<div class="task-status-note amber"><span class="loader"></span> Processing…</div>';
    }
    return '<div class="task-item'+(t.approved?" approved":"")+'" id="task-'+i+'">' +
      '<div class="task-header" onclick="toggleTask('+i+')">' +
        '<span class="priority '+pc+'">'+t.priority+'</span>' +
        '<span class="task-summary">'+escHtml(t.task)+'</span>' +
        '<span class="task-agent-tag">'+t.agent+'</span>' +
        '<svg class="chevron" id="chev-'+i+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>' +
        '<button class="approve-btn'+(t.approved?" done":"")+'" onclick="event.stopPropagation();approveTask('+i+')" '+(t.approved?"disabled":"")+'>'+(t.approved?"✓ Done":"Approve")+'</button>' +
      '</div>' +
      '<div class="task-body" id="tbody-'+i+'">' +
        '<div class="task-full-text">'+escHtml(t.task)+'</div>' +
        statusNote +
      '</div>' +
    '</div>';
  }).join('');

  c.innerHTML = summaryHtml + tasksHtml;
}
function toggleTask(i) {
  const b = document.getElementById("tbody-"+i), c = document.getElementById("chev-"+i);
  const open = b.classList.contains("open");
  b.className = "task-body" + (open?"":" open"); c.className = "chevron" + (open?"":" open");
}

// ── APPROVE ──
async function approveTask(i) { tasks[i].approved = true; renderTasks(); await runPipeline([tasks[i]]); }
async function approveAll() {
  if (!tasks.length) { toast("Generate tasks first.", "error"); return; }
  if (!tasks.filter(t=>!t.approved).length) { toast("All tasks already approved.", "info"); return; }
  tasks.forEach(t => t.approved = true); renderTasks(); await runPipeline(tasks);
}

// ── RUN PIPELINE ──
async function runPipeline(approvedTasks) {
  setDot("dot-sales", "working"); setDot("dot-mkt", "working");
  try {
    const res = await fetch(API + "/run-pipeline", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ product: currentProduct, approved_tasks: approvedTasks, send_emails: false })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    emails = []; data.emails.forEach(e => { e._status = "drafted"; emails.push(e); });
    pipelineResult = { buyers: data.buyers || [], emails: data.emails || [] };
    document.getElementById("stat-buyers").textContent = data.buyers_found;
    document.getElementById("stat-emails").textContent = data.emails_drafted;
    document.getElementById("email-count").textContent = emails.length + " emails";
    document.getElementById("nav-email-count").textContent = emails.length;
    renderTasks(); // re-render to show work output
    renderDashboardEmails();
    const sab = document.getElementById("send-all-btn");
    if (sab && emails.length) sab.disabled = false;
    const sab2 = document.getElementById("send-all-btn2");
    if (sab2 && emails.length) sab2.disabled = false;
    setDot("dot-sales", "done"); setDot("dot-mkt", "done");
    toast(data.buyers_found + " buyers · " + data.emails_drafted + " emails drafted", "success");
    refreshStats();
  } catch(err) {
    toast("Pipeline error: " + err.message, "error");
    setDot("dot-sales", "idle"); setDot("dot-mkt", "idle");
  }
}

// ── RENDER DASHBOARD EMAILS ──
function renderDashboardEmails() {
  const c = document.getElementById("email-list"); c.innerHTML = "";
  emails.forEach((e, i) => {
    const div = document.createElement("div"); div.className = "email-item"; div.id = "ecard-"+i;
    const statusClass = e._status==="sent"?"tag-sent":"tag-drafted";
    const statusText = e._status==="sent"?"SENT":"DRAFTED";
    div.innerHTML =
      '<div class="email-header" onclick="toggleEmail('+i+')">' +
        '<span class="email-company">'+(e.buyer||"Unknown")+'</span>' +
        '<span class="email-subject-preview">'+(e.subject||"")+'</span>' +
        '<span class="email-tag '+statusClass+'" id="etag-'+i+'">'+statusText+'</span>' +
        '<svg style="width:12px;height:12px;color:var(--text3);margin-left:8px;transition:transform 0.2s;flex-shrink:0" id="echev-'+i+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</div>' +
      '<div class="email-body" id="ebody-'+i+'">' +
        '<div class="email-field"><label>To</label><div class="field-val" id="eto-'+i+'">'+(e.to||"")+'</div></div>' +
        '<div class="email-field"><label>Subject</label><div class="field-val" id="esubject-'+i+'">'+(e.subject||"")+'</div></div>' +
        '<div class="email-field"><label>Body</label><div class="field-val" id="ebody-text-'+i+'" style="white-space:pre-wrap">'+(e.body||"")+'</div></div>' +
        '<div class="email-actions">' +
          '<button class="btn btn-accent" onclick="regenerateEmail('+i+')">🔄 Regenerate</button>' +
          '<button class="btn btn-edit" id="edit-btn-'+i+'" onclick="editEmail('+i+')">✏ Edit</button>' +
          '<button class="btn btn-send" id="send-btn-'+i+'" onclick="sendSingle('+i+')"'+(e._status==="sent"?' class="btn btn-send sent" disabled>✓ Sent':'>Send via Gmail')+'</button>' +
        '</div>' +
      '</div>';
    c.appendChild(div);
  });
}

function toggleEmail(i) {
  const b = document.getElementById("ebody-"+i), c = document.getElementById("echev-"+i);
  const open = b.classList.contains("open");
  b.className = "email-body" + (open?"":" open");
  c.style.transform = open ? "" : "rotate(90deg)";
}

// ── EDIT EMAIL ──
function editEmail(i) {
  const e = emails[i], btn = document.getElementById("edit-btn-"+i);
  if (btn.dataset.editing !== "true") {
    document.getElementById("esubject-"+i).innerHTML = '<input class="editable" id="einput-subject-'+i+'" value="'+escHtml(e.subject||"")+'">';
    document.getElementById("ebody-text-"+i).innerHTML = '<textarea class="editable" id="einput-body-'+i+'">'+escHtml(e.body||"")+'</textarea>';
    btn.innerHTML = "💾 Save"; btn.className = "btn btn-save"; btn.dataset.editing = "true";
  } else {
    emails[i].subject = document.getElementById("einput-subject-"+i).value;
    emails[i].body = document.getElementById("einput-body-"+i).value;
    document.getElementById("esubject-"+i).textContent = emails[i].subject;
    const bodyEl = document.getElementById("ebody-text-"+i);
    bodyEl.textContent = emails[i].body; bodyEl.style.whiteSpace = "pre-wrap";
    const hdr = document.querySelector("#ecard-"+i+" .email-subject-preview");
    if (hdr) hdr.textContent = emails[i].subject;
    btn.innerHTML = "✏ Edit"; btn.className = "btn btn-edit"; btn.dataset.editing = "false";
    toast("Email updated!", "success");
  }
}

// ── REGENERATE EMAIL ──
async function regenerateEmail(i) {
  const e = emails[i]; if (!currentProduct) { toast("No product set — generate tasks first", "error"); return; }
  toast("Regenerating email for " + (e.buyer||"buyer") + "…", "info");
  try {
    const res = await fetch(API + "/regenerate-email", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ product: currentProduct, buyer: { company: e.buyer, email: e.to, contact_name: e.buyer }, task: "Draft a personalized cold email" })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    emails[i].subject = data.email.subject; emails[i].body = data.email.body;
    renderDashboardEmails(); renderEmailPage();
    toast("Email regenerated!", "success");
  } catch(err) { toast("Regenerate failed: " + err.message, "error"); }
}

// ── SEND SINGLE ──
async function sendSingle(i) {
  const email = emails[i]; if (!email) return;
  const btn = document.getElementById("send-btn-"+i);
  const tag = document.getElementById("etag-"+i);
  btn.disabled = true; btn.innerHTML = '<span class="loader"></span>Sending…';
  try {
    const res = await fetch(API + "/send-emails", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ emails: [email] })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    emails[i]._status = "sent";
    btn.className = "btn btn-send sent"; btn.innerHTML = "✓ Sent";
    tag.className = "email-tag tag-sent"; tag.textContent = "SENT";
    const editBtn = document.getElementById("edit-btn-"+i);
    if (editBtn) editBtn.disabled = true;
    toast("Sent to " + (email.buyer||email.to), "success"); refreshStats();
  } catch(err) { btn.disabled = false; btn.innerHTML = "Send via Gmail"; toast("Failed: " + err.message, "error"); }
}

// ── SEND ALL ──
async function sendAllEmails() {
  const unsent = emails.filter(e => e._status !== "sent");
  if (!unsent.length) { toast("No unsent emails.", "info"); return; }
  const btn = document.getElementById("send-all-btn");
  const btn2 = document.getElementById("send-all-btn2");
  [btn,btn2].forEach(b => { if(b){b.disabled=true;b.innerHTML='<span class="loader"></span>Sending…';} });
  try {
    const res = await fetch(API + "/send-emails", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ emails: unsent })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    emails.forEach((e,i) => {
      if (e._status !== "sent") { e._status = "sent"; }
    });
    renderDashboardEmails();
    [btn,btn2].forEach(b => { if(b) b.innerHTML="✓ All Sent"; });
    toast(data.sent + " emails sent via Gmail!", "success"); refreshStats();
  } catch(err) {
    [btn,btn2].forEach(b => { if(b){b.disabled=false;b.innerHTML="Send All via Gmail";} });
    toast("Error: " + err.message, "error");
  }
}

// ── CLEAR ──
function clearAll() {
  tasks=[]; emails=[]; currentProduct="";
  ["stat-tasks","stat-buyers","stat-emails"].forEach(id=>document.getElementById(id).textContent="0");
  document.getElementById("task-count").textContent="0 tasks";
  document.getElementById("email-count").textContent="0 emails";
  document.getElementById("nav-email-count").textContent="0";
  document.getElementById("task-list").innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Enter a product brief and hit Generate Tasks</div></div>';
  document.getElementById("email-list").innerHTML='<div class="empty-state"><div class="empty-icon">📧</div><div class="empty-text">Approve tasks to generate and send cold emails</div></div>';
  document.getElementById("product-input").value="";
  const sab=document.getElementById("send-all-btn"); sab.disabled=true; sab.innerHTML="Send All via Gmail";
  ["dot-ceo","dot-sales","dot-mkt"].forEach(id=>setDot(id,"idle"));
}
function clearEmailLog() {
  emails=[];
  document.getElementById("stat-emails").textContent="0";
  document.getElementById("email-count").textContent="0 emails";
  document.getElementById("nav-email-count").textContent="0";
  document.getElementById("email-list").innerHTML='<div class="empty-state"><div class="empty-icon">📧</div><div class="empty-text">Approve tasks to generate and send cold emails</div></div>';
  const sab=document.getElementById("send-all-btn"); sab.disabled=true; sab.innerHTML="Send All via Gmail";
}

// ═══════════════════════════════════════════
// BUYERS PAGE
// ═══════════════════════════════════════════
async function loadBuyers() {
  try {
    const res = await fetch(API + "/buyers");
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    buyersData = data.buyers;
    document.getElementById("buyer-total").textContent = data.total;
    document.getElementById("nav-buyer-count").textContent = data.total;
    document.getElementById("csv-count").textContent = data.total;
    renderBuyerTable(buyersData);
  } catch(err) { toast("Could not load buyers: " + err.message, "error"); }
}

function renderBuyerTable(list) {
  const tb = document.getElementById("buyer-tbody");
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👤</div><div class="empty-text">No buyers found</div></div></td></tr>';
    return;
  }
  tb.innerHTML = list.map((b,i) =>
    '<tr id="brow-'+i+'">' +
      '<td>'+escHtml(b.contact_name||"—")+'</td>' +
      '<td>'+escHtml(b.contact_title||"—")+'</td>' +
      '<td class="td-company">'+escHtml(b.company||"—")+'</td>' +
      '<td>'+escHtml(b.industry||"—")+'</td>' +
      '<td class="td-email">'+escHtml(b.email||"—")+'</td>' +
      '<td><button class="btn btn-edit" onclick="editBuyerRow('+i+')">Edit</button> ' +
          '<button class="btn btn-danger" onclick="deleteBuyer(\''+escHtml(b.email||"")+'\')">Delete</button></td>' +
    '</tr>'
  ).join('');
}

function editBuyerRow(i) {
  const b = buyersData[i];
  if (!b) return;
  const row = document.getElementById("brow-"+i);
  if (!row) return;
  row.innerHTML =
    '<td><input class="search-input" style="width:100%;padding:5px 8px" id="be-name-'+i+'" value="'+escHtml(b.contact_name||"")+'"></td>' +
    '<td><input class="search-input" style="width:100%;padding:5px 8px" id="be-title-'+i+'" value="'+escHtml(b.contact_title||"")+'"></td>' +
    '<td><input class="search-input" style="width:100%;padding:5px 8px" id="be-company-'+i+'" value="'+escHtml(b.company||"")+'"></td>' +
    '<td><input class="search-input" style="width:100%;padding:5px 8px" id="be-industry-'+i+'" value="'+escHtml(b.industry||"")+'"></td>' +
    '<td><input class="search-input" style="width:100%;padding:5px 8px" id="be-email-'+i+'" value="'+escHtml(b.email||"")+'"></td>' +
    '<td><button class="btn btn-save" onclick="saveBuyerRow('+i+')">Save</button> ' +
        '<button class="btn btn-ghost" onclick="cancelEditBuyer()">Cancel</button></td>';
}

async function saveBuyerRow(i) {
  const b = buyersData[i];
  const payload = {
    old_email: b.email,
    contact_name: document.getElementById("be-name-"+i).value.trim(),
    contact_title: document.getElementById("be-title-"+i).value.trim(),
    company: document.getElementById("be-company-"+i).value.trim(),
    industry: document.getElementById("be-industry-"+i).value.trim(),
    email: document.getElementById("be-email-"+i).value.trim()
  };
  if (!payload.email) { toast("Email cannot be empty", "error"); return; }
  try {
    const res = await fetch(API + "/buyers/update", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    toast("Buyer updated!", "success");
    loadBuyers();
  } catch(err) { toast("Error: " + err.message, "error"); }
}

function cancelEditBuyer() { renderBuyerTable(buyersData); }

function filterBuyers() {
  const q = document.getElementById("buyer-search").value.toLowerCase();
  const filtered = buyersData.filter(b =>
    (b.contact_name||"").toLowerCase().includes(q) ||
    (b.company||"").toLowerCase().includes(q) ||
    (b.email||"").toLowerCase().includes(q)
  );
  renderBuyerTable(filtered);
}

function openAddBuyer() { document.getElementById("modal-overlay").classList.add("show"); }
function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById("modal-overlay").classList.remove("show");
  ["f-name","f-title","f-company","f-industry","f-email","f-phone","f-location"].forEach(id => document.getElementById(id).value = "");
}

async function addBuyer() {
  const email = document.getElementById("f-email").value.trim();
  if (!email) { toast("Email is required", "error"); return; }
  const payload = {
    contact_name: document.getElementById("f-name").value.trim(),
    contact_title: document.getElementById("f-title").value.trim(),
    company: document.getElementById("f-company").value.trim(),
    industry: document.getElementById("f-industry").value.trim(),
    email: email,
    phone: document.getElementById("f-phone").value.trim(),
    location: document.getElementById("f-location").value.trim()
  };
  try {
    const res = await fetch(API + "/buyers/add", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    closeModal(); toast("Buyer added!", "success"); loadBuyers();
  } catch(err) { toast("Error: " + err.message, "error"); }
}

async function deleteBuyer(email) {
  showConfirm("Delete Buyer?", "Remove this buyer from the database?", async (yes) => {
    if (!yes) return;
    try {
      const res = await fetch(API + "/buyers/delete", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast("Buyer deleted", "success"); loadBuyers();
    } catch(err) { toast("Error: " + err.message, "error"); }
  });
}

// ═══════════════════════════════════════════
// EMAIL PAGE
// ═══════════════════════════════════════════
let emailFilter = "all";
function filterEmails(filter, tab) {
  if (filter && tab) {
    emailFilter = filter;
    document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
  }
  renderEmailPage();
}

function renderEmailPage() {
  const c = document.getElementById("email-page-list");
  const q = (document.getElementById("email-search")||{}).value?.toLowerCase()||"";
  let list = emails.filter(e => {
    if (emailFilter === "drafted" && e._status !== "drafted") return false;
    if (emailFilter === "sent" && e._status !== "sent") return false;
    if (q && !(e.buyer||"").toLowerCase().includes(q) && !(e.subject||"").toLowerCase().includes(q)) return false;
    return true;
  });
  if (!list.length) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">📧</div><div class="empty-text">No emails match this filter</div></div>';
    return;
  }
  c.innerHTML = list.map((e,idx) => {
    const sc = e._status==="sent"?"tag-sent":"tag-drafted";
    const st = e._status==="sent"?"SENT":"DRAFTED";
    return '<div class="email-item"><div class="email-header" onclick="this.nextElementSibling.classList.toggle(\'open\')">' +
      '<span class="email-company">'+escHtml(e.buyer||"Unknown")+'</span>' +
      '<span class="email-subject-preview">'+escHtml(e.subject||"")+'</span>' +
      '<span class="email-tag '+sc+'">'+st+'</span></div>' +
      '<div class="email-body"><div class="email-field"><label>To</label><div class="field-val">'+escHtml(e.to||"")+'</div></div>' +
      '<div class="email-field"><label>Subject</label><div class="field-val">'+escHtml(e.subject||"")+'</div></div>' +
      '<div class="email-field"><label>Body</label><div class="field-val" style="white-space:pre-wrap">'+escHtml(e.body||"")+'</div></div></div></div>';
  }).join('');
}

// ═══════════════════════════════════════════
// ACTIVITY LOG
// ═══════════════════════════════════════════
async function loadActivity() {
  try {
    const res = await fetch(API + "/activity");
    const data = await res.json();
    if (!data.success) return;
    const c = document.getElementById("activity-list");
    if (!data.log.length) { c.innerHTML = '<div class="empty-state"><div class="empty-icon">📡</div><div class="empty-text">No activity yet</div></div>'; return; }
    c.innerHTML = data.log.reverse().map(l =>
      '<div class="log-entry">' +
        '<span class="log-time">'+l.timestamp+'</span>' +
        '<span class="log-agent '+l.agent.toLowerCase()+'">'+escHtml(l.agent)+'</span>' +
        '<span class="log-msg">'+escHtml(l.message)+'</span>' +
        '<span class="log-status '+l.status+'"></span>' +
      '</div>'
    ).join('');
  } catch(err) {}
}
function clearActivityUI() { document.getElementById("activity-list").innerHTML = '<div class="empty-state"><div class="empty-icon">📡</div><div class="empty-text">Cleared</div></div>'; }

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
async function checkHealth() {
  const el = document.getElementById("api-status");
  el.textContent = "Checking…"; el.className = "status-badge pending";
  try {
    const res = await fetch(API + "/health");
    const data = await res.json();
    el.textContent = data.status === "ok" ? "Connected" : "Error";
    el.className = "status-badge " + (data.status === "ok" ? "ok" : "err");
  } catch(e) { el.textContent = "Offline"; el.className = "status-badge err"; }
}

async function testGmail() {
  const el = document.getElementById("gmail-status");
  const acc = document.getElementById("gmail-account");
  el.textContent = "Testing…"; el.className = "status-badge pending";
  try {
    const res = await fetch(API + "/test-gmail");
    const data = await res.json();
    if (data.success) {
      el.textContent = "Connected"; el.className = "status-badge ok";
      acc.textContent = data.email || "—";
    } else { el.textContent = "Failed"; el.className = "status-badge err"; }
  } catch(e) { el.textContent = "Error"; el.className = "status-badge err"; }
}

// ═══════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════
async function refreshStats() {
  try {
    const res = await fetch(API + "/stats");
    const data = await res.json();
    if (!data.success) return;
    document.getElementById("sc-runs").textContent = data.runs;
    document.getElementById("sc-db").textContent = data.buyers_in_db;
    document.getElementById("sc-drafted").textContent = data.total_emails_drafted;
    document.getElementById("sc-sent").textContent = data.total_emails_sent;
  } catch(e) {}
}

// ═══════════════════════════════════════════
// CONFIRM DIALOG
// ═══════════════════════════════════════════
function showConfirm(title, msg, cb) {
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-msg").textContent = msg;
  document.getElementById("confirm-overlay").classList.add("show");
  confirmCb = cb;
}
function closeConfirm(result) {
  document.getElementById("confirm-overlay").classList.remove("show");
  if (confirmCb) confirmCb(result);
  confirmCb = null;
}

// ── KEYBOARD SHORTCUTS ──
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeModal(); closeConfirm(false); }
  if (e.ctrlKey && e.key === "Enter") { const page = document.querySelector(".page.active"); if (page.id === "page-dashboard") generateTasks(); }
});

// ═══════════════════════════════════════════
// RESIZABLE PANELS (VS Code style drag)
// ═══════════════════════════════════════════
(function initResize() {
  const handle = document.getElementById('resize-handle');
  const container = document.getElementById('panels-container');
  const panelL = document.getElementById('panel-tasks');
  const panelR = document.getElementById('panel-emails');
  if (!handle || !container || !panelL || !panelR) return;

  let dragging = false, startX = 0, startLW = 0, startRW = 0;

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startLW = panelL.getBoundingClientRect().width;
    startRW = panelR.getBoundingClientRect().width;
    handle.classList.add('dragging');
    document.body.classList.add('resizing');
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const totalW = startLW + startRW;
    let newLW = startLW + dx;
    let newRW = startRW - dx;
    const minW = 200;
    if (newLW < minW) { newLW = minW; newRW = totalW - minW; }
    if (newRW < minW) { newRW = minW; newLW = totalW - minW; }
    panelL.style.flex = 'none';
    panelR.style.flex = 'none';
    panelL.style.width = newLW + 'px';
    panelR.style.width = newRW + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.classList.remove('resizing');
  });
})();

// ── INIT ──
refreshStats();
