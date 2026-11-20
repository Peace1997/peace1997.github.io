const state = {
  siteData: null,
  clipsData: null,
  datasetId: "clean_218",
  sortBy: "total_score",   // 'total_score' | 'sr' | 'hand_all' | 'foot_only' | 'quality'
  modality: "all",         // 'all' | 'depth' | 'rgb' | 'proprio'
  objScope: "all",         // 'all' | 'hand'
  objMetric: "total_score",// 'total_score' | 'sr'
  videoObj: "all",
  selectedClip: null,
  highlightPolicy: null,
  clipFilters: {
    q: "",
    obj: "all",
    inter: "all",
    policy: "all",
    fail: "all",
    diffA: "",
    diffMode: "off",
    diffB: "",
  },
};

const fmtPct = (v) => (v == null ? "—" : `${(v * 100).toFixed(2)}%`);
const fmtNum = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const INTER_LABELS = {
  hand_lift: "手部搬起",
  hand_ground: "手部地面推/移",
  foot_only: "纯脚部交互",
};

const SORT_META = {
  total_score: { title: "总分（0–100）", hint: "按 总分（官方口径）降序 ↓" },
  sr: { title: "成功率（SR）", hint: "按 成功率 降序 ↓" },
  hand_all: { title: "手部有效交互（79 条）", hint: "按 手部有效交互总分 降序 ↓" },
  foot_only: { title: "纯脚部交互（139 条）", hint: "按 纯脚部交互总分 降序 ↓" },
  quality: { title: "成功质量均分", hint: "按 成功片段质量均分 降序 ↓" },
};

const MOD_BADGE = {
  depth: "Depth",
  rgb: "RGB",
  proprio: "Proprio",
};

async function init() {
  const [siteRes, clipsRes] = await Promise.all([
    fetch("data/site_data.json"),
    fetch("data/clips_clean_218.json"),
  ]);
  if (!siteRes.ok || !clipsRes.ok) throw new Error("无法加载评测快照 JSON");
  state.siteData = await siteRes.json();
  state.clipsData = await clipsRes.json();
  state.datasetId = state.siteData.default_dataset;

  restoreFromHash();
  bindEvents();
  setupScrollSpy();
  renderSetting();
  renderRanking();
  renderObjectTable();
  renderFailureTable();
  populateClipFilters();
  syncClipControls();
  renderClipList();
  renderVideos();
  renderRegistry();
}

function ds() {
  return state.siteData.datasets[state.datasetId];
}

function pMeta(pid) {
  return state.siteData.policies[pid] || { id: pid, modality: "", modality_tag: "depth", backend: "" };
}

function restoreFromHash() {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw || !raw.includes("=")) return;
  const p = new URLSearchParams(raw);
  if (p.get("sort") && SORT_META[p.get("sort")]) state.sortBy = p.get("sort");
  if (["all", "depth", "rgb", "proprio"].includes(p.get("mod"))) state.modality = p.get("mod");
  if (p.get("obj")) state.clipFilters.obj = p.get("obj");
  if (p.get("policy")) {
    state.clipFilters.policy = p.get("policy");
    state.highlightPolicy = p.get("policy");
  }
  if (p.get("fail")) state.clipFilters.fail = p.get("fail");
  if (p.get("clip")) state.selectedClip = p.get("clip");
}

function syncHash() {
  const p = new URLSearchParams();
  if (state.sortBy !== "total_score") p.set("sort", state.sortBy);
  if (state.modality !== "all") p.set("mod", state.modality);
  if (state.clipFilters.obj !== "all") p.set("obj", state.clipFilters.obj);
  if (state.clipFilters.policy !== "all") p.set("policy", state.clipFilters.policy);
  if (state.clipFilters.fail !== "all") p.set("fail", state.clipFilters.fail);
  if (state.selectedClip) p.set("clip", state.selectedClip);
  const s = p.toString();
  history.replaceState(null, "", s ? `#${s}` : window.location.pathname);
}

