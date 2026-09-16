/* Minimal SVG bar charts for the DACHA page.
   Grouped (optionally stacked) columns with a legend, hover tooltip, and a
   table-view toggle. No dependencies. */

(function (global) {
  "use strict";

  const FONT = 'font-family="Google Sans, sans-serif"';

  // Charts re-render on resize so text stays ~11px at any container width
  // (an SVG viewBox alone would shrink labels on phones).
  const registry = [];
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => registry.forEach((fn) => fn()), 150);
  });

  function register(el, render) {
    if (!el.__sgdChart) registry.push(() => render());
    el.__sgdChart = true;
  }

  function containerWidth(el, fallback) {
    const w = el.clientWidth - 24; // .chart horizontal padding
    return w > 0 ? Math.max(300, Math.min(fallback, w)) : fallback;
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }

  function fmt(v, digits) {
    if (v == null || Number.isNaN(v)) return "—";
    return Number(v).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  /* opts:
       el         container element (or selector)
       categories [{ label, sub? }]                 x groups
       series     [{ name, color, values[], stackOn? }]  stackOn: name of the
                  series this one stacks on top of (drawn in the same column)
       max        y max (default: nice max of stacked totals)
       height     svg height (default 240)
       yLabel     axis caption
       digits     decimals in labels (default 1)
       valueSuffix e.g. "%"
       labelValues boolean: print value on each column cap (default true)
       barMax     max column thickness (default 24)
       note       small text under the chart */
  function barChart(opts) {
    const el = typeof opts.el === "string" ? document.querySelector(opts.el) : opts.el;
    if (!el) return;
    register(el, () => barChart(opts));
    const cats = opts.categories;
    const series = opts.series;
    const digits = opts.digits == null ? 1 : opts.digits;
    const suffix = opts.valueSuffix || "";
    const height = opts.height || 240;
    const width = containerWidth(el, 560);
    const padL = 42;
    const padR = 8;
    const padT = 14;
    const padB = cats.some((c) => c.sub) ? 40 : 26;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    // columns: series not stacking on another get a slot; stacked ones share it
    const slots = series.filter((s) => !s.stackOn);
    const slotIndex = {};
    slots.forEach((s, i) => (slotIndex[s.name] = i));
    const totals = cats.map((_, ci) =>
      slots.map((s) => {
        let t = s.values[ci] || 0;
        series.filter((x) => x.stackOn === s.name).forEach((x) => (t += x.values[ci] || 0));
        return t;
      })
    );
    const yMax = opts.max || niceMax(Math.max(...totals.flat()) * 1.12);
    const y = (v) => padT + plotH - (v / yMax) * plotH;

    const groupW = plotW / cats.length;
    const gap = 2;
    const barW = Math.min(opts.barMax || 24, (groupW * 0.72 - gap * (slots.length - 1)) / slots.length);
    const groupInner = barW * slots.length + gap * (slots.length - 1);

    // gridlines
    const ticks = 4;
    let grid = "";
    for (let i = 0; i <= ticks; i++) {
      const v = (yMax / ticks) * i;
      const yy = y(v);
      grid += `<line class="grid-line" x1="${padL}" x2="${width - padR}" y1="${yy}" y2="${yy}"/>`;
      grid += `<text class="tick-text" x="${padL - 6}" y="${yy + 3.5}" text-anchor="end">${fmt(v, v % 1 ? 1 : 0)}${suffix}</text>`;
    }

    let bars = "";
    let labels = "";
    let hits = "";
    const hitData = [];
    cats.forEach((c, ci) => {
      const gx = padL + groupW * ci + (groupW - groupInner) / 2;
      slots.forEach((s, si) => {
        const x = gx + si * (barW + gap);
        const parts = [s].concat(series.filter((x2) => x2.stackOn === s.name));
        let base = 0;
        parts.forEach((p, pi) => {
          const v = p.values[ci];
          if (v == null) return;
          const top = y(base + v);
          const h = Math.max(0, y(base) - top - (pi > 0 ? gap : 0));
          const r = pi === parts.length - 1 ? 4 : 0;
          bars += `<path class="bar" data-hit="${hitData.length}" fill="${p.color}" d="${roundedTop(x, top, barW, h, r)}"/>`;
          hitData.push({ cat: c.label, series: p.name, value: v, color: p.color });
          hits += `<rect class="bar-hit" data-hit="${hitData.length - 1}" x="${x - gap}" y="${padT}" width="${barW + gap * 2}" height="${plotH}"/>`;
          base += v;
        });
        if (opts.labelValues !== false && base > 0) {
          labels += `<text class="val-label" x="${x + barW / 2}" y="${y(base) - 4}" text-anchor="middle">${fmt(base, digits)}${suffix}</text>`;
        }
      });
      const cx = padL + groupW * ci + groupW / 2;
      labels += `<text class="cat-label" x="${cx}" y="${padT + plotH + 14}" text-anchor="middle">${esc(c.label)}</text>`;
      if (c.sub) labels += `<text class="cat-label" x="${cx}" y="${padT + plotH + 27}" text-anchor="middle" fill="#898781" font-size="10">${esc(c.sub)}</text>`;
    });

    const legend =
      series.length > 1
        ? `<div class="chart-legend">${series
            .map((s) => `<span><i class="key" style="background:${s.color}"></i>${esc(s.name)}</span>`)
            .join("")}</div>`
        : "";

    const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.aria || "Bar chart")}" ${FONT}>
        <style>.grid-line{stroke:#e1e0d9;stroke-width:1}.tick-text{fill:#898781;font-size:10.5px}</style>
        ${grid}
        <line class="baseline" x1="${padL}" x2="${width - padR}" y1="${y(0)}" y2="${y(0)}"/>
        ${bars}${labels}${hits}
      </svg>`;

    const tableRows = cats
      .map((c, ci) => `<tr><td>${esc(c.label)}${c.sub ? ` <small>${esc(c.sub)}</small>` : ""}</td>${series
        .map((s) => `<td>${fmt(s.values[ci], digits)}${s.values[ci] == null ? "" : suffix}</td>`)
        .join("")}</tr>`)
      .join("");
    const table = `<table class="chart-table" hidden><thead><tr><th></th>${series
      .map((s) => `<th>${esc(s.name)}</th>`)
      .join("")}</tr></thead><tbody>${tableRows}</tbody></table>`;

    el.innerHTML = `${legend}<div class="chart-plot">${svg}</div>${table}
      <div class="chart-tooltip" role="status"></div>
      <div class="chart-foot"><span>${esc(opts.note || "")}</span><button type="button" class="chart-table-toggle">table view</button></div>`;

    // interactions
    const tip = el.querySelector(".chart-tooltip");
    const plot = el.querySelector(".chart-plot");
    const barEls = el.querySelectorAll(".bar");
    function show(i, evt) {
      const d = hitData[i];
      if (!d) return;
      tip.innerHTML = `${esc(d.cat)} · ${esc(d.series)}<br><b>${fmt(d.value, digits)}${suffix}</b>`;
      tip.classList.add("is-visible");
      const r = el.getBoundingClientRect();
      tip.style.left = `${evt.clientX - r.left}px`;
      tip.style.top = `${evt.clientY - r.top}px`;
      el.classList.add("is-hovering");
      barEls.forEach((b) => b.classList.toggle("is-hover", b.dataset.hit === String(i)));
    }
    function hide() {
      tip.classList.remove("is-visible");
      el.classList.remove("is-hovering");
      barEls.forEach((b) => b.classList.remove("is-hover"));
    }
    plot.addEventListener("pointermove", (e) => {
      const t = e.target.closest("[data-hit]");
      if (t) show(parseInt(t.dataset.hit, 10), e);
      else hide();
    });
    plot.addEventListener("pointerleave", hide);

    const tbl = el.querySelector(".chart-table");
    const btn = el.querySelector(".chart-table-toggle");
    btn.addEventListener("click", () => {
      const showTable = tbl.hidden;
      tbl.hidden = !showTable;
      plot.hidden = showTable;
      btn.textContent = showTable ? "chart view" : "table view";
    });
  }

  function roundedTop(x, y, w, h, r) {
    if (h <= 0) return "";
    const rr = Math.min(r, h, w / 2);
    return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
  }

  /* Horizontal bars for a single ordered series (room types, per-scene counts). */
  function hbarChart(opts) {
    const el = typeof opts.el === "string" ? document.querySelector(opts.el) : opts.el;
    if (!el) return;
    register(el, () => hbarChart(opts));
    const items = opts.items; // [{label, value, sub?}]
    const width = containerWidth(el, 560);
    const rowH = opts.rowH || 20;
    const padL = opts.padL || 110;
    const padR = 44;
    const padT = 6;
    const height = padT + items.length * rowH + 6;
    const max = opts.max || niceMax(Math.max(...items.map((i) => i.value)));
    const plotW = width - padL - padR;
    const color = opts.color || "#2a78d6";
    const barH = Math.min(14, rowH - 4);

    let body = "";
    const hitData = [];
    items.forEach((it, i) => {
      const yy = padT + i * rowH + (rowH - barH) / 2;
      const w = (it.value / max) * plotW;
      body += `<text class="cat-label" x="${padL - 8}" y="${yy + barH / 2 + 4}" text-anchor="end">${esc(it.label)}</text>`;
      body += `<path class="bar" data-hit="${i}" fill="${it.color || color}" d="${roundedRight(padL, yy, w, barH, 4)}"/>`;
      body += `<text class="val-label" x="${padL + w + 5}" y="${yy + barH / 2 + 4}">${fmt(it.value, 0)}${it.suffix || ""}</text>`;
      body += `<rect class="bar-hit" data-hit="${i}" x="0" y="${padT + i * rowH}" width="${width}" height="${rowH}"/>`;
      hitData.push(it);
    });

    const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.aria || "Bar chart")}" ${FONT}>
        <line class="baseline" x1="${padL}" x2="${padL}" y1="${padT}" y2="${height - 6}"/>
        ${body}
      </svg>`;
    const table = `<table class="chart-table" hidden><thead><tr><th>${esc(opts.labelHeader || "")}</th><th>${esc(opts.valueHeader || "value")}</th></tr></thead><tbody>${items
      .map((it) => `<tr><td>${esc(it.label)}${it.sub ? ` <small>${esc(it.sub)}</small>` : ""}</td><td>${fmt(it.value, 0)}</td></tr>`)
      .join("")}</tbody></table>`;

    el.innerHTML = `<div class="chart-plot">${svg}</div>${table}<div class="chart-tooltip" role="status"></div>
      <div class="chart-foot"><span>${esc(opts.note || "")}</span><button type="button" class="chart-table-toggle">table view</button></div>`;

    const tip = el.querySelector(".chart-tooltip");
    const plot = el.querySelector(".chart-plot");
    const barEls = el.querySelectorAll(".bar");
    plot.addEventListener("pointermove", (e) => {
      const t = e.target.closest("[data-hit]");
      if (!t) return hideTip();
      const d = hitData[parseInt(t.dataset.hit, 10)];
      tip.innerHTML = `${esc(d.label)}${d.sub ? ` · ${esc(d.sub)}` : ""}<br><b>${fmt(d.value, 0)}${d.suffix || ""} ${esc(opts.valueHeader || "")}</b>`;
      tip.classList.add("is-visible");
      const r = el.getBoundingClientRect();
      tip.style.left = `${e.clientX - r.left}px`;
      tip.style.top = `${e.clientY - r.top}px`;
      el.classList.add("is-hovering");
      barEls.forEach((b) => b.classList.toggle("is-hover", b === t || b.dataset.hit === t.dataset.hit));
    });
    function hideTip() {
      tip.classList.remove("is-visible");
      el.classList.remove("is-hovering");
      barEls.forEach((b) => b.classList.remove("is-hover"));
    }
    plot.addEventListener("pointerleave", hideTip);
    const tbl = el.querySelector(".chart-table");
    const btn = el.querySelector(".chart-table-toggle");
    btn.addEventListener("click", () => {
      const showTable = tbl.hidden;
      tbl.hidden = !showTable;
      plot.hidden = showTable;
      btn.textContent = showTable ? "chart view" : "table view";
    });
  }

  function roundedRight(x, y, w, h, r) {
    if (w <= 0) return "";
    const rr = Math.min(r, w, h / 2);
    return `M${x},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} H${x} Z`;
  }

  global.SGDCharts = { barChart, hbarChart };
})(window);
