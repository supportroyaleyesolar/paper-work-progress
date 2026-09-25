/* ============================================================
   ROYAL EYE SOLAR — App Logic
   Data is stored on the server (persistent across refreshes).
   ============================================================ */

const STEPS_CONFIG = [
  { id: 'feasibility',          name: 'Feasibility',          icon: '🔍', note: 'First step — starts the clock' },
  { id: 'installation_process', name: 'Installation Process', icon: '🔧', note: '' },
  { id: 'anubhandham1',         name: 'Anubhandham 1',        icon: '📄', note: '' },
  { id: 'anubhandham2',         name: 'Anubhandham 2',        icon: '📄', note: '' },
  { id: 'anubhandham3',         name: 'Anubhandham 3',        icon: '📄', note: '' },
  { id: 'app_installation',     name: 'App Installation',     icon: '📱', note: 'Final step' },
];

const VALIDITY_DAYS    = 30;
const WARN_BEFORE_DAYS = 10;
const API_BASE         = '/api';

// ── STATE ──────────────────────────────────────────────────
let projects  = [];
let activeTab = 'all';

// ── API CALLS ─────────────────────────────────────────────
async function apiGet() {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error('Failed to load projects');
  return res.json();
}
async function apiPost(data) {
  const res = await fetch(`${API_BASE}/projects`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create project');
  return res.json();
}
async function apiPut(id, data) {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update project');
  return res.json();
}
async function apiDelete(id) {
  const res = await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete project');
  return res.json();
}

// ── UTILS ────────────────────────────────────────────────
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg, ms = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}
function setLoading(show) {
  const el = document.getElementById('loadingBar');
  if (el) el.style.display = show ? 'block' : 'none';
}

// ── DUE DATE LOGIC ───────────────────────────────────────
function getDueInfo(p) {
  if (!p.feasStartDate) return null;
  const today      = new Date(); today.setHours(0,0,0,0);
  const expiryDate = addDays(p.feasStartDate, VALIDITY_DAYS);
  expiryDate.setHours(0,0,0,0);
  const daysLeft   = Math.ceil((expiryDate - today) / 86400000);
  const isExpired  = daysLeft < 0;
  let urgency;
  if (isExpired)                        urgency = 'expired';
  else if (daysLeft <= 5)               urgency = 'critical';
  else if (daysLeft <= WARN_BEFORE_DAYS) urgency = 'warning';
  else                                   urgency = 'ok';
  const allDone = STEPS_CONFIG.every(cfg => p.steps[cfg.id] === 'completed');
  return { expiryDate, daysLeft, isExpired, urgency, allDone };
}

// ── OVERALL STATUS ────────────────────────────────────────
function overallStatus(p) {
  const info     = getDueInfo(p);
  const statuses = STEPS_CONFIG.map(cfg => p.steps[cfg.id] || 'pending');
  if (statuses.every(s => s === 'completed')) return 'done';
  if (info && info.isExpired)                 return 'expired';
  if (statuses.some(s => s === 'completed' || s === 'in-progress')) return 'in-progress';
  return 'not-started';
}
function doneCount(p) {
  return STEPS_CONFIG.filter(cfg => p.steps[cfg.id] === 'completed').length;
}
function pct(p) { return Math.round(doneCount(p) / STEPS_CONFIG.length * 100); }

// ── STATS ─────────────────────────────────────────────────
function updateStats() {
  const total    = projects.length;
  const done     = projects.filter(p => overallStatus(p) === 'done').length;
  const progress = projects.filter(p => overallStatus(p) === 'in-progress').length;
  const pending  = projects.filter(p => overallStatus(p) === 'not-started').length;
  const expiring = projects.filter(p => {
    const info = getDueInfo(p);
    return info && info.urgency !== 'ok' && !info.allDone;
  }).length;
  document.getElementById('statTotal').textContent    = total;
  document.getElementById('statDone').textContent     = done;
  document.getElementById('statProgress').textContent = progress;
  document.getElementById('statPending').textContent  = pending;
  document.getElementById('statExpiring').textContent = expiring;
  const badge = document.getElementById('pillBadge');
  if (expiring > 0) { badge.textContent = expiring; badge.style.display = 'inline-block'; }
  else badge.style.display = 'none';
}

// ── TAB SWITCHING ─────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.getElementById('tabAll').classList.toggle('active', tab === 'all');
  document.getElementById('tabDue').classList.toggle('active', tab === 'due');
  const duePanel = document.getElementById('duePanel');
  const controls = document.getElementById('controlsBar');
  const mainGrid = document.getElementById('mainGrid');
  if (tab === 'due') {
    duePanel.style.display = 'block';
    controls.style.display = 'none';
    mainGrid.style.display = 'none';
    renderDuePanel();
  } else {
    duePanel.style.display = 'none';
    controls.style.display = '';
    mainGrid.style.display = '';
    renderProjects();
  }
  updateStats();
}