function bindEvents() {
  document.getElementById("copy-link-btn").addEventListener("click", async () => {
    syncHash();
    const btn = document.getElementById("copy-link-btn");
    try {
      await navigator.clipboard.writeText(window.location.href);
      btn.textContent = "已复制";
    } catch {
      btn.textContent = "请复制地址栏";
    }
    setTimeout(() => { btn.textContent = "复制链接"; }, 1500);
  });

  document.getElementById("sort-chips").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.sortBy = btn.dataset.sort;
    document.querySelectorAll("#sort-chips .chip").forEach((b) => b.classList.toggle("active", b === btn));
    syncHash();
    renderRanking();
    renderObjectTable();
  });

  document.getElementById("modality-chips").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.modality = btn.dataset.mod;
    document.querySelectorAll("#modality-chips .chip").forEach((b) => b.classList.toggle("active", b === btn));
    syncHash();
    renderRanking();
    renderObjectTable();
    renderFailureTable();
  });

  document.getElementById("obj-scope-chips").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.objScope = btn.dataset.scope;
    document.querySelectorAll("#obj-scope-chips .chip").forEach((b) => b.classList.toggle("active", b === btn));
    renderObjectTable();
  });

  document.getElementById("obj-metric-chips").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.objMetric = btn.dataset.metric;
    document.querySelectorAll("#obj-metric-chips .chip").forEach((b) => b.classList.toggle("active", b === btn));
    renderObjectTable();
  });

  const onClipFilterChange = () => {
    state.clipFilters.q = document.getElementById("clip-search").value.trim().toLowerCase();
    state.clipFilters.obj = document.getElementById("clip-object-filter").value;
    state.clipFilters.inter = document.getElementById("clip-inter-filter").value;
    state.clipFilters.policy = document.getElementById("clip-policy-filter").value;
    state.clipFilters.fail = document.getElementById("clip-fail-filter").value;
    state.clipFilters.diffA = document.getElementById("diff-policy-a").value;
    state.clipFilters.diffMode = document.getElementById("diff-mode").value;
    state.clipFilters.diffB = document.getElementById("diff-policy-b").value;
    state.highlightPolicy = state.clipFilters.policy !== "all" ? state.clipFilters.policy : null;
    syncHash();
    renderClipList();
  };

  [
    "clip-search", "clip-object-filter", "clip-inter-filter",
    "clip-policy-filter", "clip-fail-filter",
    "diff-policy-a", "diff-mode", "diff-policy-b",
  ].forEach((id) => {
    document.getElementById(id).addEventListener("input", onClipFilterChange);
    document.getElementById(id).addEventListener("change", onClipFilterChange);
  });

  document.getElementById("clip-reset-btn").addEventListener("click", () => {
    resetClipFilters();
    syncClipControls();
    syncHash();
    renderClipList();
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
  sections.forEach((sec) => io.observe(sec));
}

function resetClipFilters() {
  const pids = state.clipsData.policies;
  state.clipFilters = {
    q: "", obj: "all", inter: "all", policy: "all", fail: "all",
    diffA: pids[0] || "", diffMode: "off", diffB: pids[1] || "",
  };
  state.highlightPolicy = null;
}

function drillToClips({ obj = "all", policy = "all", fail = "all", inter = "all", clip = null } = {}) {
  resetClipFilters();
  state.clipFilters.obj = obj;
  state.clipFilters.policy = policy;
  state.clipFilters.fail = fail;
  state.clipFilters.inter = inter;
  state.highlightPolicy = policy !== "all" ? policy : null;
  state.selectedClip = clip;
  syncClipControls();
  syncHash();
  renderClipList();
  document.getElementById("clips").scrollIntoView({ behavior: "smooth", block: "start" });
}

function visibleRows() {
  let rows = [...ds().leaderboard];
  if (state.modality !== "all") {
    rows = rows.filter((r) => pMeta(r.policy_id).modality_tag === state.modality);
  }
  rows.sort((a, b) => {
    if (state.sortBy === "sr") return b.sr - a.sr || b.total_score - a.total_score;
    if (state.sortBy === "hand_all") return b.interaction.hand_all.total_score - a.interaction.hand_all.total_score;
    if (state.sortBy === "foot_only") return b.interaction.foot_only.total_score - a.interaction.foot_only.total_score;
    if (state.sortBy === "quality") return b.mean_quality_success - a.mean_quality_success;
    return b.total_score - a.total_score;
  });
  return rows;
}

/* 1. Benchmark Setting */
function renderSetting() {
  const d = ds();
  const th = state.siteData.metric_spec.thresholds;
  const fp = state.siteData.fingerprint;

  document.getElementById("setting-desc").innerHTML = `
    六策略在同一份 <strong>${esc(d.name)}</strong> 上从零完成 L0 进程内 MuJoCo 闭环重评（共 218 条 = 手部有效交互 79 条［搬起 34 + 地面推/移 45］+ 纯脚部交互 139 条）。
    ${esc(d.denominator_note)}
  `;

  document.getElementById("scoring-summary").innerHTML = `
    <strong>总分</strong>看综合表现（失败计 0 分），<strong>成功率</strong>看任务完成比例，<strong>成功质量均分</strong>看成功后物体跟踪精度。
    成功须同时满足四项：数据有效 ∧ 无终止（<code>nan</code> / <code>body_z</code> / <code>root_ori</code> / <code>drop</code>）∧ 完整播放 ∧ 手部接触召回 ≥ ${th.contact_recall_min}（无要求则豁免）。
    物体位置与姿态误差不作为成功门槛，仅进入 0–100 质量分。
  `;

  document.getElementById("scoring-details").innerHTML = `
    <div>• <strong>相对参考对齐</strong>：每帧按实际/参考骨盆 XY 平移与 yaw 补偿参考物体（保留参考 z），消除纯偏航/水平漂移误判。</div>
    <div>• <strong>质量分公式</strong>：<code>quality = ${th.score_w_pos} · pos_score + ${th.score_w_ori} · ori_score</code>；单项为全程均值与终点各占 50% 的线性 hinge（位置满分 ≤ ${th.score_pos_full} m / 零分 ≥ ${th.score_pos_zero} m；姿态满分 ≤ ${th.score_ori_full} rad / 零分 ≥ ${th.score_ori_zero} rad）。</div>
    <div>• <strong>终止阈值</strong>：<code>body_z</code> &gt; ${th.body_z_err} m（连续 ${th.body_z_steps} 步，低参考根高 &lt;${th.body_z_low_ref_root} m 放宽至 ${th.body_z_err_low_ref} m）；<code>root_ori</code> 倾斜角平方 &gt; ${th.root_ori_err_sq}（连续 ${th.root_ori_steps} 步）；<code>drop</code> 需手接触 ∧ 离地 &gt;${th.drop_ref_clearance} m ∧ 低于参考 &gt;${th.drop_z_below_ref} m（连续 ${th.drop_steps} 步）。</div>
  `;

  document.getElementById("meta-strip").innerHTML = `
    <div><div class="meta-item-k">评测集与分母</div><div class="meta-item-v">218 干净子集（played = 218）</div></div>
    <div><div class="meta-item-k">物理与控制步长</div><div class="meta-item-v">1 ms 物理步长 · engage=reset</div></div>
    <div><div class="meta-item-k">接触信号真源</div><div class="meta-item-v">MuJoCo 实测碰撞 · data_hoi 标注</div></div>
    <div><div class="meta-item-k">计分标准 / 提交</div><div class="meta-item-v mono">${esc(fp.metric_standard)} · ${esc(fp.eval_commit.slice(0, 8))}</div></div>
  `;
}

/* 2. Overall Ranking */
function renderRanking() {
  const d = ds();
  const rows = visibleRows();
  const sm = SORT_META[state.sortBy];

  document.getElementById("rank-count").textContent = `${rows.length} of ${d.leaderboard.length} policies`;
  document.getElementById("rank-sort-hint").textContent = sm.hint;
  document.getElementById("rank-spec-line").textContent =
    `Dataset: ${d.name}  |  Sim: ${d.sim_config}  |  Denominator: 218 / 218 (played)`;
  document.getElementById("rank-heading").textContent = `Overall Ranking · ${sm.title}`;
  document.getElementById("rank-updated").textContent = `Latest update: ${d.date}`;

  const hl = (key) => (state.sortBy === key ? "col-hl" : "");
  const medals = ["🥇", "🥈", "🥉"];

  const thead = `
    <thead>
      <tr>
        <th style="width:64px;">Rank</th>
        <th class="left">策略（Policy）</th>
        <th>模态</th>
        <th class="${hl("total_score")}">总分</th>
        <th class="${hl("sr")}">成功率 (成功/218)</th>
        <th class="${hl("hand_all")}">手部有效交互 (79)</th>
        <th class="${hl("foot_only")}">纯脚部交互 (139)</th>
        <th class="${hl("quality")}">成功质量均分</th>
        <th>站立失败</th>
      </tr>
    </thead>
  `;

  const tbody = rows.length
    ? rows
        .map((r, i) => {
          const pm = pMeta(r.policy_id);
          const rankCell = i < 3 ? `<span class="medal">${medals[i]}</span>` : `<span class="rank-num">#${i + 1}</span>`;
          const h = r.interaction.hand_all;
          const f = r.interaction.foot_only;
          return `
            <tr>
              <td>${rankCell}</td>
              <td class="left">
                <button class="method-btn" data-drill-p="${esc(r.policy_id)}">${esc(r.policy_id)}</button>
                <span class="sub-val">${esc(pm.modality)}</span>
              </td>
              <td><span class="tag-pill ${pm.modality_tag === "depth" ? "tag-blue" : ""}">${esc(MOD_BADGE[pm.modality_tag] || pm.modality_tag)}</span></td>
              <td class="${hl("total_score")}">${fmtNum(r.total_score, 3)}</td>
              <td class="${hl("sr")}">${fmtPct(r.sr)}<span class="sub-val">${r.successes} / ${r.n} · [${(r.wilson95[0] * 100).toFixed(1)}%, ${(r.wilson95[1] * 100).toFixed(1)}%]</span></td>
              <td class="${hl("hand_all")}">${fmtNum(h.total_score, 2)}<span class="sub-val">${fmtPct(h.sr)} (${h.successes}/${h.n})</span></td>
              <td class="${hl("foot_only")}">${fmtNum(f.total_score, 2)}<span class="sub-val">${fmtPct(f.sr)} (${f.successes}/${f.n})</span></td>
              <td class="${hl("quality")}">${fmtNum(r.mean_quality_success, 2)}</td>
              <td>${r.stand_failed}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="9" class="empty-msg">当前模态筛选下无策略</td></tr>`;

  const tbl = document.getElementById("ranking-table");
  tbl.innerHTML = `${thead}<tbody>${tbody}</tbody>`;
  tbl.querySelectorAll("[data-drill-p]").forEach((btn) => {
    btn.addEventListener("click", () => drillToClips({ policy: btn.dataset.drillP, fail: "failed" }));
  });
}

/* 3. Per-Object Results */
function renderObjectTable() {
  const rows = visibleRows();
  const tbl = document.getElementById("object-table");
  if (!rows.length) {
    tbl.innerHTML = `<tbody><tr><td class="empty-msg">当前模态筛选下无策略</td></tr></tbody>`;
    return;
  }

  const key = state.objScope === "hand" ? "by_object_hand" : "by_object";
  const objs = Object.keys(rows[0][key] || {}).sort();

  const thead = `
    <thead>
      <tr>
        <th class="left">物体类别（条数）</th>
        ${rows.map((r) => `<th class="mono">${esc(r.policy_id)}</th>`).join("")}
      </tr>
    </thead>
  `;

  const tbody = objs
    .map((obj) => {
      const sample = rows[0][key][obj];
      const vals = rows.map((r) => {
        const d = r[key][obj];
        return d ? (state.objMetric === "sr" ? d.sr * 100 : d.total_score) : -1;
      });
      const maxVal = Math.max(...vals);

      const cells = rows
        .map((r, idx) => {
          const d = r[key][obj];
          if (!d) return `<td>—</td>`;
          const v = vals[idx];
          const isBest = v === maxVal && maxVal > 0;
          const isLow = v < 20;
          const cls = `cell-click ${isBest ? "cell-best" : isLow ? "cell-warn" : ""}`;
          const text = state.objMetric === "sr" ? `${(d.sr * 100).toFixed(1)}%` : fmtNum(d.total_score, 1);
          return `<td class="${cls}" data-obj="${esc(obj)}" data-pol="${esc(r.policy_id)}" title="点击查看 ${esc(obj)} × ${esc(r.policy_id)}">${text}<span class="sub-val">${d.successes}/${d.n}</span></td>`;
        })
        .join("");

      return `<tr><td class="left"><strong>${esc(obj)}</strong> <span class="mono" style="color:var(--muted);">(${sample ? sample.n : 0})</span></td>${cells}</tr>`;
    })
    .join("");

  tbl.innerHTML = `${thead}<tbody>${tbody}</tbody>`;
  tbl.querySelectorAll("[data-obj]").forEach((td) => {
    td.addEventListener("click", () => drillToClips({ obj: td.dataset.obj, policy: td.dataset.pol }));
  });
}

/* 4. Failure Table (clean tabular breakdown matching COMPARISON.md §五) */
function renderFailureTable() {
  const rows = visibleRows();
  const cols = ["drop", "contact_recall", "incomplete", "body_z", "root_ori"];

  const thead = `
    <thead>
      <tr>
        <th class="left">策略（Policy）</th>
        <th>失败片段数</th>
        ${cols.map((c) => `<th class="mono">${c}</th>`).join("")}
      </tr>
    </thead>
  `;

  const tbody = rows
    .map((r) => {
      const failN = r.n - r.successes;
      const fr = r.fail_reasons_multilabel || {};
      const cells = cols
        .map((c) => {
          const cnt = fr[c] || 0;
          if (cnt === 0) return `<td class="cell-zero">0</td>`;
          return `<td class="cell-click" data-fpol="${esc(r.policy_id)}" data-ftag="${esc(c)}" title="点击查看 ${esc(r.policy_id)} 的 ${c} 失败片段"><strong>${cnt}</strong></td>`;
        })
        .join("");
      return `
        <tr>
          <td class="left"><button class="method-btn" data-fpol="${esc(r.policy_id)}" data-ftag="failed">${esc(r.policy_id)}</button></td>
          <td class="cell-click" data-fpol="${esc(r.policy_id)}" data-ftag="failed"><strong>${failN}</strong> <span style="color:var(--muted);">/ ${r.n}</span></td>
          ${cells}
        </tr>
      `;
    })
    .join("");

  const tbl = document.getElementById("failure-table");
  tbl.innerHTML = `${thead}<tbody>${tbody}</tbody>`;
  tbl.querySelectorAll("[data-fpol]").forEach((el) => {
    el.addEventListener("click", () => drillToClips({ policy: el.dataset.fpol, fail: el.dataset.ftag }));
  });
}

/* 5. Per-Clip Diagnostics */
function populateClipFilters() {
  const clips = state.clipsData.clips;
  const pids = state.clipsData.policies;
  const objs = [...new Set(clips.map((c) => c.object))].sort();
  const inters = [...new Set(clips.map((c) => c.interaction_type))].sort();

  document.getElementById("clip-object-filter").innerHTML =
    `<option value="all">全部物体 (${objs.length})</option>` +
    objs.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("");

  document.getElementById("clip-inter-filter").innerHTML =
    `<option value="all">全部交互类型</option>` +
    inters.map((i) => `<option value="${esc(i)}">${esc(INTER_LABELS[i] || i)}</option>`).join("");

  document.getElementById("clip-policy-filter").innerHTML =
    `<option value="all">全部策略</option>` +
    pids.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");

  const opts = pids.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
  document.getElementById("diff-policy-a").innerHTML = opts;
  document.getElementById("diff-policy-b").innerHTML = opts;
  if (!state.clipFilters.diffA && pids.length) state.clipFilters.diffA = pids[0];
  if (!state.clipFilters.diffB && pids.length > 1) state.clipFilters.diffB = pids[1];
}

function syncClipControls() {
  document.getElementById("clip-search").value = state.clipFilters.q;
  document.getElementById("clip-object-filter").value = state.clipFilters.obj;
  document.getElementById("clip-inter-filter").value = state.clipFilters.inter;
  document.getElementById("clip-policy-filter").value = state.clipFilters.policy;
  document.getElementById("clip-fail-filter").value = state.clipFilters.fail;
  document.getElementById("diff-policy-a").value = state.clipFilters.diffA;
  document.getElementById("diff-mode").value = state.clipFilters.diffMode;
  document.getElementById("diff-policy-b").value = state.clipFilters.diffB;
}

function matchFail(res, tag) {
  if (!res) return false;
  if (tag === "all") return true;
  if (tag === "succeeded") return res.success === 1;
  if (tag === "failed") return res.success === 0;
  return (res.fail_reasons || []).includes(tag) || res.fail_reason === tag;
}

function renderClipList() {
  const clips = state.clipsData.clips;
  const pids = state.clipsData.policies;
  const f = state.clipFilters;

  const filtered = clips.filter((c) => {
    if (f.q && !c.clip.toLowerCase().includes(f.q) && !c.object.toLowerCase().includes(f.q)) return false;
    if (f.obj !== "all" && c.object !== f.obj) return false;
    if (f.inter !== "all" && c.interaction_type !== f.inter) return false;
    if (f.fail !== "all") {
      if (f.policy !== "all") {
        if (!matchFail(c.results[f.policy], f.fail)) return false;
      } else if (!pids.some((p) => matchFail(c.results[p], f.fail))) {
        return false;
      }
    }
    if (f.diffMode !== "off" && f.diffA && f.diffB && f.diffA !== f.diffB) {
      const sa = c.results[f.diffA]?.success === 1;
      const sb = c.results[f.diffB]?.success === 1;
      if (f.diffMode === "a_win_b_lose" && !(sa && !sb)) return false;
      if (f.diffMode === "a_lose_b_win" && !(!sa && sb)) return false;
      if (f.diffMode === "disagree" && sa === sb) return false;
    }
    return true;
  });

  document.getElementById("clip-count").textContent = `匹配 ${filtered.length} / ${clips.length} 条片段`;
  const listEl = document.getElementById("clip-list");
  if (!filtered.length) {
    state.selectedClip = null;
    listEl.innerHTML = `<div class="empty-msg">无匹配片段</div>`;
    renderClipDetail(null);
    return;
  }

  if (!state.selectedClip || !filtered.some((c) => c.clip === state.selectedClip)) {
    state.selectedClip = filtered[0].clip;
  }

  listEl.innerHTML = filtered
    .map((c) => {
      const succ = pids.filter((p) => c.results[p]?.success === 1).length;
      const cls = succ === pids.length ? "tag-green" : succ === 0 ? "tag-coral" : "tag-blue";
      const active = c.clip === state.selectedClip;
      return `
        <button type="button" role="option" aria-selected="${active}" class="clip-row ${active ? "active" : ""}" data-cid="${esc(c.clip)}">
          <div class="clip-row-name">${esc(c.clip)}</div>
          <div class="clip-row-tags">
            <span class="tag-pill">${esc(c.object)}</span>
            <span class="tag-pill">${esc(INTER_LABELS[c.interaction_type] || c.interaction_type)}</span>
            <span class="tag-pill ${cls}">${succ}/${pids.length} 成功</span>
          </div>
        </button>
      `;
    })
    .join("");

  listEl.querySelectorAll(".clip-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedClip = btn.dataset.cid;
      listEl.querySelectorAll(".clip-row").forEach((el) => {
        el.classList.toggle("active", el === btn);
        el.setAttribute("aria-selected", el === btn ? "true" : "false");
      });
      syncHash();
      renderClipDetail(filtered.find((c) => c.clip === state.selectedClip));
    });
  });

  renderClipDetail(filtered.find((c) => c.clip === state.selectedClip));
}

