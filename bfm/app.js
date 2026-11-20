const state = {
  data: null,
  suiteId: "lafan-g1-29dof",
  sortBy: "mpjpe_xy_aligned_mm",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

async function init() {
  const res = await fetch("data/bfm_data.json");
  if (!res.ok) throw new Error("Failed to load data/bfm_data.json");
  state.data = await res.json();
  state.suiteId = state.data.suites[0].id;

  bindEvents();
  setupScrollSpy();
  renderSetting();
  renderSuiteChips();
  renderRanking();
  renderAlignmentTable();
  renderSuitesTable();
  renderNews();
}

function currentSuite() {
  return state.data.suites.find((s) => s.id === state.suiteId) || state.data.suites[0];
}

function bindEvents() {
  document.getElementById("bfm-sort-chips").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.sortBy = btn.dataset.sort;
    document.querySelectorAll("#bfm-sort-chips .chip").forEach((b) => b.classList.toggle("active", b === btn));
    renderRanking();
  });
}

function setupScrollSpy() {
  const links = [...document.querySelectorAll("#toc-list a")];
  const sections = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = `#${entry.target.id}`;
          links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === id));
        }
      }
    },
    { rootMargin: "-20% 0px -65% 0px", threshold: 0.01 }
  );
  sections.forEach((s) => io.observe(s));
}

function renderSetting() {
  const d = state.data;
  document.getElementById("bfm-desc").textContent = d.description;
  document.getElementById("bfm-scoring").textContent = d.scoring_summary;
  document.getElementById("bfm-meta").innerHTML = `
    <div><div class="meta-item-k">Physics Engine</div><div class="meta-item-v">${esc(d.engine)}</div></div>
    <div><div class="meta-item-k">Timestep &amp; Friction</div><div class="meta-item-v">${d.physics_dt_ms} ms · friction ${d.friction.toFixed(1)}</div></div>
    <div><div class="meta-item-k">Primary Metric</div><div class="meta-item-v">XY-Aligned MPBPE (mm ↓)</div></div>
    <div><div class="meta-item-k">Verification</div><div class="meta-item-v mono">motionchallenge-verify</div></div>
  `;
}

function renderSuiteChips() {
  const el = document.getElementById("bfm-suite-chips");
  el.innerHTML = state.data.suites
    .map((s) => `<button class="chip ${s.id === state.suiteId ? "active" : ""}" data-suite="${esc(s.id)}">${esc(s.name)}</button>`)
    .join("");
  el.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.suiteId = btn.dataset.suite;
      el.querySelectorAll(".chip").forEach((b) => b.classList.toggle("active", b === btn));
      renderRanking();
    });
  });
}

