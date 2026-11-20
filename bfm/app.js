const state = {
  data: null,
  suiteId: "lafan-g1-29dof",
  sortBy: "mpjpe_xy_aligned_mm",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

async function init() {
  const res = await fetch("data/bfm_data.json");
  if (!res.ok) throw new Error("无法加载 data/bfm_data.json");
  state.data = await res.json();
  state.suiteId = state.data.suites[0].id;

  bindEvents();
  setupScrollSpy();
  renderSetting();
  renderSuiteChips();
  renderRanking();
  renderAlignmentTable();
  renderSuitesTable();
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
    <div><div class="meta-item-k">仿真引擎</div><div class="meta-item-v">${esc(d.engine)}</div></div>
    <div><div class="meta-item-k">物理步长与摩擦</div><div class="meta-item-v">${d.physics_dt_ms} ms · 摩擦 ${d.friction.toFixed(1)}</div></div>
    <div><div class="meta-item-k">主排序指标</div><div class="meta-item-v">XY 对齐全程 MPBPE (mm ↓)</div></div>
    <div><div class="meta-item-k">独立核验</div><div class="meta-item-v mono">motionchallenge-verify</div></div>
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
    `机体：${suite.robot} · 动作数：${suite.clips} 条（${suite.source_fps} FPS）· 步长：${suite.physics_dt} · 已适配：${suite.policies_supported}`;

  const hl = (k) => (state.sortBy === k ? "col-hl" : "");
  const thead = `
    <thead>
      <tr>
        <th style="width:64px;">Rank</th>
        <th class="left">策略（Policy）</th>
        <th class="${hl("mpjpe_xy_aligned_mm")}">MPBPE · XY (mm ↓)</th>
        <th class="${hl("mpjpe_xy_yaw_aligned_mm")}">MPBPE · XY+Yaw (mm ↓)</th>
        <th class="${hl("mpjpe_world_mm")}">MPBPE · 世界系 (mm ↓)</th>
        <th class="${hl("success_rate")}">成功率 (↑)</th>
        <th>核验状态</th>
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
            当前套件（<strong>${esc(suite.id)}</strong>）尚未导入正式跑批结果。<br />
            完成 <code>bfm-benchmark</code> 全量评测并通过 <code>motionchallenge-verify</code> 后，将 <code>result.json</code> 写入 <code>bfm/data/bfm_data.json</code> 即可自动发榜（严禁展示未经核验的占位数字）。
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
        <td><span class="tag-pill tag-green">${esc(r.verified ? "已复算核验" : "待复算")}</span></td>
      </tr>
    `)
    .join("");
  document.getElementById("bfm-rank-table").innerHTML = `${thead}<tbody>${tbody}</tbody>`;
}

function renderAlignmentTable() {
  document.getElementById("bfm-align-table").innerHTML = `
    <thead>
      <tr>
        <th class="left">结果字段</th>
        <th class="left">对齐模式</th>
        <th class="left">空间变换</th>
        <th class="left">保留误差项</th>
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
        <th class="left">机器人模型</th>
        <th>动作条数</th>
        <th>源帧率</th>
        <th class="left">MJCF 资产</th>
        <th class="left">当前状态</th>
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

init().catch((err) => {
  document.getElementById("bfm-desc").textContent = `加载失败：${err.message}`;
});