function renderClipDetail(clip) {
  const el = document.getElementById("clip-detail");
  if (!clip) {
    el.innerHTML = `<div class="empty-msg">请选择左侧片段查看跨策略明细</div>`;
    return;
  }
  const pids = state.clipsData.policies;
  const clipVids = (ds().videos || []).filter((v) => v.clip === clip.clip);
  const matchedVid = state.highlightPolicy
    ? clipVids.find((v) => v.policy_id === state.highlightPolicy)
    : clipVids[0];

  const rowsHtml = pids
    .map((pid) => {
      const r = clip.results[pid];
      const hl = state.highlightPolicy === pid ? "row-hl" : "";
      const hasVid = clipVids.some((v) => v.policy_id === pid);
      if (!r) return `<tr class="${hl}"><td class="left mono">${esc(pid)}</td><td colspan="6">—</td></tr>`;
      const badge = r.success
        ? `<span class="tag-pill tag-green">成功</span>`
        : `<span class="tag-pill tag-coral">${esc((r.fail_reasons || []).join(", ") || r.fail_reason)}</span>`;
      const contact = r.contact_exempt ? "豁免" : r.contact_recall != null ? fmtPct(r.contact_recall) : "—";
      return `
        <tr class="${hl}">
          <td class="left mono" style="font-weight:600;">${esc(pid)}${hasVid ? ` <span class="tag-pill tag-blue">视频</span>` : ""}</td>
          <td>${badge}</td>
          <td><strong>${fmtNum(r.episode_score, 2)}</strong></td>
          <td>${fmtNum(r.quality_score, 2)}</td>
          <td class="mono">${r.obj_pos_err_mean != null ? `${fmtNum(r.obj_pos_err_mean, 3)} / ${fmtNum(r.obj_pos_err_final, 3)}` : "—"}</td>
          <td class="mono">${r.obj_ori_err_mean != null ? `${fmtNum(r.obj_ori_err_mean, 3)} / ${fmtNum(r.obj_ori_err_final, 3)}` : "—"}</td>
          <td>${contact}</td>
        </tr>
      `;
    })
    .join("");

  let vidHtml = "";
  if (matchedVid) {
    vidHtml = `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="font-size:13px;">Ghost 叠影回放（策略：<span class="mono">${esc(matchedVid.policy_id)}</span>）</strong>
          <span class="tag-pill tag-blue">${matchedVid.size_mb} MB</span>
        </div>
        <video controls preload="metadata" poster="${esc(matchedVid.poster_url || "")}" style="width:100%;max-height:340px;border-radius:8px;background:#0f172a;">
          <source src="${esc(matchedVid.video_url)}" type="video/mp4" />
        </video>
      </div>
    `;
  } else if (clipVids.length && state.highlightPolicy) {
    vidHtml = `<div style="margin-top:12px;font-size:12px;color:var(--muted);">当前策略 <code>${esc(state.highlightPolicy)}</code> 未录制视频（已录制：${clipVids.map((v) => v.policy_id).join(", ")}）。</div>`;
  }

  el.innerHTML = `
    <div style="margin-bottom:12px;">
      <div class="mono" style="font-size:14.5px;font-weight:700;">${esc(clip.clip)}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px;">
        包：${esc(clip.package)} · 物体：${esc(clip.object)} · 类型：${esc(INTER_LABELS[clip.interaction_type] || clip.interaction_type)} · 帧数：${clip.frames ?? "—"}
      </div>
    </div>
    <div class="table-wrap">
      <table class="rt-table compact-table">
        <thead>
          <tr>
            <th class="left">策略</th>
            <th>判定</th>
            <th>单集得分</th>
            <th>质量分</th>
            <th>位置误差 m (均/终)</th>
            <th>姿态误差 rad (均/终)</th>
            <th>接触召回</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    ${vidHtml}
  `;
}

