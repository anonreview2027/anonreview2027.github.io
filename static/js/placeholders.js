/* SVG placeholder generator for the DACHA page.
   One synthetic room rendered as RGB / depth / mask / cloud / poses / change / topdown,
   in three cumulative states and two illumination conditions.

   Replacing with real data: give a `figure.ph` a `data-src` (image URL) and
   fillScenePlaceholders() swaps the SVG for an <img>. Real captures will NOT
   share an exact viewpoint across states/lighting (handheld sequences), so
   pick close frames manually. */

(function (global) {
  "use strict";

  /* Objects in the synthetic room. `change` marks what differs from the
     baseline state 1 (state 3 keeps the state-2 boxes and adds its own);
     state 1 itself carries no boxes. */
  function roomObjects(state) {
    const objs = [
      {
        id: "wall",
        d: 1.0,
        rgb: "#d8d2c8",
        mask: "#9aa0a6",
        shape: (r) => `<rect x="0" y="0" width="320" height="130" fill="${r}"/>`,
      },
      {
        id: "floor",
        d: 0.8,
        rgb: "#b09a7e",
        mask: "#c5b0d5",
        shape: (r) => `<rect x="0" y="130" width="320" height="70" fill="${r}"/>`,
      },
      {
        id: "window",
        d: 0.98,
        rgb: "#bcd6e8",
        mask: "#17becf",
        shape: (r) =>
          `<rect x="228" y="18" width="66" height="72" rx="3" fill="${r}" stroke="#8a8378" stroke-width="3"/>`,
      },
      {
        id: "shelf",
        d: 0.9,
        rgb: "#8a6f52",
        mask: "#8c564b",
        shape: (r) =>
          `<g fill="${r}"><rect x="18" y="26" width="70" height="8"/><rect x="18" y="52" width="70" height="8"/><rect x="18" y="26" width="6" height="76"/><rect x="82" y="26" width="6" height="76"/></g>`,
      },
    ];

    // table: relocated in state 2 (anchor change), stays there in state 3
    const tx = state === 1 ? 110 : 158;
    objs.push({
      id: "table",
      d: 0.45,
      rgb: "#a5713f",
      mask: "#ff7f0e",
      change: state >= 2 ? "moved" : null,
      box: [tx - 2, 108, 100, 62],
      tag: "bottom", // keep the label off the table top, where the clutter sits
      shape: (r) =>
        `<g fill="${r}"><rect x="${tx}" y="112" width="96" height="10" rx="2"/><rect x="${tx + 6}" y="122" width="8" height="46"/><rect x="${tx + 82}" y="122" width="8" height="46"/></g>`,
    });

    // chair: present in state 1, removed in state 2 (anchor change)
    if (state === 1) {
      objs.push({
        id: "chair",
        d: 0.35,
        rgb: "#5b7d9a",
        mask: "#1f77b4",
        shape: (r) =>
          `<g fill="${r}"><rect x="52" y="120" width="34" height="8" rx="2"/><rect x="52" y="92" width="8" height="34"/><rect x="54" y="128" width="6" height="36"/><rect x="78" y="128" width="6" height="36"/></g>`,
      });
    }

    objs.push({
      id: "plant",
      d: 0.6,
      rgb: "#5d8a4a",
      mask: "#2ca02c",
      shape: (r) =>
        `<g><rect x="288" y="140" width="18" height="20" fill="#8a5a3b"/><circle cx="297" cy="128" r="16" fill="${r}"/></g>`,
    });

    // box on the table: relocated in state 3 (clutter change)
    const bx = state === 3 ? tx + 70 : tx + 14;
    objs.push({
      id: "box",
      d: 0.42,
      rgb: "#c2554f",
      mask: "#d62728",
      change: state === 3 ? "moved" : null,
      box: [bx - 3, 91, 28, 24],
      shape: (r) => `<rect x="${bx}" y="94" width="22" height="18" rx="2" fill="${r}"/>`,
    });

    // stool: added in state 3 (anchor change), between the shelf and the table
    if (state === 3) {
      objs.push({
        id: "stool",
        d: 0.38,
        rgb: "#6d6d6d",
        mask: "#7f7f7f",
        change: "added",
        box: [100, 116, 40, 52],
        shape: (r) =>
          `<g fill="${r}"><rect x="104" y="120" width="32" height="7" rx="2"/><rect x="107" y="127" width="5" height="38"/><rect x="128" y="127" width="5" height="38"/></g>`,
      });
      // mug: added in state 3 (clutter change)
      objs.push({
        id: "mug",
        d: 0.42,
        rgb: "#e0b23e",
        mask: "#bcbd22",
        change: "added",
        box: [tx + 27, 97, 18, 18],
        shape: (r) => `<rect x="${tx + 30}" y="100" width="12" height="12" rx="2" fill="${r}"/>`,
      });
    }

    return objs;
  }

  /* Ghost boxes for objects removed relative to state 1 (they have no
     geometry in this state, so draw the former location). */
  function removedBoxes(state) {
    if (state >= 2) return [{ id: "chair", box: [48, 88, 42, 80] }];
    return [];
  }

  function depthColor(d) {
    const v = Math.round(235 - d * 190);
    return `rgb(${v},${v},${v})`;
  }

  /* Illumination overlays. `variant` mimics four rooms with a clearly visible
     art/nat gap: 0 direct daylight, 1 cool daylight, 2 warm daylight,
     3 windowless (the natural condition emulated with lamps). */
  function lightOverlay(light, variant) {
    const v = variant || 0;
    if (light === "art") {
      // the four tiles stand for four different rooms, so vary the lamp
      // colour and intensity a little between variants
      const lamp = ["#ffd98a", "#e8f0ff", "#ffcf7a", "#fff4cc"][v];
      const dim = [0.32, 0.26, 0.36, 0.3][v];
      return `<rect x="0" y="0" width="320" height="200" fill="#3a2f14" opacity="${dim}"/>
              <circle cx="160" cy="8" r="120" fill="${lamp}" opacity="0.22"/>`;
    }
    if (v === 3) {
      return `<rect x="0" y="0" width="320" height="200" fill="#1a1a2a" opacity="0.22"/>
              <circle cx="60" cy="40" r="90" fill="#fff1c0" opacity="0.28"/>
              <circle cx="270" cy="60" r="70" fill="#fff1c0" opacity="0.2"/>`;
    }
    const strength = v === 2 ? 0.42 : 0.5;
    const tint = v === 2 ? "#ffe3b0" : v === 1 ? "#eef4ff" : "#fff6d8";
    return `<polygon points="228,18 294,18 320,200 190,200" fill="${tint}" opacity="${strength}"/>
            <rect x="0" y="0" width="320" height="200" fill="#dfe8f5" opacity="${v === 1 ? 0.22 : 0.16}"/>`;
  }

  /* Boxes relative to state 1 (none in state 1 itself). */
  function changeBoxes(state) {
    const items = roomObjects(state)
      .map((o) => ({ kind: o.change, box: o.box, tag: o.tag }))
      .filter((o) => o.kind && o.box)
      .concat(removedBoxes(state).map((o) => ({ kind: "removed", box: o.box })));
    return items
      .map(({ kind, box, tag }) => {
        const [x, y, w, h] = box;
        const label = kind === "moved" ? "relocated" : kind;
        const tw = label.length * 5.2 + 8;
        const ty = tag === "bottom" ? y + h : y - 12; // tag above the box unless asked otherwise
        return `<g class="chg chg-${kind}">
                  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2"${kind === "removed" ? ' stroke-dasharray="4 3"' : ""}/>
                  <rect class="tag" x="${x}" y="${ty}" width="${tw}" height="12" rx="2"/>
                  <text x="${x + 4}" y="${ty + 9}">${label}</text>
                </g>`;
      })
      .join("");
  }

  function sceneSVG({
    mod = "rgb",
    state = 1,
    light = "art",
    w = 320,
    h = 200,
    variant = 0,
    boxes = false,
  }) {
    const objs = roomObjects(state);
    let defs = "";
    let body = "";
    let overlay = "";

    if (mod === "rgb") {
      body = objs.map((o) => o.shape(o.rgb)).join("");
      overlay = lightOverlay(light, variant);
      if (boxes) overlay += changeBoxes(state);
    } else if (mod === "depth") {
      body = objs.map((o) => o.shape(depthColor(o.d))).join("");
    } else if (mod === "mask") {
      body = objs.map((o) => o.shape(o.mask)).join("");
    } else if (mod === "change") {
      // binary change mask vs. state 1 (the SCD reference is always rendered
      // from state1_art): changed objects at current + former locations in white
      body = `<rect x="0" y="0" width="320" height="200" fill="#000"/>`;
      body += objs.filter((o) => o.change).map((o) => o.shape("#fff")).join("");
      // former locations of relocated objects (their state-1 geometry)
      const baseline = roomObjects(1);
      body += objs
        .filter((o) => o.change === "moved")
        .map((o) => baseline.find((b) => b.id === o.id))
        .filter(Boolean)
        .map((b) => b.shape("#fff"))
        .join("");
      body += removedBoxes(state)
        .map(({ box: [x, y, bw, bh] }) => `<rect x="${x + 4}" y="${y + 4}" width="${bw - 8}" height="${bh - 8}" rx="3" fill="#fff"/>`)
        .join("");
    } else if (mod === "cloud" || mod === "poses") {
      const pid = `dots${state}${mod}${w}`;
      defs = `<pattern id="${pid}" width="5" height="5" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.1" fill="currentColor"/></pattern>`;
      body = objs.map((o) => `<g color="${o.mask}">${o.shape(`url(#${pid})`)}</g>`).join("");
      body = `<rect x="0" y="0" width="320" height="200" fill="#141821"/>` + body;
      if (mod === "poses") {
        const cams = [[40, 178], [100, 184], [170, 186], [235, 180], [285, 168]];
        overlay =
          `<polyline points="${cams.map((c) => c.join(",")).join(" ")}" fill="none" stroke="#ffcf4d" stroke-width="1.5" stroke-dasharray="4 3"/>` +
          cams
            .map(
              ([x, y], i) =>
                `<g transform="translate(${x},${y}) rotate(${-25 + i * 12})">
                   <polygon points="0,0 -7,-12 7,-12" fill="none" stroke="#ffcf4d" stroke-width="1.6"/>
                 </g>`
            )
            .join("");
      }
    }

    return `<defs>${defs}</defs><g transform="scale(${w / 320}, ${h / 200})">${body}${overlay}</g>`;
  }

  /* Top-down orthographic plan of the same room; changed objects highlighted
     relative to the previous state. */
  function topdownSVG({ state = 1, w = 320, h = 240, highlight = true }) {
    const mute = "#c8c8c8";
    const floor = "#ebe6de";
    const wall = "#d0cbc3";
    const moved = "#2a78d6";
    const removed = "#e34948";
    const added = "#008300";
    const font = 'font-family="Google Sans, sans-serif"';

    const tx = state === 1 ? 90 : 170;
    const ty = 110;
    const bx = state === 3 ? tx + 48 : tx + 10;
    const by = ty - 8;

    let f = "";
    f += `<g fill="${mute}" opacity="0.85"><rect x="24" y="28" width="70" height="18" rx="2"/><rect x="24" y="52" width="70" height="18" rx="2"/></g>`;
    f += `<g><rect x="270" y="160" width="16" height="14" fill="#a08060"/><circle cx="278" cy="150" r="14" fill="${mute}"/></g>`;

    const tableColor = highlight && state === 2 ? moved : mute;
    f += `<g fill="${tableColor}"><rect x="${tx}" y="${ty}" width="90" height="55" rx="3"/>
          <text x="${tx + 45}" y="${ty + 32}" text-anchor="middle" font-size="11" fill="#fff" ${font}>table</text></g>`;
    if (highlight && state === 2) {
      f += `<rect x="90" y="${ty}" width="90" height="55" rx="3" fill="none" stroke="${moved}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.6"/>
            <line x1="180" y1="${ty + 27}" x2="${tx - 4}" y2="${ty + 27}" stroke="${moved}" stroke-width="1.5" marker-end="url(#arrow-td)"/>`;
    }

    if (state === 1) {
      f += `<g fill="${mute}"><rect x="48" y="130" width="32" height="32" rx="3"/>
            <text x="64" y="150" text-anchor="middle" font-size="9" fill="#fff" ${font}>chair</text></g>`;
    } else if (state === 2 && highlight) {
      f += `<rect x="48" y="130" width="32" height="32" rx="3" fill="none" stroke="${removed}" stroke-width="2" stroke-dasharray="4 3" opacity="0.8"/>
            <text x="64" y="176" text-anchor="middle" font-size="9" fill="${removed}" ${font}>removed</text>`;
    }

    if (state === 3) {
      f += `<g fill="${highlight ? added : mute}"><rect x="118" y="128" width="26" height="26" rx="3"/>
            <text x="131" y="145" text-anchor="middle" font-size="8" fill="#fff" ${font}>stool</text></g>`;
    }

    const boxColor = highlight && state === 3 ? moved : mute;
    f += `<rect x="${bx}" y="${by}" width="18" height="14" rx="2" fill="${boxColor}"/>`;
    if (state === 3) {
      f += `<circle cx="${tx + 28}" cy="${ty + 10}" r="7" fill="${highlight ? added : mute}"/>`;
      f += `<circle cx="${tx + 70}" cy="${ty + 44}" r="5" fill="${highlight ? added : mute}"/>`;
    }

    const legend =
      highlight && state > 1
        ? `<g ${font} font-size="10">
             <rect x="12" y="212" width="10" height="10" fill="${removed}"/><text x="26" y="221" fill="#555">removed</text>
             <rect x="86" y="212" width="10" height="10" fill="${moved}"/><text x="100" y="221" fill="#555">relocated</text>
             <rect x="166" y="212" width="10" height="10" fill="${added}"/><text x="180" y="221" fill="#555">added</text>
           </g>`
        : "";

    const title = state === 1 ? "state 1" : state === 2 ? "state 2 · changes vs. state 1" : "state 3 · changes vs. state 2";
    const content = `
      <defs><marker id="arrow-td" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 z" fill="${moved}"/></marker></defs>
      <rect width="320" height="240" fill="${floor}" rx="6"/>
      <rect x="8" y="8" width="304" height="12" fill="${wall}"/>
      <rect x="8" y="8" width="12" height="192" fill="${wall}"/>
      <rect x="300" y="8" width="12" height="192" fill="${wall}"/>
      <rect x="250" y="8" width="50" height="10" fill="#bcd6e8"/>
      ${f}
      ${legend}
      <text x="160" y="34" text-anchor="middle" ${font} font-size="11" fill="#666">${title}</text>
    `;
    return `<g transform="scale(${w / 320}, ${h / 240})">${content}</g>`;
  }

  function fillScenePlaceholders(root) {
    const scope = root || document;
    scope.querySelectorAll("svg.scene-ph").forEach((svg) => {
      const fig = svg.closest("figure");
      if (fig && fig.dataset.src) {
        const img = document.createElement("img");
        img.src = fig.dataset.src;
        img.alt = fig.dataset.alt || "";
        svg.replaceWith(img);
        return;
      }
      const vb = (svg.getAttribute("viewBox") || "0 0 320 200").split(/\s+/);
      const w = parseFloat(vb[2]);
      const h = parseFloat(vb[3]);
      const mod = svg.dataset.mod || "rgb";
      const state = parseInt(svg.dataset.state || "1", 10);
      if (mod === "topdown") {
        svg.innerHTML = topdownSVG({ state, w, h, highlight: svg.dataset.highlight !== "false" });
      } else {
        svg.innerHTML = sceneSVG({
          mod,
          state,
          light: svg.dataset.light || "nat",
          variant: parseInt(svg.dataset.variant || "0", 10),
          boxes: svg.dataset.boxes === "1",
          w,
          h,
        });
      }
    });
  }

  global.SGDPlaceholders = {
    sceneSVG,
    topdownSVG,
    fillScenePlaceholders,
    roomObjects,
  };
})(window);
