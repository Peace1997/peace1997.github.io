const state = {
  data: null,
  suiteId: "roban-s17-lafan77",
  protocolId: "nominal", // 'nominal' | 'sim2real-p0' | 'overview'
  sortBy: "success_rate",
  showDiag: false,
};

const LOWER_BETTER = new Set([
  "mpjpe_xy_aligned_mm",
  "prefix_xy_aligned_mm",
  "mpjpe_xy_yaw_aligned_mm",
  "joint_mae_rad",
]);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

function fmtDeltaRate(v, okTh, midTh) {
  if (v == null) return `<span style="color:var(--muted);">—</span>`;
  const s = v > 0 ? "+" : "";
  const c = v >= okTh ? "d-ok" : v >= midTh ? "d-mid" : "d-bad";
  return `<span class="${c}">${s}${Number(v).toFixed(2)}%</span>`;
}

function fmtDeltaErr(v) {
  if (v == null) return `<span style="color:var(--muted);">—</span>`;
  const s = v > 0 ? "+" : "";
  const c = v <= 2.5 ? "d-ok" : v <= 3.6 ? "d-mid" : "d-bad";
  return `<span class="${c}">${s}${Number(v).toFixed(2)} mm</span>`;
}

async function init() {
  const res = await fetch("data/bfm_data.json?v=20261124", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load data/bfm_data.json");
  state.data = await res.json();
  state.suiteId = state.data.suites[0].id;

  bindEvents();
  setupScrollSpy();
  renderSetting();
  renderProtoChips();
  renderSuiteChips();
  renderRanking();
  renderAlignmentTable();
  renderSuitesTable();
  renderNews();
}

function currentSuite() {
  return state.data.suites.find((s) => s.id === state.suiteId) || state.data.suites[0];
}

function protoMeta(pid) {
  return (state.data.protocols || []).find((p) => p.id === pid);
}

function setProtocol(pid) {
  state.protocolId = pid;
  renderProtoChips();
  renderRanking();
}

function bindEvents() {
  document.getElementById("bfm-sort-chips").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.sortBy = btn.dataset.sort;
    document.querySelectorAll("#bfm-sort-chips .chip").forEach((b) => b.classList.toggle("active", b === btn));
    renderRanking();
  });

  document.getElementById("bfm-diag-toggle").addEventListener("change", (e) => {
    state.showDiag = e.target.checked;
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
  document.getElementById("bfm-desc").innerHTML = `
    Whole-body humanoid motion-tracking benchmark under unified <strong>${esc(d.protocol_version)}</strong> (${esc(d.engine)}).<br />
    Policies run in isolated worker processes with per-step PD recomputation and independent trace verification; Nominal and Sim2Real-P0 protocols are strictly isolated by <code>protocol_sha256</code>.
  `;
  document.getElementById("bfm-scoring").innerHTML = `
    <li><strong>Success &amp; Completion</strong>: Zero failures through planned horizon; Completion = pre-failure duration ÷ total duration (macro-averaged across clips).</li>
    <li><strong>Failure Rules</strong>: Root height error &gt; 0.25 m or projected gravity Z error &gt; 0.8 (SuperMimic Appendix A; end-effector deviation is not a failure condition).</li>
    <li><strong>Tracking Accuracy</strong>: Full-motion &amp; Prefix XY-aligned MPBPE (mm ↓), XY+Yaw MPBPE (mm ↓), and 21-joint MAE (rad ↓); every result verified via <code>motionchallenge-verify</code>.</li>
  `;
  document.getElementById("bfm-details").innerHTML = `
    <div class="details-grid">
      <div>
        <div class="details-table-title">Failure Rules &amp; Trace Verification</div>
        <table class="mini-table">
          <thead><tr><th>Item</th><th>Specification</th></tr></thead>
          <tbody>
            <tr><td>Failure Conditions</td><td>Pelvis height diff &gt; 0.25 m or projected gravity Z diff &gt; 0.8</td></tr>
            <tr><td>End-Effector Deviation</td><td>Not a failure condition</td></tr>
            <tr><td>Trace Verification</td><td><code>trace_consistent</code> hash-checked manifest + independent FK recomputation</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <div class="details-table-title">Protocol Comparison (Nominal v2 vs Sim2Real-P0 v1)</div>
        <table class="mini-table">
          <thead><tr><th>Parameter</th><th>Nominal v2 (<code>3ad95c0c</code>)</th><th>Sim2Real-P0 v1 (<code>7414fbb1</code>)</th></tr></thead>
          <tbody>
            <tr><td>Ground Friction</td><td><code>1.0</code></td><td><code>0.4</code></td></tr>
            <tr><td>Control Delay</td><td><code>0 ms</code></td><td><code>10 ms</code> event queue</td></tr>
            <tr><td>Joint Damping / Friction</td><td><code>0.0 / 0.0</code></td><td><code>0.2 / 0.1</code></td></tr>
            <tr><td>Motor Envelope</td><td>Static torque clamp</td><td>21-joint linear back-EMF</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById("bfm-meta").innerHTML = `
    <div><div class="meta-item-k">Physics Engine</div><div class="meta-item-v">${esc(d.engine)}</div></div>
    <div><div class="meta-item-k">Active Suite</div><div class="meta-item-v">Roban S17 · LAFAN1 77 Clips (50 Hz)</div></div>
    <div><div class="meta-item-k">Protocols</div><div class="meta-item-v">Nominal v2 · Sim2Real-P0 v1</div></div>
    <div><div class="meta-item-k">Verification</div><div class="meta-item-v mono">motionchallenge-verify</div></div>
  `;
}

function renderProtoChips() {
  const el = document.getElementById("bfm-proto-chips");
  const items = [
    { id: "nominal", label: "1. Nominal Baseline (5)" },
    { id: "sim2real-p0", label: "2. Sim2Real-P0 Stress (5)" },
    { id: "overview", label: "Cross-Protocol Matrix (5×2)" },
  ];
  el.innerHTML = items
    .map((it) => `<button class="chip ${state.protocolId === it.id ? "active" : ""}" data-proto="${esc(it.id)}">${esc(it.label)}</button>`)
    .join("");
  el.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => setProtocol(btn.dataset.proto));
  });
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
  const hasProtos = suite.protocols && Object.keys(suite.protocols).length > 0;
  const isOverview = state.protocolId === "overview" && hasProtos;

  document.getElementById("bfm-sort-group").hidden = isOverview;
  document.getElementById("bfm-diag-group").hidden = isOverview || !hasProtos;

  const medals = ["🥇", "🥈", "🥉"];
  const tbl = document.getElementById("bfm-rank-table");

  if (!hasProtos) {
    document.getElementById("bfm-proto-badge").textContent = "Awaiting Results";
    document.getElementById("bfm-spec-line").textContent = `Suite: ${suite.id} · ${suite.robot} · ${suite.clips} clips (${suite.source_fps} FPS)`;
    document.getElementById("bfm-rank-heading").textContent = `Overall Ranking · ${suite.name}`;
    document.getElementById("bfm-rank-sub").textContent = `Robot: ${suite.robot} · Clips: ${suite.clips} (${suite.source_fps} FPS) · Physics dt: ${suite.physics_dt}`;
    tbl.innerHTML = `
      <thead><tr><th>Rank</th><th class="left">Policy</th><th>Success Rate</th><th>Completion</th><th>Full XY (mm)</th></tr></thead>
      <tbody><tr><td colspan="5" class="empty-msg">No verified full-suite results imported yet for <strong>${esc(suite.id)}</strong>.</td></tr></tbody>
    `;
    return;
  }

  if (isOverview) {
    const nomRows = suite.protocols.nominal || [];
    const p0Map = Object.fromEntries((suite.protocols["sim2real-p0"] || []).map((r) => [r.policy_id, r]));
    document.getElementById("bfm-proto-badge").textContent = "Nominal vs Sim2Real-P0";
    document.getElementById("bfm-spec-line").textContent =
      `Suite: ${suite.id} (suite_sha: ${suite.suite_sha || "—"})  |  Side-by-side comparison without cross-protocol averaging · Click column headers to inspect`;
    document.getElementById("bfm-rank-heading").textContent = `Cross-Protocol Degradation Matrix · ${suite.name}`;
    document.getElementById("bfm-rank-sub").textContent = `Robot: ${suite.robot} · ${suite.clips} clips (${suite.source_fps} Hz) · MuJoCo 3.17.0 (${suite.physics_dt})`;

    const thead = `
      <thead>
        <tr>
          <th style="width:54px;">Rank</th>
          <th class="left">Policy</th>
          <th class="left">Ref Input</th>
          <th class="th-jump" data-jump-proto="nominal">Nominal v2 ↗<span class="sub-val mono">sha:3ad95c0c</span></th>
          <th class="th-jump" data-jump-proto="sim2real-p0">Sim2Real-P0 v1 ↗<span class="sub-val mono">sha:7414fbb1</span></th>
          <th>P0 Degradation (Δ vs Nominal)</th>
        </tr>
      </thead>
    `;
    const tbody = nomRows
      .map((nom, i) => {
        const p0 = p0Map[nom.policy_id];
        return `
          <tr>
            <td>${i < 3 ? `<span class="medal">${medals[i]}</span>` : `<span class="rank-num">#${i + 1}</span>`}</td>
            <td class="left mono" style="font-weight:700;">${esc(nom.policy_id)}</td>
            <td class="left"><span class="tag-pill" title="${esc(nom.ref_desc)}">${esc(nom.ref_tag)}</span></td>
            <td>
              <div><strong>${(nom.success_rate * 100).toFixed(2)}%</strong> <span style="color:var(--muted);">· Comp</span> <strong>${(nom.completion * 100).toFixed(2)}%</strong></div>
              <span class="sub-val">XY ${nom.mpjpe_xy_aligned_mm.toFixed(2)} mm · ${nom.successes}/${nom.n}</span>
            </td>
            <td>
              ${
                p0
                  ? `<div><strong>${(p0.success_rate * 100).toFixed(2)}%</strong> <span style="color:var(--muted);">· Comp</span> <strong>${(p0.completion * 100).toFixed(2)}%</strong></div>
                     <span class="sub-val">XY ${p0.mpjpe_xy_aligned_mm.toFixed(2)} mm · ${p0.successes}/${p0.n}</span>`
                  : "—"
              }
            </td>
            <td>
              ${
                p0
                  ? `<div>SR ${fmtDeltaRate(p0.delta_sr_nom, -13.5, -16.0)} · Comp ${fmtDeltaRate(p0.delta_comp_nom, -5.0, -9.0)}</div>
                     <span class="sub-val">Full XY ${fmtDeltaErr(p0.delta_xy_nom)}</span>`
                  : "—"
              }
            </td>
          </tr>
        `;
      })
      .join("");
    tbl.innerHTML = `${thead}<tbody>${tbody}</tbody>`;
    tbl.querySelectorAll("[data-jump-proto]").forEach((th) => {
      th.addEventListener("click", () => setProtocol(th.dataset.jumpProto));
    });
    return;
  }

  const pm = protoMeta(state.protocolId) || state.data.protocols[0];
  const isP0 = pm.id === "sim2real-p0";
  const rows = [...(suite.protocols[pm.id] || [])];
  rows.sort((a, b) => {
    const av = a[state.sortBy] ?? 0;
    const bv = b[state.sortBy] ?? 0;
    if (av !== bv) return LOWER_BETTER.has(state.sortBy) ? av - bv : bv - av;
    if (b.success_rate !== a.success_rate) return b.success_rate - a.success_rate;
    if (b.completion !== a.completion) return b.completion - a.completion;
    return a.mpjpe_xy_aligned_mm - b.mpjpe_xy_aligned_mm;
  });

  document.getElementById("bfm-proto-badge").textContent = `${pm.short} · sha:${pm.protocol_sha}`;
  document.getElementById("bfm-spec-line").textContent = `${pm.desc}  |  protocol_id: ${pm.protocol_id}`;
  document.getElementById("bfm-rank-heading").textContent = `${pm.label} · ${suite.name}`;
  document.getElementById("bfm-rank-sub").textContent =
    `Robot: ${suite.robot} · Clips: ${suite.clips} (${suite.source_fps} Hz) · Physics dt: ${suite.physics_dt} · Latest update: ${state.data.updated_date || "2026-11-24"}`;

  const bestSr = Math.max(...rows.map((r) => r.success_rate));
  const bestComp = Math.max(...rows.map((r) => r.completion));
  const bestXy = Math.min(...rows.map((r) => r.mpjpe_xy_aligned_mm));
  const bestPre = Math.min(...rows.map((r) => r.prefix_xy_aligned_mm));
  const bestYaw = Math.min(...rows.map((r) => r.mpjpe_xy_yaw_aligned_mm));
  const bestJmae = Math.min(...rows.map((r) => r.joint_mae_rad));

  const hl = (k) => (state.sortBy === k ? "col-hl" : "");
  const thead = `
    <thead>
      <tr>
        <th style="width:54px;">Rank</th>
        <th class="left">Policy</th>
        <th class="left">Ref Input</th>
        <th class="${hl("success_rate")}">Success Rate (↑)</th>
        <th class="${hl("completion")}">Completion (↑)</th>
        ${isP0 ? `<th>Δ vs Nom</th>` : ""}
        <th class="${hl("mpjpe_xy_aligned_mm")}">Full XY (mm ↓)</th>
        <th class="${hl("prefix_xy_aligned_mm")}">Prefix XY (mm ↓)</th>
        <th class="${hl("mpjpe_xy_yaw_aligned_mm")}">XY+Yaw (mm ↓)</th>
        <th class="${hl("joint_mae_rad")}">Joint MAE (rad ↓)</th>
        ${state.showDiag ? `<th>95% CI</th><th>Drift / Ori</th><th class="left">Top Failures</th>` : ""}
      </tr>
    </thead>
  `;

  const tbody = rows
    .map((r, i) => `
      <tr>
        <td>${i < 3 ? `<span class="medal">${medals[i]}</span>` : `<span class="rank-num">#${i + 1}</span>`}</td>
        <td class="left mono" style="font-weight:700;">${esc(r.policy_id)}</td>
        <td class="left"><span class="tag-pill" title="${esc(r.ref_desc)}">${esc(r.ref_tag)}</span></td>
        <td class="${hl("success_rate")} ${r.success_rate === bestSr ? "cell-best" : ""}">${(r.success_rate * 100).toFixed(2)}%<span class="sub-val">${r.successes} / ${r.n}</span></td>
        <td class="${hl("completion")} ${r.completion === bestComp ? "cell-best" : ""}">${(r.completion * 100).toFixed(2)}%</td>
        ${isP0 ? `<td><div>${fmtDeltaRate(r.delta_sr_nom, -13.5, -16.0)}</div><span class="sub-val">Comp ${fmtDeltaRate(r.delta_comp_nom, -5.0, -9.0)}</span></td>` : ""}
        <td class="${hl("mpjpe_xy_aligned_mm")} ${r.mpjpe_xy_aligned_mm === bestXy ? "cell-best" : ""}">${r.mpjpe_xy_aligned_mm.toFixed(2)}</td>
        <td class="${hl("prefix_xy_aligned_mm")} ${r.prefix_xy_aligned_mm === bestPre ? "cell-best" : ""}">${r.prefix_xy_aligned_mm.toFixed(2)}</td>
        <td class="${hl("mpjpe_xy_yaw_aligned_mm")} ${r.mpjpe_xy_yaw_aligned_mm === bestYaw ? "cell-best" : ""}">${r.mpjpe_xy_yaw_aligned_mm.toFixed(2)}</td>
        <td class="${hl("joint_mae_rad")} ${r.joint_mae_rad === bestJmae ? "cell-best" : ""}">${r.joint_mae_rad.toFixed(4)}</td>
        ${
          state.showDiag
            ? `<td class="mono">[${(r.wilson95[0] * 100).toFixed(1)}%, ${(r.wilson95[1] * 100).toFixed(1)}%]</td>
               <td class="mono">${r.root_xy_m.toFixed(2)} m / ${r.root_ori_rad.toFixed(3)} rad</td>
               <td class="left" style="font-size:12px;color:var(--muted);">${esc(r.top_fails)}</td>`
            : ""
        }
      </tr>
    `)
    .join("");
  tbl.innerHTML = `${thead}<tbody>${tbody}</tbody>`;
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
          <td class="left"><span class="tag-pill ${s.status.startsWith("Live") ? "tag-green" : ""}">${esc(s.status)}</span></td>
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
        <span><span class="tag-pill ${n.tag === "Results Live" ? "tag-green" : "tag-blue"}">${esc(n.tag)}</span></span>
        <span class="news-text">${esc(n.text)}</span>
      </li>
    `
    )
    .join("");
}

init().catch((err) => {
  document.getElementById("bfm-desc").textContent = `Load error: ${err.message}`;
});
