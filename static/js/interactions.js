/* Interactions for the SceneGraphDataset page */

(function () {
  "use strict";

  /* ---------- data ---------- */

  // Per-scene instance counts read off the paper's Fig. 5 (bar heights measured
  // on the PDF; total 2,301, mean 115, range 49–187). Room types per location
  // are provisional — verify against the release labelmaps.
  const scenes = [
    { id: 1, name: "Office", category: "work", instances: 51 },
    { id: 2, name: "Office", category: "work", instances: 81 },
    { id: 3, name: "Workspace", category: "work", instances: 117 },
    { id: 4, name: "Workshop", category: "special", instances: 187 },
    { id: 5, name: "Laboratory", category: "special", instances: 157 },
    { id: 6, name: "Laboratory", category: "special", instances: 164 },
    { id: 7, name: "Apartment", category: "home", instances: 109 },
    { id: 8, name: "Apartment", category: "home", instances: 101 },
    { id: 9, name: "Children's room", category: "home", instances: 105 },
    { id: 10, name: "Kitchen", category: "home", instances: 111 },
    { id: 11, name: "Bathroom", category: "home", instances: 94 },
    { id: 12, name: "Conference room", category: "work", instances: 85 },
    { id: 13, name: "Workspace", category: "work", instances: 99 },
    { id: 14, name: "Bathroom", category: "home", instances: 49 },
    { id: 15, name: "Kitchen", category: "home", instances: 68 },
    { id: 16, name: "Classroom", category: "work", instances: 167 },
    { id: 17, name: "Classroom", category: "work", instances: 141 },
    { id: 18, name: "Warehouse", category: "special", instances: 113 },
    { id: 19, name: "Kindergarten", category: "special", instances: 175 },
    { id: 20, name: "Workshop", category: "special", instances: 127 },
  ];

  // Unique display names: room types that occur more than once get a number
  // in location order ("Office 1", "Office 2"); single ones stay as they are.
  // `name` keeps the plain room type for the room-type chart.
  (function assignLabels() {
    const total = {};
    scenes.forEach((s) => (total[s.name] = (total[s.name] || 0) + 1));
    const seen = {};
    scenes
      .slice()
      .sort((a, b) => a.id - b.id)
      .forEach((s) => {
        seen[s.name] = (seen[s.name] || 0) + 1;
        s.label = total[s.name] > 1 ? `${s.name} ${seen[s.name]}` : s.name;
      });
  })();

  const categoryLabel = { work: "work & study", home: "home", special: "specialized" };

  const C = {
    added: "#008300",
    addedLight: "#7fc07f",
    moved: "#2a78d6",
    movedLight: "#93bbea",
    removed: "#e34948",
    removedLight: "#f2a3a2",
    s1: "#2a78d6",
    s2: "#eb6834",
    s3: "#1baf7a",
  };

  /* ---------- scene catalog ---------- */

  let activeFilter = "all";
  let activeSort = "id";

  function renderScenes() {
    const grid = document.querySelector("#scene-grid");
    if (!grid || !window.SGDPlaceholders) return;
    const maxInst = Math.max(...scenes.map((s) => s.instances));
    let visible = activeFilter === "all" ? scenes.slice() : scenes.filter((s) => s.category === activeFilter);
    if (activeSort === "instances") visible.sort((a, b) => b.instances - a.instances);
    else if (activeSort === "name") visible.sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
    else visible.sort((a, b) => a.id - b.id);

    grid.innerHTML = visible
      .map((scene) => {
        const number = String(scene.id).padStart(2, "0");
        const state = (scene.id % 3) + 1;
        const light = scene.id % 2 ? "art" : "nat";
        const svgInner = window.SGDPlaceholders.sceneSVG({
          mod: "rgb", state, light, variant: scene.id % 4, w: 320, h: 200,
        });
        return `
          <article class="scene-card" data-category="${scene.category}">
            <svg viewBox="0 0 320 200" aria-hidden="true">${svgInner}</svg>
            <div class="meta">
              <div class="loc">${scene.label}</div>
              <div class="sub">Location${number} · ${categoryLabel[scene.category]}</div>
              <div class="sub">${scene.instances} instances</div>
              <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${(scene.instances / maxInst) * 100}%"></div></div>
            </div>
          </article>`;
      })
      .join("");
  }

  function initFilters() {
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-filter]").forEach((item) => {
          item.classList.toggle("is-active-filter", item === button);
          item.setAttribute("aria-pressed", String(item === button));
        });
        activeFilter = button.dataset.filter;
        renderScenes();
      });
    });
    const sort = document.getElementById("scene-sort");
    if (sort) {
      sort.addEventListener("change", () => {
        activeSort = sort.value;
        renderScenes();
      });
    }
  }

  /* ---------- before/after slider ---------- */

  function initBeforeAfter(id) {
    const wrap = document.getElementById(id);
    if (!wrap) return;
    const top = wrap.querySelector(".ba-top");
    const handle = wrap.querySelector(".ba-handle");
    if (!top || !handle) return;

    function setPos(clientX) {
      const r = wrap.getBoundingClientRect();
      let p = (clientX - r.left) / r.width;
      p = Math.max(0.02, Math.min(0.98, p));
      top.style.clipPath = `inset(0 ${100 - p * 100}% 0 0)`;
      handle.style.left = `${p * 100}%`;
    }

    const r0 = wrap.getBoundingClientRect();
    setPos(r0.left + r0.width / 2);

    let dragging = false;
    wrap.addEventListener("pointerdown", (e) => {
      dragging = true;
      wrap.setPointerCapture(e.pointerId);
      setPos(e.clientX);
    });
    wrap.addEventListener("pointermove", (e) => {
      if (dragging) setPos(e.clientX);
    });
    const end = () => { dragging = false; };
    wrap.addEventListener("pointerup", end);
    wrap.addEventListener("pointercancel", end);
  }

  /* ---------- press-to-flip lighting tiles ---------- */

  function initLightTiles() {
    document.querySelectorAll(".light-tile").forEach((tile) => {
      const svg = tile.querySelector("svg.scene-ph");
      if (!svg || !window.SGDPlaceholders) return;
      const variant = parseInt(tile.dataset.variant || "0", 10);
      const render = (light) => {
        svg.innerHTML = window.SGDPlaceholders.sceneSVG({ mod: "rgb", state: 1, light, variant, w: 320, h: 200 });
        tile.classList.toggle("is-nat", light === "nat");
      };
      const toNat = () => render("nat");
      const toArt = () => render("art");
      tile.addEventListener("pointerenter", toNat);
      tile.addEventListener("pointerleave", toArt);
      tile.addEventListener("pointerdown", (e) => { e.preventDefault(); toNat(); });
      tile.addEventListener("pointerup", toArt);
      tile.addEventListener("pointercancel", toArt);
      // keyboard: focusable, toggles on Enter/Space
      tile.tabIndex = 0;
      tile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          tile.classList.contains("is-nat") ? toArt() : toNat();
        }
      });
    });
  }

  /* ---------- teaser matrix (2 × 2 core + state 3) ---------- */

  function initMatrix() {
    const matrix = document.getElementById("state-matrix");
    const toggle = document.getElementById("toggle-changes");
    if (!matrix || !toggle) return;
    toggle.addEventListener("change", () => matrix.classList.toggle("show-changes", toggle.checked));
  }

  /* ---------- charts ---------- */

  function initCharts() {
    const ch = window.SGDCharts;
    if (!ch) return;

    // Mean object changes per scene. Values transcribed from the paper's
    // state-transition figure (Fig. 7) — verify against the per-scene change lists.
    ch.barChart({
      el: "#chart-transitions",
      aria: "Mean number of added, relocated and removed objects per scene for each state transition",
      categories: [
        { label: "state 1 → 2", sub: "anchor objects only" },
        { label: "state 1 → 3", sub: "cumulative: anchor + clutter" },
      ],
      series: [
        { name: "added · anchor", color: C.added, values: [1.35, 2.0] },
        { name: "added · clutter", color: C.addedLight, values: [null, 2.15], stackOn: "added · anchor" },
        { name: "relocated · anchor", color: C.moved, values: [1.85, 2.45] },
        { name: "relocated · clutter", color: C.movedLight, values: [null, 3.15], stackOn: "relocated · anchor" },
        { name: "removed · anchor", color: C.removed, values: [1.25, 1.75] },
        { name: "removed · clutter", color: C.removedLight, values: [null, 2.15], stackOn: "removed · anchor" },
      ],
      height: 230,
      digits: 1,
      note: "mean objects per scene",
    });

    // Room-type distribution (paper Fig. 6)
    const byType = {};
    scenes.forEach((s) => {
      byType[s.name] = byType[s.name] || { count: 0, category: s.category };
      byType[s.name].count += 1;
    });
    ch.hbarChart({
      el: "#chart-locations",
      aria: "Number of scenes per room type",
      labelHeader: "room type",
      valueHeader: "scenes",
      items: Object.keys(byType)
        .sort((a, b) => byType[b].count - byType[a].count || a.localeCompare(b))
        .map((k) => ({ label: k, value: byType[k].count, sub: categoryLabel[byType[k].category] })),
      max: 3,
      rowH: 19,
      note: "20 scenes · 12 room types",
    });

    // Instances per scene (paper Fig. 5)
    ch.hbarChart({
      el: "#chart-instances",
      aria: "Labelled instances per scene",
      labelHeader: "scene",
      valueHeader: "instances",
      items: scenes
        .slice()
        .sort((a, b) => b.instances - a.instances)
        .map((s) => ({ label: `Loc${String(s.id).padStart(2, "0")} · ${s.label}`, value: s.instances })),
      rowH: 11.4,
      padL: 130,
      note: "mean 115 · range 49–187",
    });

    // SCD: F1 on pairs with real changes (paper Table SCD)
    ch.barChart({
      el: "#chart-scd",
      aria: "Scene change detection F1 score by target sequence and method",
      categories: [
        { label: "state2_art", sub: "layout change only" },
        { label: "state2_nat", sub: "layout + light" },
        { label: "state3_nat", sub: "layout + clutter + light" },
      ],
      series: [
        { name: "GeoSCD", color: C.s1, values: [0.53, 0.511, 0.59] },
        { name: "GeSCF", color: C.s2, values: [0.589, 0.586, 0.669] },
        { name: "RSCD", color: C.s3, values: [0.294, 0.262, 0.4] },
      ],
      max: 0.8,
      height: 220,
      digits: 2,
      note: "F1 · reference always rendered from state1_art",
    });

    // OVVIS: HOTA by split, averaged over six locations (paper Table OVVIS)
    ch.barChart({
      el: "#chart-ovvis",
      aria: "Open-vocabulary video instance segmentation HOTA by label split and method",
      categories: [
        { label: "All" },
        { label: "Common", sub: "frequent nouns" },
        { label: "Uncommon", sub: "long tail" },
        { label: "Small", sub: "< 0.1 m³" },
        { label: "Medium" },
        { label: "Large", sub: "≥ 1 m³" },
      ],
      series: [
        { name: "GLEE", color: C.s1, values: [2.77, 3.78, 1.25, 1.84, 3.42, 5.78] },
        { name: "Ov2Seg", color: C.s2, values: [1.59, 1.66, 1.48, 1.24, 2.52, 1.95] },
        { name: "SAM3", color: C.s3, values: [18.22, 21.77, 13.37, 13.39, 26.92, 32.46] },
      ],
      max: 40,
      height: 220,
      digits: 1,
      note: "HOTA · mean over Loc1–3, 5–6, 8",
    });

    // EQA: accuracy by category (paper Table EQA)
    ch.barChart({
      el: "#chart-eqa",
      aria: "Embodied question answering accuracy by question category and track",
      categories: [
        { label: "Existence", sub: "288 q" },
        { label: "Counting", sub: "286 q" },
        { label: "Comparison", sub: "289 q" },
        { label: "Localization", sub: "488 q" },
        { label: "Appearance", sub: "120 q" },
        { label: "Disappearance", sub: "146 q" },
        { label: "Movement", sub: "257 q" },
      ],
      series: [
        { name: "Qwen · LLM scene-graph track", color: C.s1, values: [96.5, 64.3, 70.9, 57.6, 69.2, 78.8, 59.1] },
        { name: "InternVL · VLM track", color: C.s2, values: [93.1, 62.6, 59.2, 34.8, 57.5, 41.1, 27.2] },
      ],
      max: 100,
      height: 230,
      digits: 1,
      valueSuffix: "",
      note: "accuracy, % · exact match, no partial credit",
    });
  }

  /* ---------- misc ---------- */

  function initNavBurger() {
    document.querySelectorAll(".navbar-burger").forEach((burger) => {
      burger.addEventListener("click", () => {
        const target = document.getElementById(burger.dataset.target);
        burger.classList.toggle("is-active");
        if (target) target.classList.toggle("is-active");
      });
    });
  }

  function initCloudViewer() {
    const el = document.getElementById("cloud-viewer");
    if (el && window.SGDCloudViewer) window.SGDCloudViewer.attach(el);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (window.SGDPlaceholders) window.SGDPlaceholders.fillScenePlaceholders();
    renderScenes();
    initFilters();
    initBeforeAfter("ba-diff-card");
    initLightTiles();
    initMatrix();
    initCharts();
    initCloudViewer();
    initNavBurger();
  });
})();