/* 6. Ghost Videos */
function renderVideos() {
  const d = ds();
  const vids = d.videos || [];
  const objs = [...new Set(vids.map((v) => v.object))].sort();

  const chipsEl = document.getElementById("video-filter-chips");
  chipsEl.innerHTML =
    `<button class="chip ${state.videoObj === "all" ? "active" : ""}" data-vobj="all">全部 (${vids.length})</button>` +
    objs.map((o) => `<button class="chip ${state.videoObj === o ? "active" : ""}" data-vobj="${esc(o)}">${esc(o)}</button>`).join("");
  chipsEl.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.videoObj = btn.dataset.vobj;
      renderVideos();
    });
  });

  const feat = document.getElementById("videos-featured");
  if (d.featured_video) {
    feat.innerHTML = `
      <div class="featured-wrap">
        <div class="featured-head">
          <strong style="font-size:13.5px;">${esc(d.featured_video.title)}</strong>
          <span class="tag-pill tag-blue">${d.featured_video.size_mb} MB · H.264</span>
        </div>
        <video controls preload="metadata" poster="${esc(d.featured_video.poster_url || "")}">
          <source src="${esc(d.featured_video.video_url)}" type="video/mp4" />
        </video>
      </div>
    `;
  }

  const shown = state.videoObj === "all" ? vids : vids.filter((v) => v.object === state.videoObj);
  const grid = document.getElementById("videos-grid");
  grid.innerHTML = shown
    .map(
      (v) => `
      <div class="video-card">
        <video controls preload="metadata" poster="${esc(v.poster_url || "")}">
          <source src="${esc(v.video_url)}" type="video/mp4" />
        </video>
        <div class="video-body">
          <div class="video-title">${esc(v.clip)}</div>
          <div class="clip-row-tags">
            <span class="tag-pill">${esc(v.object)}</span>
            <span class="tag-pill">${esc(INTER_LABELS[v.interaction_type] || v.interaction_type)}</span>
            <span class="tag-pill ${v.success ? "tag-green" : "tag-coral"}">${v.success ? `得分 ${fmtNum(v.episode_score, 1)}` : "失败 (0)"}</span>
          </div>
          <div class="video-meta">
            <span class="mono">${esc(v.policy_id)}</span>
            <span>均误 ${v.obj_pos_err_mean != null ? `${fmtNum(v.obj_pos_err_mean, 3)} m` : "—"}</span>
          </div>
          <button type="button" class="btn-subtle" data-vc="${esc(v.clip)}" data-vp="${esc(v.policy_id)}">查看该片段诊断 →</button>
        </div>
      </div>
    `
    )
    .join("");

  grid.querySelectorAll("[data-vc]").forEach((btn) => {
    btn.addEventListener("click", () => drillToClips({ clip: btn.dataset.vc, policy: btn.dataset.vp }));
  });
}

