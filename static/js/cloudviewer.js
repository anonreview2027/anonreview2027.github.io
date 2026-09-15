/* Lightweight orbit viewer for a labelled point cloud + camera trajectory.
   Pure 2D canvas, no dependencies.

   Default content is a synthetic room (same objects as placeholders.js) in
   three states. Set `data-ply` on the container to a downsampled ASCII PLY
   (x y z red green blue [label]) and the viewer will load it instead; per-state
   files can be given as a comma-separated list in state order. */

(function (global) {
  "use strict";

  const INSTANCE_COLORS = {
    floor: "#c5b0d5", wall: "#9aa0a6", window: "#17becf", shelf: "#8c564b",
    table: "#ff7f0e", chair: "#1f77b4", plant: "#2ca02c", box: "#d62728",
    stool: "#7f7f7f", mug: "#bcbd22",
  };
  const RGB_COLORS = {
    floor: "#b09a7e", wall: "#d8d2c8", window: "#bcd6e8", shelf: "#8a6f52",
    table: "#a5713f", chair: "#5b7d9a", plant: "#5d8a4a", box: "#c2554f",
    stool: "#6d6d6d", mug: "#e0b23e",
  };

  function rand(seed) {
    // deterministic LCG so the cloud is identical on every load
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function boxPoints(pts, id, x0, y0, z0, x1, y1, z1, n, rnd) {
    for (let i = 0; i < n; i++) {
      // sample on the surface of the box (pick a face)
      const f = Math.floor(rnd() * 6);
      let x = x0 + rnd() * (x1 - x0);
      let y = y0 + rnd() * (y1 - y0);
      let z = z0 + rnd() * (z1 - z0);
      if (f === 0) x = x0; else if (f === 1) x = x1;
      else if (f === 2) y = y0; else if (f === 3) y = y1;
      else if (f === 4) z = z0; else z = z1;
      pts.push([x, y, z, id]);
    }
  }

  /* Room: x right, y forward (depth), z up. 5 m × 4 m × 2.8 m. */
  function syntheticCloud(state) {
    const rnd = rand(42 + state);
    const pts = [];
    // floor & walls (static)
    for (let i = 0; i < 2600; i++) pts.push([rnd() * 5, rnd() * 4, 0, "floor"]);
    for (let i = 0; i < 1400; i++) pts.push([rnd() * 5, 4, rnd() * 2.8, "wall"]);
    for (let i = 0; i < 1000; i++) pts.push([0, rnd() * 4, rnd() * 2.8, "wall"]);
    for (let i = 0; i < 300; i++) pts.push([3.6 + rnd() * 1.1, 4, 1.0 + rnd() * 1.2, "window"]);
    boxPoints(pts, "shelf", 0.05, 0.4, 0.0, 0.35, 1.6, 1.9, 500, rnd);
    boxPoints(pts, "plant", 4.4, 3.4, 0.0, 4.9, 3.9, 1.1, 260, rnd);

    // table: relocated in state 2
    const tx = state === 1 ? 1.4 : 2.6;
    boxPoints(pts, "table", tx, 2.2, 0.72, tx + 1.6, 3.0, 0.76, 500, rnd);
    for (const [lx, ly] of [[tx + 0.05, 2.25], [tx + 1.5, 2.25], [tx + 0.05, 2.95], [tx + 1.5, 2.95]]) {
      boxPoints(pts, "table", lx, ly, 0, lx + 0.05, ly + 0.05, 0.72, 60, rnd);
    }
    // chair: only in state 1
    if (state === 1) {
      boxPoints(pts, "chair", 0.8, 1.2, 0.42, 1.3, 1.7, 0.48, 160, rnd);
      boxPoints(pts, "chair", 0.8, 1.65, 0.48, 1.3, 1.7, 1.0, 140, rnd);
    }
    // stool: added in state 3 (between the shelf and the table, as in the SVG placeholders)
    if (state === 3) boxPoints(pts, "stool", 1.6, 1.2, 0.0, 2.05, 1.65, 0.45, 220, rnd);
    // box on table: relocated in state 3
    const bx = state === 3 ? tx + 1.1 : tx + 0.2;
    boxPoints(pts, "box", bx, 2.4, 0.76, bx + 0.3, 2.7, 1.0, 180, rnd);
    // mug: added in state 3
    if (state === 3) boxPoints(pts, "mug", tx + 0.6, 2.55, 0.76, tx + 0.7, 2.65, 0.88, 60, rnd);
    return pts;
  }

  /* Handheld loop through the room at ~1.4 m, looking inward. */
  function syntheticPoses(state, light) {
    const poses = [];
    const n = 28;
    const phase = ((state - 1) * 2 + (light === "nat" ? 1 : 0)) * 0.12;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2 + phase;
      const x = 2.5 + Math.cos(t) * 1.6;
      const y = 1.7 + Math.sin(t) * 1.0;
      const z = 1.35 + Math.sin(t * 3 + phase) * 0.08;
      // look towards room centre
      const yaw = Math.atan2(2.4 - y, 2.5 - x);
      poses.push({ p: [x, y, z], yaw });
    }
    return poses;
  }

  async function loadPLY(url) {
    const txt = await (await fetch(url)).text();
    const lines = txt.split(/\r?\n/);
    let i = 0;
    let count = 0;
    const props = [];
    for (; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l.startsWith("element vertex")) count = parseInt(l.split(/\s+/)[2], 10);
      else if (l.startsWith("property")) props.push(l.split(/\s+/)[2]);
      else if (l === "end_header") { i++; break; }
    }
    const ix = props.indexOf("x"), iy = props.indexOf("y"), iz = props.indexOf("z");
    const ir = props.indexOf("red"), ig = props.indexOf("green"), ib = props.indexOf("blue");
    const il = props.indexOf("label") >= 0 ? props.indexOf("label") : props.indexOf("instance");
    const pts = [];
    for (let k = 0; k < count && i < lines.length; k++, i++) {
      const c = lines[i].trim().split(/\s+/);
      if (c.length < 3) continue;
      const rgb = ir >= 0 ? [+c[ir], +c[ig], +c[ib]] : [180, 180, 180];
      pts.push([+c[ix], +c[iy], +c[iz], il >= 0 ? c[il] : "0", rgb]);
    }
    return pts;
  }

  function labelColor(id) {
    // stable pseudo-random color for unknown labels (real PLY)
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const hue = h % 360;
    return `hsl(${hue} 65% 55%)`;
  }

  function attach(container) {
    const canvas = container.querySelector("canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const view = { yaw: -0.7, pitch: 0.55, dist: 7.5, target: [2.5, 2.0, 0.9] };
    const home = JSON.parse(JSON.stringify(view));
    const PITCH_MAX = 1.5;   // ±86°: from straight above to straight below
    const DIST_MIN = 0.8;
    const DIST_MAX = 24;
    let lastProj = null;     // screen positions from the last draw (for focus-on-click)
    let state = 1;
    let colorMode = "instance";
    let showPoses = true;
    let clouds = { 1: null, 2: null, 3: null };
    let colorCache = {};
    let raf = 0;

    const plyList = (container.dataset.ply || "").split(",").map((s) => s.trim()).filter(Boolean);

    async function cloudFor(s) {
      if (clouds[s]) return clouds[s];
      if (plyList.length) {
        const url = plyList[Math.min(s - 1, plyList.length - 1)];
        try {
          clouds[s] = await loadPLY(url);
        } catch (e) {
          clouds[s] = syntheticCloud(s);
        }
      } else {
        clouds[s] = syntheticCloud(s);
      }
      return clouds[s];
    }

    function resize() {
      const r = container.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      requestDraw();
    }

    function project(x, y, z) {
      // orbit camera around target
      const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
      const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
      const dx = x - view.target[0], dy = y - view.target[1], dz = z - view.target[2];
      // rotate around z (yaw)
      const rx = dx * cy - dy * sy;
      const ry = dx * sy + dy * cy;
      // rotate around x (pitch): the camera sits above and in front of the
      // target and looks down at it (view direction (0, cp, -sp), up (0, sp, cp))
      const depth = ry * cp - dz * sp + view.dist;
      const sz = ry * sp + dz * cp;
      if (depth <= 0.1) return null;
      const f = canvas.height * 0.9;
      return [canvas.width / 2 + (rx / depth) * f, canvas.height / 2 - (sz / depth) * f, depth];
    }

    function colorOf(pt) {
      const key = colorMode + ":" + pt[3];
      if (colorCache[key]) return colorCache[key];
      let c;
      if (colorMode === "rgb") {
        c = pt[4] ? `rgb(${pt[4][0]},${pt[4][1]},${pt[4][2]})` : RGB_COLORS[pt[3]] || "#bbb";
      } else {
        c = INSTANCE_COLORS[pt[3]] || labelColor(pt[3]);
      }
      colorCache[key] = c;
      return c;
    }

    function draw() {
      raf = 0;
      const pts = clouds[state];
      ctx.fillStyle = "#141821";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!pts) return;

      const size = Math.max(1.5, canvas.height / 260) * dpr;
      // draw far-to-near for a cheap occlusion cue
      const proj = new Array(pts.length);
      for (let i = 0; i < pts.length; i++) proj[i] = project(pts[i][0], pts[i][1], pts[i][2]);
      lastProj = proj;
      const order = pts.map((_, i) => i).filter((i) => proj[i]).sort((a, b) => proj[b][2] - proj[a][2]);
      for (const i of order) {
        const p = proj[i];
        const s = size * (view.dist / p[2]);
        ctx.fillStyle = colorOf(pts[i]);
        ctx.fillRect(p[0] - s / 2, p[1] - s / 2, s, s);
      }

      if (showPoses) {
        ctx.lineWidth = 1.5 * dpr;
        // state 3 is captured under natural light only (core 2x2 + state3_nat)
        const lights = state === 3 ? ["nat"] : ["art", "nat"];
        for (const light of lights) {
          const poses = syntheticPoses(state, light);
          ctx.strokeStyle = light === "art" ? "#ffcf4d" : "#7fd4ff";
          ctx.beginPath();
          poses.forEach((q, i) => {
            const p = project(q.p[0], q.p[1], q.p[2]);
            if (!p) return;
            if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
          });
          ctx.closePath();
          ctx.stroke();
          poses.forEach((q, i) => {
            if (i % 4) return;
            const o = project(q.p[0], q.p[1], q.p[2]);
            const a = project(q.p[0] + Math.cos(q.yaw + 0.35) * 0.25, q.p[1] + Math.sin(q.yaw + 0.35) * 0.25, q.p[2] - 0.08);
            const b = project(q.p[0] + Math.cos(q.yaw - 0.35) * 0.25, q.p[1] + Math.sin(q.yaw - 0.35) * 0.25, q.p[2] - 0.08);
            const c = project(q.p[0] + Math.cos(q.yaw) * 0.25, q.p[1] + Math.sin(q.yaw) * 0.25, q.p[2] + 0.12);
            if (!o || !a || !b || !c) return;
            ctx.beginPath();
            ctx.moveTo(o[0], o[1]); ctx.lineTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(b[0], b[1]); ctx.closePath();
            ctx.moveTo(o[0], o[1]); ctx.lineTo(c[0], c[1]);
            ctx.stroke();
          });
        }
        // legend
        ctx.font = `${11 * dpr}px "Google Sans", sans-serif`;
        if (lights.includes("art")) {
          ctx.fillStyle = "#ffcf4d";
          ctx.fillRect(12 * dpr, canvas.height - 40 * dpr, 14 * dpr, 3 * dpr);
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.fillText(`state${state}_art trajectory`, 32 * dpr, canvas.height - 36 * dpr);
        }
        ctx.fillStyle = "#7fd4ff";
        ctx.fillRect(12 * dpr, canvas.height - 24 * dpr, 14 * dpr, 3 * dpr);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(`state${state}_nat trajectory`, 32 * dpr, canvas.height - 20 * dpr);
      }
    }

    function requestDraw() {
      if (!raf) raf = requestAnimationFrame(draw);
    }

    /* ---------- camera helpers ---------- */

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // screen-aligned world axes for the current orientation (see project())
    function axes() {
      const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
      const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
      return { right: [cy, -sy, 0], up: [sy * sp, cy * sp, cp] };
    }

    // world units per CSS pixel in the plane of the target
    function unitsPerPixel() {
      return (view.dist / (canvas.height * 0.9)) * dpr;
    }

    function orbit(dxPx, dyPx) {
      view.yaw += dxPx * 0.01;
      view.pitch = clamp(view.pitch + dyPx * 0.008, -PITCH_MAX, PITCH_MAX);
    }

    function pan(dxPx, dyPx) {
      const k = unitsPerPixel();
      const { right, up } = axes();
      for (let i = 0; i < 3; i++) view.target[i] += -right[i] * dxPx * k + up[i] * dyPx * k;
    }

    // zoom by `factor`, keeping the point under the cursor (clientX/Y) in place
    function zoomAt(factor, clientX, clientY) {
      const next = clamp(view.dist * factor, DIST_MIN, DIST_MAX);
      if (clientX != null) {
        const r = canvas.getBoundingClientRect();
        const f = canvas.height * 0.9;
        const px = (clientX - r.left) * dpr - canvas.width / 2;
        const py = (clientY - r.top) * dpr - canvas.height / 2;
        const ox = (px / f) * view.dist;
        const oy = (-py / f) * view.dist;
        const k = 1 - next / view.dist;
        const { right, up } = axes();
        for (let i = 0; i < 3; i++) view.target[i] += (right[i] * ox + up[i] * oy) * k;
      }
      view.dist = next;
    }

    // re-centre on the cloud point nearest to a click and step closer
    function focusAt(clientX, clientY) {
      const pts = clouds[state];
      if (!pts || !lastProj) return false;
      const r = canvas.getBoundingClientRect();
      const px = (clientX - r.left) * dpr;
      const py = (clientY - r.top) * dpr;
      const radius = 18 * dpr;
      let best = -1;
      let bestD = radius * radius;
      for (let i = 0; i < pts.length; i++) {
        const p = lastProj[i];
        if (!p) continue;
        const d = (p[0] - px) ** 2 + (p[1] - py) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) return false;
      view.target = [pts[best][0], pts[best][1], pts[best][2]];
      view.dist = Math.max(DIST_MIN * 2, view.dist * 0.6);
      return true;
    }

    /* ---------- mouse / pen / touch ---------- */

    // orbit: left drag · pan: ctrl/shift/alt + drag, middle or right button,
    // two-finger drag · zoom: wheel, pinch · focus: double-click
    const pointers = new Map(); // active pointers (for pinch)
    let drag = null;
    let pinch = null;

    function beginDrag(e) {
      const isPan = e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || e.button === 1 || e.button === 2;
      drag = { x: e.clientX, y: e.clientY, pan: isPan };
    }

    canvas.addEventListener("pointerdown", (e) => {
      canvas.focus({ preventScroll: true });
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events have no active pointer */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        drag = null;
      } else if (pointers.size === 1) {
        beginDrag(e);
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (d > 0 && pinch.d > 0) zoomAt(pinch.d / d, mx, my);
        pan(mx - pinch.mx, my - pinch.my);
        pinch = { d, mx, my };
      } else if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (drag.pan) pan(dx, dy); else orbit(dx, dy);
        drag.x = e.clientX; drag.y = e.clientY;
      }
      requestDraw();
    });
    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) drag = null;
      else if (pointers.size === 1) {
        // back to a single finger: restart the drag from its current position
        const [p] = [...pointers.values()];
        drag = { x: p.x, y: p.y, pan: false };
      }
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("dblclick", (e) => {
      e.preventDefault();
      if (focusAt(e.clientX, e.clientY)) requestDraw();
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      // trackpads send many small deltas; mice a few large ones
      const step = clamp(Math.abs(e.deltaY) / 100, 0.15, 1);
      zoomAt(1 + Math.sign(e.deltaY) * 0.12 * step, e.clientX, e.clientY);
      requestDraw();
    }, { passive: false });

    /* ---------- keyboard (canvas is focusable) ---------- */

    // arrows / WASD pan · Q E turn · R F tilt · + − zoom · 0 reset
    canvas.tabIndex = 0;
    canvas.addEventListener("keydown", (e) => {
      const stepPx = e.shiftKey ? 60 : 20;
      const k = e.key.toLowerCase();
      let handled = true;
      if (k === "arrowleft" || k === "a") pan(stepPx, 0);
      else if (k === "arrowright" || k === "d") pan(-stepPx, 0);
      else if (k === "arrowup" || k === "w") pan(0, stepPx);
      else if (k === "arrowdown" || k === "s") pan(0, -stepPx);
      else if (k === "q") orbit(-stepPx * 1.5, 0);
      else if (k === "e") orbit(stepPx * 1.5, 0);
      else if (k === "r") orbit(0, -stepPx);
      else if (k === "f") orbit(0, stepPx);
      else if (k === "+" || k === "=") zoomAt(0.85);
      else if (k === "-" || k === "_") zoomAt(1 / 0.85);
      else if (k === "0" || k === "home") Object.assign(view, JSON.parse(JSON.stringify(home)));
      else handled = false;
      if (handled) { e.preventDefault(); stopIdle(); requestDraw(); }
    });

    // toolbar
    container.querySelectorAll("[data-cv-state]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        container.querySelectorAll("[data-cv-state]").forEach((b) => b.classList.toggle("is-selected-mode", b === btn));
        state = parseInt(btn.dataset.cvState, 10);
        await cloudFor(state);
        requestDraw();
      });
    });
    container.querySelectorAll("[data-cv-color]").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll("[data-cv-color]").forEach((b) => b.classList.toggle("is-selected-mode", b === btn));
        colorMode = btn.dataset.cvColor;
        requestDraw();
      });
    });
    const posesBox = container.querySelector("[data-cv-poses]");
    if (posesBox) posesBox.addEventListener("change", () => { showPoses = posesBox.checked; requestDraw(); });
    const reset = container.querySelector("[data-cv-reset]");
    if (reset) reset.addEventListener("click", () => { Object.assign(view, JSON.parse(JSON.stringify(home))); requestDraw(); });

    // idle auto-rotate until the first interaction
    let idle = true;
    function stopIdle() { idle = false; }
    canvas.addEventListener("pointerdown", stopIdle, { once: true });
    canvas.addEventListener("wheel", stopIdle, { once: true });
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function spin() {
      if (!idle || reduce) return;
      view.yaw += 0.0025;
      requestDraw();
      requestAnimationFrame(spin);
    }

    container.sgdView = view; // read-only debugging handle (tests, console)

    window.addEventListener("resize", resize);
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(container);
    resize();
    cloudFor(1).then(() => { requestDraw(); spin(); });
  }

  global.SGDCloudViewer = { attach, syntheticCloud, syntheticPoses };
})(window);
