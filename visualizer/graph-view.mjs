import { FACE_COLORS, easeCubic } from "./core.mjs";
import { centerLabels, createGraphLayout } from "./graph-layouts.mjs";

const SVG = "http://www.w3.org/2000/svg";

const spring = (t) =>
  t >= 1 ? 1 : 1 - Math.exp(-5 * t) * Math.cos(4 * t);

function svgElement(name, attrs = {}) {
  const el = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

function committedPositions(layout, data, state) {
  const byToken = new Array(48);
  for (let slot = 0; slot < state.length; slot += 1) {
    const token = state[slot];
    const target = layout.slots.get(data.slots[slot].label);
    byToken[token] = {
      token,
      x: target.x,
      y: target.y,
      moving: false,
      ringKeys: [],
    };
  }
  return byToken;
}

function activePositions(layout, data, active, t) {
  const e = layout.id === "one" ? easeCubic(t) : spring(t);
  const byToken = new Array(48);

  for (let source = 0; source < active.old.length; source += 1) {
    const token = active.old[source];
    const destination = active.permutation[source];
    const sourceLabel = data.slots[source].label;

    if (destination === source) {
      const point = layout.slots.get(sourceLabel);
      byToken[token] = {
        token,
        x: point.x,
        y: point.y,
        moving: false,
        ringKeys: [],
      };
      continue;
    }

    const destinationLabel = data.slots[destination].label;
    const path = layout.path(sourceLabel, destinationLabel);
    const angle = path.a0 + path.delta * e;
    const radius = path.r0 + (path.r1 - path.r0) * e;
    byToken[token] = {
      token,
      x: path.cx + radius * Math.cos(angle),
      y: path.cy + radius * Math.sin(angle),
      moving: true,
      ringKeys: path.ringKeys,
    };
  }

  return byToken;
}

export class GraphView {
  constructor(host, callbacks = {}) {
    this.host = host;
    this.onHover = callbacks.onHover ?? (() => {});
    this.onClick = callbacks.onClick ?? (() => {});
    this.mode = null;
    this.layout = null;
    this.svg = null;
    this.ringEls = new Map();
    this.nodeEls = [];
    this.tailEls = [];
    this.histories = Array.from({ length: 48 }, () => []);
    this.activeRef = null;
    this.labelEl = null;
    this.centerGroup = null;
  }

  setMode(mode, data) {
    if (this.mode === mode && this.layout) return;
    this.mode = mode;
    this.layout = createGraphLayout(mode, data);
    this.activeRef = null;
    this.histories = Array.from({ length: 48 }, () => []);

    const [x, y, width, height] = this.layout.viewBox;
    const svg = svgElement("svg", {
      viewBox: `${x} ${y} ${width} ${height}`,
      "aria-label": `${this.layout.title} Rubik sticker graph`,
      role: "img",
    });
    svg.classList.add("graph-svg");

    const ringGroup = svgElement("g", { fill: "none" });
    ringGroup.classList.add("graph-rings");
    this.ringEls.clear();

    for (const ring of this.layout.rings) {
      const circle = svgElement("circle", {
        cx: ring.cx,
        cy: ring.cy,
        r: ring.r,
        stroke: "#b9b09f",
        "stroke-width": 1.35,
      });
      circle.dataset.key = ring.key;
      ringGroup.append(circle);
      this.ringEls.set(ring.key, circle);
    }
    svg.append(ringGroup);

    const trailGroup = svgElement("g", { fill: "none" });
    trailGroup.classList.add("graph-trails");
    this.tailEls = [];
    for (let token = 0; token < 48; token += 1) {
      const path = svgElement("polyline", {
        fill: "none",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-width": 3.2,
        opacity: 0,
      });
      trailGroup.append(path);
      this.tailEls[token] = path;
    }
    svg.append(trailGroup);

    const centerGroup = svgElement("g");
    this.centerGroup = centerGroup;
    for (const label of centerLabels()) {
      const slot = this.layout.slots.get(label);
      const face = label[0];
      const circle = svgElement("circle", {
        cx: slot.x,
        cy: slot.y,
        r: mode === "nine" ? 6.2 : 5.2,
        fill: FACE_COLORS[face],
        stroke: "#2b2b2b",
        "stroke-width": 1.2,
      });
      circle.classList.add("graph-center");
      centerGroup.append(circle);
    }
    svg.append(centerGroup);

    const nodeGroup = svgElement("g");
    nodeGroup.classList.add("graph-nodes");
    this.nodeEls = [];

    for (let token = 0; token < 48; token += 1) {
      const face = data.slots[token].solved_color;
      const circle = svgElement("circle", {
        r: mode === "nine" ? 6.2 : 6.0,
        fill: FACE_COLORS[face],
        stroke: "#2b2b2b",
        "stroke-width": 1.25,
      });
      circle.classList.add("graph-node");
      circle.dataset.token = String(token);
      circle.addEventListener("pointerenter", () => this.onHover(token));
      circle.addEventListener("pointerleave", () => this.onHover(null));
      circle.addEventListener("click", () => this.onClick(token));
      nodeGroup.append(circle);
      this.nodeEls[token] = circle;
    }
    svg.append(nodeGroup);

    this.labelEl = svgElement("text", {
      x: 150,
      y: 286,
      "text-anchor": "middle",
      "font-size": 10,
      "font-family": "IBM Plex Mono, ui-monospace, monospace",
      fill: "#6f685e",
      opacity: 0,
    });
    svg.append(this.labelEl);

    this.svg = svg;
    this.host.replaceChildren(svg);
  }

  updateRings(activeKeys) {
    for (const [key, circle] of this.ringEls) {
      const active = activeKeys.has(key);
      circle.setAttribute("stroke", active ? "#6b655a" : "#b9b09f");
      circle.setAttribute("stroke-width", active ? "2.1" : "1.35");
      circle.setAttribute("opacity", active ? "1" : "0.84");
    }
  }

  resetHistories(active) {
    if (this.activeRef === active) return;
    this.activeRef = active;
    this.histories = Array.from({ length: 48 }, () => []);
    for (const tail of this.tailEls) {
      tail.setAttribute("points", "");
      tail.setAttribute("opacity", "0");
    }
  }

  render({
    mode,
    data,
    state,
    active,
    t,
    selectedToken = null,
    showLabels = false,
    showTrails = true,
  }) {
    this.setMode(mode, data);
    this.resetHistories(active);

    const positions = active
      ? activePositions(this.layout, data, active, t)
      : committedPositions(this.layout, data, state);

    const activeRingKeys = new Set();
    const selectedLabel =
      selectedToken === null ? "" : data.slots[selectedToken].label;

    for (let token = 0; token < positions.length; token += 1) {
      const point = positions[token];
      const node = this.nodeEls[token];
      node.setAttribute("cx", point.x.toFixed(4));
      node.setAttribute("cy", point.y.toFixed(4));

      if (point.moving) {
        for (const key of point.ringKeys) activeRingKeys.add(key);
      }

      const selected = token === selectedToken;
      node.setAttribute("stroke", selected ? "#111111" : "#2b2b2b");
      node.setAttribute("stroke-width", selected ? "3.2" : point.moving ? "1.7" : "1.25");
      node.setAttribute("r", selected ? "7.6" : this.mode === "nine" ? "6.2" : "6.0");

      const history = this.histories[token];
      if (active && point.moving && showTrails) {
        history.push({ x: point.x, y: point.y });
        if (history.length > 9) history.shift();
        const tail = this.tailEls[token];
        tail.setAttribute(
          "points",
          history.map((sample) => `${sample.x.toFixed(2)},${sample.y.toFixed(2)}`).join(" "),
        );
        tail.setAttribute("stroke", FACE_COLORS[data.slots[token].solved_color]);
        tail.setAttribute("opacity", "0.5");
      } else {
        this.tailEls[token].setAttribute("opacity", "0");
      }
    }

    this.updateRings(activeRingKeys);

    if (selectedToken !== null && showLabels) {
      const p = positions[selectedToken];
      this.labelEl.setAttribute("x", p.x);
      this.labelEl.setAttribute("y", Math.min(294, p.y + 18));
      this.labelEl.textContent = selectedLabel;
      this.labelEl.setAttribute("opacity", "1");
    } else {
      this.labelEl.setAttribute("opacity", "0");
    }
  }
}
