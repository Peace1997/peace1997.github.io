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
  hand_lift: "Hand Lift",
  hand_ground: "Hand Ground Push",
  foot_only: "Foot-Only",
};

const SORT_META = {
  total_score: { title: "Total Score (0–100)", hint: "Ranked by Total Score (official) ↓" },
  sr: { title: "Success Rate (SR)", hint: "Ranked by Success Rate ↓" },
  hand_all: { title: "Hand Interaction (79 Clips)", hint: "Ranked by Hand Interaction Score ↓" },
  foot_only: { title: "Foot-Only Interaction (139 Clips)", hint: "Ranked by Foot-Only Score ↓" },
  quality: { title: "Mean Quality (Success)", hint: "Ranked by Mean Success Quality ↓" },
};

const MOD_BADGE = {
  depth: "Depth",
  rgb: "RGB",
  proprio: "Proprio",
};

async function init() {
  const v = "20261120104032";
  const [siteRes, clipsRes] = await Promise.all([
    fetch(`data/site_data.json?v=${v}`, { cache: "no-store" }),
    fetch(`data/clips_clean_218.json?v=${v}`, { cache: "no-store" }),
  ]);
  if (!siteRes.ok || !clipsRes.ok) throw new Error("Failed to load benchmark snapshot JSON");
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
  renderNews();
}

function ds() {
  return state.siteData.datasets[state.datasetId];
}

function pMeta(pid) {
  return state.siteData.policies[pid] || { id: pid, label: pid, modality: "", modality_tag: "depth", backend: "", added_date: "—" };
}

function pName(pid) {
  return pMeta(pid).label || pid;
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
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Copy URL";
    }
    setTimeout(() => { btn.textContent = "Copy Link"; }, 1500);
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
    All 6 policies are evaluated from scratch in closed-loop L0 in-process MuJoCo on the same <strong>${esc(d.name)}</strong>
    (218 clips = 79 hand interaction [34 lift + 45 ground push] + 139 foot-only). ${esc(d.denominator_note)}
  `;

  document.getElementById("scoring-summary").innerHTML = `
    <strong>Total Score</strong> reflects overall performance (failed episodes score 0), <strong>Success Rate</strong> measures task completion, and <strong>Quality</strong> measures object tracking accuracy on successful episodes.
    Success requires all four gates: valid metrics ∧ no termination (<code>nan</code> / <code>body_z</code> / <code>root_ori</code> / <code>drop</code>) ∧ completeness ∧ hand contact recall ≥ ${th.contact_recall_min} (exempt when no hand contact is required).
    Object position and orientation errors are not success gates and only enter the 0–100 quality score.
  `;

  document.getElementById("scoring-details").innerHTML = `
    <div>• <strong>Relative Reference Alignment</strong>: Each frame aligns the reference object by the actual-vs-reference pelvis XY translation and yaw (preserving reference z).</div>
    <div>• <strong>Quality Score (0–100)</strong>: <code>quality = ${th.score_w_pos} · pos_score + ${th.score_w_ori} · ori_score</code>; each component averages mean &amp; final linear hinge scores (pos: full ≤ ${th.score_pos_full} m, zero ≥ ${th.score_pos_zero} m; ori: full ≤ ${th.score_ori_full} rad, zero ≥ ${th.score_ori_zero} rad).</div>
    <div>• <strong>Termination Rules</strong>: <code>body_z</code> &gt; ${th.body_z_err} m for ${th.body_z_steps} steps (${th.body_z_err_low_ref} m when ref root z &lt; ${th.body_z_low_ref_root} m); <code>root_ori</code> tilt squared &gt; ${th.root_ori_err_sq} for ${th.root_ori_steps} steps (yaw-invariant); <code>drop</code> requires contact ∧ clearance &gt; ${th.drop_ref_clearance} m ∧ object below ref &gt; ${th.drop_z_below_ref} m for ${th.drop_steps} steps.</div>
  `;

  document.getElementById("meta-strip").innerHTML = `
    <div><div class="meta-item-k">Evaluation Set &amp; Denominator</div><div class="meta-item-v">218 Clean Subset (played = 218)</div></div>
    <div><div class="meta-item-k">Simulation &amp; Engage</div><div class="meta-item-v">1 ms physics dt · engage=reset</div></div>
    <div><div class="meta-item-k">Contact Ground Truth</div><div class="meta-item-v">MuJoCo real collision · data_hoi</div></div>
    <div><div class="meta-item-k">Standard / Commit</div><div class="meta-item-v mono">${esc(fp.metric_standard)} · ${esc(fp.eval_commit.slice(0, 8))}</div></div>
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
        <th style="width:60px;">Rank</th>
        <th class="left">Policy</th>
        <th>Modality</th>
        <th class="${hl("total_score")}">Total Score</th>
        <th class="${hl("sr")}">Success Rate</th>
        <th class="${hl("hand_all")}">Hand (79)</th>
        <th class="${hl("foot_only")}">Foot-Only (139)</th>
        <th class="${hl("quality")}">Quality (Succ)</th>
        <th>Added</th>
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
                <button class="method-btn" data-drill-p="${esc(r.policy_id)}">${esc(pName(r.policy_id))}</button>
                <span class="sub-val">${esc(pm.modality)}</span>
              </td>
              <td><span class="tag-pill ${pm.modality_tag === "depth" ? "tag-blue" : ""}">${esc(MOD_BADGE[pm.modality_tag] || pm.modality_tag)}</span></td>
              <td class="${hl("total_score")}">${fmtNum(r.total_score, 3)}</td>
              <td class="${hl("sr")}">${fmtPct(r.sr)}<span class="sub-val">${r.successes} / ${r.n} · [${(r.wilson95[0] * 100).toFixed(1)}%, ${(r.wilson95[1] * 100).toFixed(1)}%]</span></td>
              <td class="${hl("hand_all")}">${fmtNum(h.total_score, 2)}<span class="sub-val">${fmtPct(h.sr)} (${h.successes}/${h.n})</span></td>
              <td class="${hl("foot_only")}">${fmtNum(f.total_score, 2)}<span class="sub-val">${fmtPct(f.sr)} (${f.successes}/${f.n})</span></td>
              <td class="${hl("quality")}">${fmtNum(r.mean_quality_success, 2)}</td>
              <td class="mono" style="color:var(--muted);">${esc(pm.added_date || "—")}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="9" class="empty-msg">No policies match the selected modality</td></tr>`;

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
    tbl.innerHTML = `<tbody><tr><td class="empty-msg">No policies match the selected modality</td></tr></tbody>`;
    return;
  }

  const key = state.objScope === "hand" ? "by_object_hand" : "by_object";
  const objs = Object.keys(rows[0][key] || {}).sort();

  const thead = `
    <thead>
      <tr>
        <th class="left">Object (n)</th>
        ${rows.map((r) => `<th class="mono">${esc(pName(r.policy_id))}</th>`).join("")}
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
          return `<td class="${cls}" data-obj="${esc(obj)}" data-pol="${esc(r.policy_id)}" title="Inspect ${esc(obj)} × ${esc(pName(r.policy_id))}">${text}<span class="sub-val">${d.successes}/${d.n}</span></td>`;
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