function renderRanking() {
  const suite = currentSuite();
  document.getElementById("bfm-rank-heading").textContent = `Overall Ranking · ${suite.name}`;
  document.getElementById("bfm-rank-sub").textContent =
    `Robot: ${suite.robot} · Clips: ${suite.clips} (${suite.source_fps} FPS) · Physics dt: ${suite.physics_dt} · Adapters: ${suite.policies_supported}`;

  const hl = (k) => (state.sortBy === k ? "col-hl" : "");
  const thead = `
    <thead>
      <tr>
        <th style="width:60px;">Rank</th>
        <th class="left">Policy</th>
        <th class="${hl("mpjpe_xy_aligned_mm")}">MPBPE · XY (mm ↓)</th>
        <th class="${hl("mpjpe_xy_yaw_aligned_mm")}">MPBPE · XY+Yaw (mm ↓)</th>
        <th class="${hl("mpjpe_world_mm")}">MPBPE · World (mm ↓)</th>
        <th class="${hl("success_rate")}">Success Rate (↑)</th>
        <th>Added</th>
      </tr>
    </thead>
  `;

  const rows = [...(suite.leaderboard || [])];
  if (!rows.length) {
    document.getElementById("bfm-rank-table").innerHTML = `
      ${thead}
      <tbody>
        <tr>
          <td colspan="7" class="empty-msg">
            No verified full-suite results imported yet for <strong>${esc(suite.id)}</strong>.<br />
            Run <code>bfm-benchmark</code> and verify via <code>motionchallenge-verify</code>, then import <code>result.json</code> into <code>bfm/data/bfm_data.json</code>.
          </td>
        </tr>
      </tbody>
    `;
    return;
  }

  rows.sort((a, b) =>
    state.sortBy === "success_rate"
      ? (b.success_rate ?? -1) - (a.success_rate ?? -1)
      : (a[state.sortBy] ?? 1e9) - (b[state.sortBy] ?? 1e9)
  );
  const medals = ["🥇", "🥈", "🥉"];
  const tbody = rows
    .map((r, i) => `
      <tr>
        <td>${i < 3 ? `<span class="medal">${medals[i]}</span>` : `<span class="rank-num">#${i + 1}</span>`}</td>
        <td class="left mono" style="font-weight:600;">${esc(r.policy_id)}</td>
        <td class="${hl("mpjpe_xy_aligned_mm")}">${Number(r.mpjpe_xy_aligned_mm).toFixed(2)}</td>
        <td class="${hl("mpjpe_xy_yaw_aligned_mm")}">${Number(r.mpjpe_xy_yaw_aligned_mm).toFixed(2)}</td>
        <td class="${hl("mpjpe_world_mm")}">${Number(r.mpjpe_world_mm).toFixed(2)}</td>
        <td class="${hl("success_rate")}">${(r.success_rate * 100).toFixed(2)}%</td>
        <td class="mono" style="color:var(--muted);">${esc(r.added_date || "—")}</td>
      </tr>
    `)
    .join("");
  document.getElementById("bfm-rank-table").innerHTML = `${thead}<tbody>${tbody}</tbody>`;
}

function renderAlignmentTable() {
  document.getElementById("bfm-align-table").innerHTML = `
    <thead>
      <tr>
        <th class="left">Result Field</th>
        <th class="left">Alignment Mode</th>
        <th class="left">Transform</th>
        <th class="left">Errors Retained</th>
      </tr>
    </thead>
    <tbody>
      ${state.data.alignment_modes
        .map(
          (m) => `
        <tr>
          <td class="left"><code>${esc(m.field)}</code></td>
          <td class="left"><strong>${esc(m.label)}</strong></td>
          <td class="left">${esc(m.transform)}</td>
          <td class="left">${esc(m.retained)}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  `;
}

function renderSuitesTable() {
  document.getElementById("bfm-suites-table").innerHTML = `
    <thead>
      <tr>
        <th class="left">Suite ID</th>
        <th class="left">Robot</th>
        <th>Clips</th>
        <th>Source FPS</th>
        <th class="left">MJCF Asset</th>
        <th class="left">Status</th>
      </tr>
    </thead>
    <tbody>
      ${state.data.suites
        .map(
          (s) => `
        <tr>
          <td class="left mono" style="font-weight:600;">${esc(s.id)}</td>
          <td class="left">${esc(s.robot)}</td>
          <td>${s.clips}</td>
          <td>${s.source_fps} FPS</td>
          <td class="left"><code>${esc(s.mjcf)}</code></td>
          <td class="left"><span class="tag-pill">${esc(s.status)}</span></td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  `;
}

function renderNews() {
  const items = state.data.news || [];
  document.getElementById("bfm-news-list").innerHTML = items
    .map(
      (n) => `
      <li class="news-item">
        <span class="news-date">${esc(n.date)}</span>
        <span><span class="tag-pill tag-blue">${esc(n.tag)}</span></span>
        <span class="news-text">${esc(n.text)}</span>
      </li>
    `
    )
    .join("");
}

init().catch((err) => {
  document.getElementById("bfm-desc").textContent = `Load error: ${err.message}`;
});