/* 7. Registry & Fingerprint */
function renderRegistry() {
  const policies = ds().leaderboard.map((r) => pMeta(r.policy_id));
  document.getElementById("registry-table").innerHTML = `
    <thead>
      <tr>
        <th class="left">策略 ID</th>
        <th class="left">模态</th>
        <th>Backend</th>
        <th class="left">ONNX SHA256</th>
      </tr>
    </thead>
    <tbody>
      ${policies
        .map(
          (p) => `
        <tr>
          <td class="left mono" style="font-weight:600;">${esc(p.id)}</td>
          <td class="left">${esc(p.modality)}</td>
          <td><span class="tag-pill">${esc(p.backend)}${p.reference_mode ? ` · ${esc(p.reference_mode)}` : ""}</span></td>
          <td class="left mono" style="color:var(--muted);word-break:break-all;">${esc(p.sha256 || "—")}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  `;

  const fp = state.siteData.fingerprint;
  document.getElementById("fp-footer").innerHTML = `
    <span>metric_standard: ${esc(fp.metric_standard)} | eval_commit: ${esc(fp.eval_commit)}</span>
    <span>clipset_sha256: ${esc(ds().clipset_sha256.slice(0, 16))}… | exported: ${esc(fp.exported_at)}</span>
  `;
}

init().catch((err) => {
  document.getElementById("setting-desc").textContent = `加载失败：${err.message}`;
});