/* 4. Failure Table */
function renderFailureTable() {
  const rows = visibleRows();
  const cols = ["drop", "contact_recall", "incomplete", "body_z", "root_ori"];

  const thead = `
    <thead>
      <tr>
        <th class="left">Policy</th>
        <th>Failed Clips</th>
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
          return `<td class="cell-click" data-fpol="${esc(r.policy_id)}" data-ftag="${esc(c)}" title="Inspect ${esc(pName(r.policy_id))} clips with ${c}"><strong>${cnt}</strong></td>`;
        })
        .join("");
      return `
        <tr>
          <td class="left"><button class="method-btn" data-fpol="${esc(r.policy_id)}" data-ftag="failed">${esc(pName(r.policy_id))}</button></td>
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
    `<option value="all">All Objects (${objs.length})</option>` +
    objs.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("");

  document.getElementById("clip-inter-filter").innerHTML =
    `<option value="all">All Interaction Types</option>` +
    inters.map((i) => `<option value="${esc(i)}">${esc(INTER_LABELS[i] || i)}</option>`).join("");

  document.getElementById("clip-policy-filter").innerHTML =
    `<option value="all">All Policies</option>` +
    pids.map((p) => `<option value="${esc(p)}">${esc(pName(p))}</option>`).join("");

  const opts = pids.map((p) => `<option value="${esc(p)}">${esc(pName(p))}</option>`).join("");
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

  document.getElementById("clip-count").textContent = `Matched ${filtered.length} / ${clips.length} clips`;
  const listEl = document.getElementById("clip-list");
  if (!filtered.length) {
    state.selectedClip = null;
    listEl.innerHTML = `<div class="empty-msg">No matching clips</div>`;
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
            <span class="tag-pill ${cls}">${succ}/${pids.length} passed</span>
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
    el.innerHTML = `<div class="empty-msg">Select a clip on the left to inspect cross-policy diagnostics</div>`;
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
      if (!r) return `<tr class="${hl}"><td class="left mono">${esc(pName(pid))}</td><td colspan="6">—</td></tr>`;
      const badge = r.success
        ? `<span class="tag-pill tag-green">Success</span>`
        : `<span class="tag-pill tag-coral">${esc((r.fail_reasons || []).join(", ") || r.fail_reason)}</span>`;
      const contact = r.contact_exempt ? "Exempt" : r.contact_recall != null ? fmtPct(r.contact_recall) : "—";
      return `
        <tr class="${hl}">
          <td class="left mono" style="font-weight:600;">${esc(pName(pid))}${hasVid ? ` <span class="tag-pill tag-blue">Video</span>` : ""}</td>
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
          <strong style="font-size:13px;">Ghost Replay (Policy: <span class="mono">${esc(pName(matchedVid.policy_id))}</span>)</strong>
          <span class="tag-pill tag-blue">${matchedVid.size_mb} MB</span>
        </div>
        <video controls preload="metadata" poster="${esc(matchedVid.poster_url || "")}" style="width:100%;max-height:340px;border-radius:8px;background:#0f172a;">
          <source src="${esc(matchedVid.video_url)}" type="video/mp4" />
        </video>
      </div>
    `;
  } else if (clipVids.length && state.highlightPolicy) {
    vidHtml = `<div style="margin-top:12px;font-size:12px;color:var(--muted);">No video recorded for <code>${esc(pName(state.highlightPolicy))}</code> on this clip (recorded: ${clipVids.map((v) => pName(v.policy_id)).join(", ")}).</div>`;
  }

  el.innerHTML = `
    <div style="margin-bottom:12px;">
      <div class="mono" style="font-size:14.5px;font-weight:700;">${esc(clip.clip)}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px;">
        Package: ${esc(clip.package)} · Object: ${esc(clip.object)} · Type: ${esc(INTER_LABELS[clip.interaction_type] || clip.interaction_type)} · Frames: ${clip.frames ?? "—"}
      </div>
    </div>
    <div class="table-wrap">
      <table class="rt-table compact-table">
        <thead>
          <tr>
            <th class="left">Policy</th>
            <th>Status</th>
            <th>Episode Score</th>
            <th>Quality</th>
            <th>Rel Pos Err m (Mean/Final)</th>
            <th>Rel Ori Err rad (Mean/Final)</th>
            <th>Contact Recall</th>
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
    `<button class="chip ${state.videoObj === "all" ? "active" : ""}" data-vobj="all">All (${vids.length})</button>` +
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
            <span class="tag-pill ${v.success ? "tag-green" : "tag-coral"}">${v.success ? `Score ${fmtNum(v.episode_score, 1)}` : "Fail (0)"}</span>
          </div>
          <div class="video-meta">
            <span class="mono">${esc(pName(v.policy_id))}</span>
            <span>Mean pos err ${v.obj_pos_err_mean != null ? `${fmtNum(v.obj_pos_err_mean, 3)} m` : "—"}</span>
          </div>
          <button type="button" class="btn-subtle" data-vc="${esc(v.clip)}" data-vp="${esc(v.policy_id)}">Inspect Diagnostics →</button>
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
        <th class="left">Policy</th>
        <th class="left">Modality</th>
        <th>Added</th>
        <th>Backend</th>
        <th class="left">ONNX SHA256</th>
      </tr>
    </thead>
    <tbody>
      ${policies
        .map(
          (p) => `
        <tr>
          <td class="left mono" style="font-weight:600;">${esc(p.label || p.id)}</td>
          <td class="left">${esc(p.modality)}</td>
          <td class="mono" style="color:var(--muted);">${esc(p.added_date || "—")}</td>
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

/* 8. News */
function renderNews() {
  const items = state.siteData.news || [];
  document.getElementById("news-list").innerHTML = items
    .map(
      (n) => `
      <li class="news-item">
        <span class="news-date">${esc(n.date)}</span>
        <span><span class="tag-pill ${n.tag === "Policies Added" ? "tag-green" : "tag-blue"}">${esc(n.tag)}</span></span>
        <span class="news-text">${esc(n.text)}</span>
      </li>
    `
    )
    .join("");
}

init().catch((err) => {
  document.getElementById("setting-desc").textContent = `Load error: ${err.message}`;
});