// ── DUE DATES PANEL ──────────────────────────────────────
function renderDuePanel() {
  const list = document.getElementById('dueList');
  list.innerHTML = '';
  const withDate = projects
    .map(p => ({ p, info: getDueInfo(p) }))
    .filter(({ info }) => info !== null)
    .sort((a, b) => a.info.daysLeft - b.info.daysLeft);

  if (withDate.length === 0) {
    list.innerHTML = `<div style="padding:24px 0;color:#9ca3af;font-size:.88rem;">
      No feasibility start dates set yet. Add a project and enter the Feasibility Start Date.
    </div>`;
    return;
  }

  const notDoneAlert = withDate.filter(({ info }) => !info.allDone && info.urgency !== 'ok');
  if (notDoneAlert.length > 0) {
    const heading = document.createElement('div');
    heading.className = 'due-section-heading';
    heading.innerHTML = `<span class="due-heading-dot"></span>
      ${notDoneAlert.length} project${notDoneAlert.length !== 1 ? 's' : ''} need urgent attention — sorted nearest due date first`;
    list.appendChild(heading);
  }

  withDate.forEach(({ p, info }, idx) => {
    const isTopUrgent = idx === 0 && !info.allDone;
    const icon = info.isExpired ? '🚨' : info.urgency === 'critical' ? '🔴' : info.urgency === 'warning' ? '⚠️' : '✅';
    const card = document.createElement('div');
    const cardUrgency = (isTopUrgent && !info.allDone) ? 'urg-critical' : `urg-${info.urgency}`;
    card.className = `due-card ${cardUrgency}${isTopUrgent && !info.allDone ? ' due-card-top' : ''}`;

    let daysTxt;
    if (info.isExpired) {
      daysTxt = `<span class="days-chip chip-expired">🚨 EXPIRED — ${Math.abs(info.daysLeft)} day${Math.abs(info.daysLeft)!==1?'s':''} ago</span>`;
    } else {
      const chipCls = info.urgency==='critical' ? 'chip-critical' : info.urgency==='warning' ? 'chip-warning' : 'chip-ok';
      daysTxt = `<span class="days-chip ${chipCls}">${info.daysLeft} day${info.daysLeft!==1?'s':''} left</span>`;
    }

    const rankLabels = ['Most Urgent', '2nd', '3rd'];
    const rankBadge  = idx < 3 && !info.allDone
      ? `<span class="rank-badge rank-${idx}">${rankLabels[idx]}</span>` : '';

    const allDoneTxt = info.allDone
      ? `<div class="due-done-msg">✅ All steps completed!</div>`
      : `<div class="due-pending-msg">⚡ ${doneCount(p)}/${STEPS_CONFIG.length} steps done — must finish before expiry!</div>`;

    card.innerHTML = `
      <div class="due-card-icon">${icon}</div>
      <div class="due-card-body">
        <div class="due-card-name-row">
          <span class="due-card-name">${esc(p.name)}</span>
          ${rankBadge}
        </div>
        <div class="due-card-dates">
          📅 Start: <strong>${fmtDate(p.feasStartDate)}</strong>
          &nbsp;→&nbsp;
          🗓️ Expiry: <strong>${fmtDate(info.expiryDate.toISOString().split('T')[0])}</strong>
        </div>
        <div class="due-days-row">${daysTxt}</div>
        ${allDoneTxt}
        <div class="due-card-acts">
          <button class="btn-sm-red" onclick="openView('${p.id}')">View Details</button>
          <button class="btn-sm-out" onclick="openModal('${p.id}')">Edit</button>
        </div>
      </div>`;
    list.appendChild(card);
  });
}

// ── RENDER PROJECT CARDS ─────────────────────────────────
function renderProjects() {
  if (activeTab !== 'all') return;
  const q       = (document.getElementById('searchInput').value || '').toLowerCase();
  const fStatus = document.getElementById('filterStatus').value;

  const filtered = projects.filter(p => {
    const matchQ = p.name.toLowerCase().includes(q) || (p.mobile || '').includes(q);
    const st = overallStatus(p);
    const matchS = !fStatus
      || (fStatus === 'not-started' && st === 'not-started')
      || (fStatus === 'in-progress' && st === 'in-progress')
      || (fStatus === 'completed'   && st === 'done')
      || (fStatus === 'expired'     && st === 'expired');
    return matchQ && matchS;
  });

  const grid  = document.getElementById('cardsGrid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';

  if (filtered.length === 0) { empty.style.display = 'flex'; updateStats(); return; }
  empty.style.display = 'none';
  filtered.forEach(p => grid.appendChild(buildCard(p)));
  updateStats();
}

function buildCard(p) {
  const st   = overallStatus(p);
  const pc   = pct(p);
  const dc   = doneCount(p);
  const info = getDueInfo(p);

  const barCls   = { done:'bar-done','in-progress':'bar-progress','not-started':'bar-notstart',expired:'bar-expired' }[st];
  const badgeCls = { done:'badge-done','in-progress':'badge-progress','not-started':'badge-notstart',expired:'badge-expired' }[st];
  const badgeTxt = { done:'Completed','in-progress':'In Progress','not-started':'Not Started',expired:'Expired' }[st];
  const fillCls  = st==='done' ? 'pbar-fill-done' : st==='expired' ? 'pbar-fill-exp' : '';

  let bannerHtml = '';
  if (info) {
    const dlCls = { expired:'dl-expired',critical:'dl-critical',warning:'dl-warning',ok:'dl-ok' }[info.urgency];
    let dlText, dlDays;
    if (info.isExpired) {
      dlText = `Feasibility EXPIRED`;
      dlDays = `<span class="deadline-days days-expired">-${Math.abs(info.daysLeft)}d</span>`;
    } else {
      dlText = `Due: ${fmtDate(info.expiryDate.toISOString().split('T')[0])}`;
      dlDays = `<span class="deadline-days days-${info.urgency}">${info.daysLeft}d left</span>`;
    }
    const prefix = info.isExpired ? '🚨' : info.urgency==='critical' ? '🔴' : info.urgency==='warning' ? '⚠️' : '📅';
    bannerHtml = `<div class="deadline-banner ${dlCls}">
      <div class="deadline-left">${prefix} ${dlText}</div>
      ${dlDays}
    </div>`;
  }

  const nodesHtml = STEPS_CONFIG.map((cfg, i) => {
    const s   = p.steps[cfg.id] || 'pending';
    const cls = s==='completed' ? 'sc-done' : s==='in-progress' ? 'sc-progress' : 'sc-pending';
    const ico = s==='completed'
      ? '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
      : s==='in-progress'
      ? '<svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>'
      : (i+1);
    const short = ['Feasibility','Install','Anub 1','Anub 2','Anub 3','App'][i];
    return `<div class="step-node">
      <div class="step-circle ${cls}">${ico}</div>
      <div class="step-lbl">${short}</div>
    </div>`;
  }).join('');

  const card = document.createElement('div');
  card.className = 'p-card';
  card.id = 'card-' + p.id;
  card.innerHTML = `
    <div class="p-card-bar ${barCls}"></div>
    <div class="p-card-body">
      <div class="p-card-top">
        <div class="p-card-name">${esc(p.name)}</div>
        <span class="badge ${badgeCls}">${badgeTxt}</span>
      </div>
      <div class="p-card-meta">
        ${p.mobile   ? `<span>📞 ${esc(p.mobile)}</span>`   : ''}
        ${p.capacity ? `<span>⚡ ${esc(p.capacity)}</span>` : ''}
        ${p.address  ? `<span>📍 ${esc(p.address)}</span>`  : ''}
      </div>
      ${bannerHtml}
      <div class="steps-track">${nodesHtml}</div>
      <div class="pbar-row"><span>Progress</span><span>${dc}/${STEPS_CONFIG.length} steps</span></div>
      <div class="pbar-bg"><div class="pbar-fill ${fillCls}" style="width:${pc}%"></div></div>
      <div class="p-card-acts">
        <button class="btn-view" onclick="openView('${p.id}')">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          View Details
        </button>
        <button class="btn-edit" onclick="openModal('${p.id}')">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        <button class="btn-del" onclick="deleteProject('${p.id}')">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>`;
  return card;
}

// ── ADD / EDIT MODAL ─────────────────────────────────────
function openModal(id) {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modalTitle').textContent = id ? 'Edit Project' : 'Add New Project';
  const p = id ? projects.find(x => x.id === id) : null;

  document.getElementById('editId').value       = id || '';
  document.getElementById('custName').value     = p ? p.name : '';
  document.getElementById('custMobile').value   = p ? (p.mobile    || '') : '';
  document.getElementById('custAddress').value  = p ? (p.address   || '') : '';
  document.getElementById('custCapacity').value = p ? (p.capacity  || '') : '';
  document.getElementById('feasStartDate').value= p ? (p.feasStartDate || '') : '';
  document.getElementById('projectNotes').value = p ? (p.notes || '') : '';
  updateDueDatePreview();

  const list = document.getElementById('stepsFormList');
  list.innerHTML = '';
  STEPS_CONFIG.forEach((cfg, i) => {
    const cur = p ? (p.steps[cfg.id] || 'pending') : 'pending';
    const selCls = cur==='completed' ? 'sel-completed' : cur==='in-progress' ? 'sel-progress' : 'sel-pending';
    const row = document.createElement('div');
    row.className = 'step-row';
    row.innerHTML = `
      <div class="step-num-badge">${i+1}</div>
      <div class="step-row-name">
        ${cfg.icon} ${cfg.name}
        ${cfg.note ? `<span class="step-row-note">${cfg.note}</span>` : ''}
      </div>
      <select id="ss_${cfg.id}" class="step-status-sel ${selCls}" onchange="updateStepSelColor(this)">
        <option value="pending"     ${cur==='pending'     ?'selected':''}>⏳ Pending</option>
        <option value="in-progress" ${cur==='in-progress' ?'selected':''}>🔄 In Progress</option>
        <option value="completed"   ${cur==='completed'   ?'selected':''}>✅ Completed</option>
      </select>`;
    list.appendChild(row);
  });
}

function updateStepSelColor(sel) {
  sel.classList.remove('sel-pending','sel-progress','sel-completed');
  if (sel.value === 'completed')   sel.classList.add('sel-completed');
  else if (sel.value==='in-progress') sel.classList.add('sel-progress');
  else sel.classList.add('sel-pending');
}
function updateDueDatePreview() {
  const start = document.getElementById('feasStartDate').value;
  const prev  = document.getElementById('expiryPreview');
  if (!start) { prev.textContent = '— select start date —'; prev.style.color='#9ca3af'; return; }
  const exp = addDays(start, VALIDITY_DAYS);
  prev.textContent = fmtDate(exp.toISOString().split('T')[0]);
  prev.style.color = '#dc2626';
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

async function saveProject() {
  const id   = document.getElementById('editId').value;
  const name = document.getElementById('custName').value.trim();
  if (!name) { toast('⚠️ Customer name is required!'); return; }
  const startDate = document.getElementById('feasStartDate').value;
  if (!startDate) { toast('⚠️ Feasibility Start Date is required!'); return; }

  const steps = {};
  STEPS_CONFIG.forEach(cfg => { steps[cfg.id] = document.getElementById(`ss_${cfg.id}`).value; });

  const payload = {
    name,
    mobile:        document.getElementById('custMobile').value.trim(),
    address:       document.getElementById('custAddress').value.trim(),
    capacity:      document.getElementById('custCapacity').value.trim(),
    feasStartDate: startDate,
    notes:         document.getElementById('projectNotes').value.trim(),
    steps,
  };

  // Disable save button
  const saveBtn = document.querySelector('.btn-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    if (id) {
      const updated = await apiPut(id, payload);
      const idx = projects.findIndex(x => x.id === id);
      if (idx !== -1) projects[idx] = updated;
      toast('✅ Project updated!');
    } else {
      const created = await apiPost(payload);
      projects.unshift(created);
      toast('🎉 Project added!');
    }
    closeModal();
    renderProjects();

    // Post-save expiry alert
    const info = getDueInfo(payload);
    if (info && info.urgency !== 'ok' && !info.allDone) {
      setTimeout(() => {
        const msg = info.isExpired
          ? `🚨 ${name}: Feasibility EXPIRED ${Math.abs(info.daysLeft)} day(s) ago!`
          : `⚠️ ${name}: Feasibility expires in ${info.daysLeft} day(s)!`;
        toast(msg, 4500);
      }, 1200);
    }
  } catch (e) {
    toast('❌ Error saving: ' + e.message, 4000);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> Save Project`;
  }
}

// ── DELETE ───────────────────────────────────────────────
async function deleteProject(id) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  try {
    await apiDelete(id);
    projects = projects.filter(p => p.id !== id);
    renderProjects();
    toast('🗑️ Project deleted.');
  } catch (e) {
    toast('❌ Error deleting: ' + e.message, 3500);
  }
}

// ── VIEW MODAL ───────────────────────────────────────────
function openView(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  document.getElementById('viewOverlay').classList.add('open');
  document.getElementById('viewTitle').textContent = p.name;
  document.getElementById('viewEditBtn').onclick   = () => { closeView(); openModal(id); };

  const st   = overallStatus(p);
  const pc   = pct(p);
  const dc   = doneCount(p);
  const info = getDueInfo(p);

  let dlHtml = '';
  if (info) {
    const dlsCls = { expired:'dls-expired',critical:'dls-critical',warning:'dls-warning',ok:'dls-ok' }[info.urgency];
    const statusText = info.isExpired
      ? `🚨 EXPIRED — ${Math.abs(info.daysLeft)} day(s) ago`
      : `${info.daysLeft} day${info.daysLeft!==1?'s':''} remaining`;
    dlHtml = `
      <div class="dl-summary ${dlsCls}">
        <div class="dl-summary-title">📅 Feasibility Deadline Tracker</div>
        <div class="dl-summary-grid">
          <div><label>Start Date</label><span>${fmtDate(p.feasStartDate)}</span></div>
          <div><label>Expiry Date</label><span>${fmtDate(info.expiryDate.toISOString().split('T')[0])}</span></div>
          <div><label>Validity Status</label><span>${statusText}</span></div>
        </div>
        <div style="margin-top:10px;font-size:.8rem;font-weight:600;">
          ${info.allDone
            ? '✅ All 6 steps completed — process done!'
            : `⚡ ${dc}/${STEPS_CONFIG.length} steps done — complete all before expiry!`}
        </div>
      </div>`;
  }

  const fillCls   = st==='done' ? 'pbar-fill-done' : st==='expired' ? 'pbar-fill-exp' : '';
  const stepsHtml = STEPS_CONFIG.map((cfg, i) => {
    const s      = p.steps[cfg.id] || 'pending';
    const icoCls = s==='completed' ? 'vs-done' : s==='in-progress' ? 'vs-progress' : 'vs-pending';
    const badCls = s==='completed' ? 'vsb-done' : s==='in-progress' ? 'vsb-progress' : 'vsb-pending';
    const badTxt = s==='completed' ? '✅ Completed' : s==='in-progress' ? '🔄 In Progress' : '⏳ Pending';
    const ico    = s==='completed'
      ? '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
      : s==='in-progress'
      ? '<svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>'
      : (i+1);
    return `<div class="vs-card">
      <div class="vs-header">
        <div class="vs-icon ${icoCls}">${ico}</div>
        <div class="vs-name">${cfg.icon} ${cfg.name}</div>
        <span class="vs-badge ${badCls}">${badTxt}</span>
      </div>
    </div>`;
  }).join('');

  document.getElementById('viewBody').innerHTML = `
    <div class="view-info-grid">
      <div class="vinfo-item"><label>Customer</label><span>${esc(p.name)}</span></div>
      <div class="vinfo-item"><label>Mobile</label><span>${esc(p.mobile||'—')}</span></div>
      <div class="vinfo-item"><label>Capacity</label><span>${esc(p.capacity||'—')}</span></div>
      <div class="vinfo-item"><label>Address</label><span>${esc(p.address||'—')}</span></div>
      <div class="vinfo-item"><label>Feasibility Start</label><span>${fmtDate(p.feasStartDate)}</span></div>
      <div class="vinfo-item"><label>Expiry Date</label><span>${info ? fmtDate(info.expiryDate.toISOString().split('T')[0]) : '—'}</span></div>
    </div>
    ${p.notes ? `<div class="notes-box"><strong>📋 Notes</strong>${esc(p.notes)}</div>` : ''}
    ${dlHtml}
    <div class="pbar-row" style="margin-bottom:5px;"><span><strong>Overall Progress</strong></span><span>${dc}/${STEPS_CONFIG.length} (${pc}%)</span></div>
    <div class="pbar-bg" style="margin-bottom:16px;"><div class="pbar-fill ${fillCls}" style="width:${pc}%"></div></div>
    <div class="section-label">Process Steps</div>
    <div class="view-steps">${stepsHtml}</div>
  `;
}
function closeView() { document.getElementById('viewOverlay').classList.remove('open'); }
function overlayClose(e, overlayId, closeFn) {
  if (e.target.id === overlayId) closeFn();
}

// ── KEYBOARD ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeView(); }
});

// ── INIT — Load from server ───────────────────────────────
async function init() {
  setLoading(true);
  try {
    projects = await apiGet();
    renderProjects();
    updateStats();
    // Startup alert
    const alerts = projects.filter(p => {
      const info = getDueInfo(p);
      return info && info.urgency !== 'ok' && !info.allDone;
    });
    if (alerts.length > 0) {
      setTimeout(() => toast(`⚠️ ${alerts.length} project(s) have feasibility expiring soon!`, 4000), 700);
    }
  } catch (e) {
    toast('❌ Could not connect to server. Check your connection.', 5000);
    console.error(e);
  } finally {
    setLoading(false);
  }
}

init();
