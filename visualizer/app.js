import {
  FACE_COLORS,
  FACES,
  applyPermutation,
  createSolvedState,
  expandToQuarters,
  inverseTokens,
  isSolved,
  overlapPairs,
  parseAlgorithm,
  positionsForActive,
  positionsForCommitted,
  prepareQuarter,
  seededScramble,
  stringifyTokens,
  validateData,
} from "./core.mjs";
import { CubeRenderer, verifyMoveGeometry } from "./cube3d.mjs";

const cubeCanvas = document.querySelector("#cube3d-canvas");
const circleCanvas = document.querySelector("#circle-canvas");
const circleCtx = circleCanvas.getContext("2d");

const statusDot = document.querySelector("#status-dot");
const statusText = document.querySelector("#status-text");
const errorBanner = document.querySelector("#error-banner");
const moveGrid = document.querySelector("#move-grid");
const algorithmInput = document.querySelector("#algorithm-input");
const runBtn = document.querySelector("#run-btn");
const invertBtn = document.querySelector("#invert-btn");
const scrambleBtn = document.querySelector("#scramble-btn");
const resetBtn = document.querySelector("#reset-btn");
const pauseBtn = document.querySelector("#pause-btn");
const speedRange = document.querySelector("#speed-range");
const speedValue = document.querySelector("#speed-value");
const markerRange = document.querySelector("#marker-range");
const markerValue = document.querySelector("#marker-value");
const labelsToggle = document.querySelector("#labels-toggle");
const collisionToggle = document.querySelector("#collision-toggle");
const movingToggle = document.querySelector("#moving-toggle");

const statMove = document.querySelector("#stat-move");
const statProgress = document.querySelector("#stat-progress");
const statQueue = document.querySelector("#stat-queue");
const statOverlaps = document.querySelector("#stat-overlaps");
const statExact = document.querySelector("#stat-exact");
const statSelected = document.querySelector("#stat-selected");
const statState = document.querySelector("#stat-state");

let data;
let collisionData;
let state = createSolvedState();
let queue = [];
let active = null;
let paused = false;
let pausedAt = null;
let executedQuarters = 0;
let lastFrame = performance.now();

let hoverCubeToken = null;
let hoverCircleToken = null;
let pinnedToken = null;
let circleHitPoints = [];

const selectedToken = () => pinnedToken ?? hoverCubeToken ?? hoverCircleToken;

function setPinnedToken(token) {
  pinnedToken = pinnedToken === token ? null : token;
}

const cubeRenderer = new CubeRenderer(cubeCanvas, {
  onHover(token) {
    hoverCubeToken = token;
  },
  onClick(token) {
    setPinnedToken(token);
  },
});

const loadJson = async (name) => {
  const candidates = [`./data/${name}`, `../data/${name}`];
  let lastError;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to load ${name}: ${lastError?.message ?? "unknown error"}`);
};

function showError(error) {
  console.error(error);
  statusDot.className = "status-dot error";
  statusText.textContent = "Visualizer error";
  errorBanner.hidden = false;
  errorBanner.textContent = error instanceof Error ? error.message : String(error);
}

function setReady() {
  statusDot.className = "status-dot ready";
  statusText.textContent = "3D cube + C-001 circle synchronized";
}

function currentSpeed() {
  return Number(speedRange.value);
}

function markerRadius() {
  return Number(markerRange.value);
}

function quarterDurationMs() {
  return 720 / currentSpeed();
}

function notationForQuarter(quarter) {
  return `${quarter.face}${quarter.sign === -1 ? "'" : ""}`;
}

function startNext(now = performance.now()) {
  if (paused || active || queue.length === 0 || !data) return;
  const quarter = queue.shift();
  active = {
    ...prepareQuarter(data, state, quarter.face, quarter.sign),
    start: now,
    duration: quarterDurationMs(),
  };
}

function enqueueTokens(tokens) {
  queue.push(...expandToQuarters(tokens));
  startNext(performance.now());
}

function executeAlgorithmText() {
  try {
    enqueueTokens(parseAlgorithm(algorithmInput.value));
    errorBanner.hidden = true;
  } catch (error) {
    showError(error);
  }
}

function resetAll() {
  queue = [];
  active = null;
  state = createSolvedState();
  executedQuarters = 0;
  paused = false;
  pausedAt = null;
  hoverCubeToken = null;
  hoverCircleToken = null;
  pinnedToken = null;
  pauseBtn.textContent = "Pause";
  errorBanner.hidden = true;
  setReady();
}

function togglePause() {
  const now = performance.now();
  if (!paused) {
    paused = true;
    pausedAt = now;
    pauseBtn.textContent = "Resume";
    statusText.textContent = "Paused";
  } else {
    paused = false;
    if (active && pausedAt !== null) {
      active.start += now - pausedAt;
    }
    pausedAt = null;
    pauseBtn.textContent = "Pause";
    setReady();
    startNext(now);
  }
}

function buildMoveButtons() {
  for (const face of FACES) {
    for (const suffix of ["", "'", "2"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "move-button";
      button.textContent = `${face}${suffix}`;
      button.addEventListener("click", () => {
        enqueueTokens(parseAlgorithm(button.textContent));
      });
      moveGrid.append(button);
    }
  }
}

function moveMetrics(face) {
  return face && collisionData?.metrics?.[face] ? collisionData.metrics[face] : null;
}

function resizeCircleCanvas() {
  const rect = circleCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (circleCanvas.width !== width || circleCanvas.height !== height) {
    circleCanvas.width = width;
    circleCanvas.height = height;
  }
  circleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return rect;
}

function circleGeometry() {
  const rect = resizeCircleCanvas();
  const radius = Math.min(rect.width, rect.height) * 0.355;
  return {
    width: rect.width,
    height: rect.height,
    cx: rect.width / 2,
    cy: rect.height / 2,
    radius,
  };
}

function toCircleCanvas(position, geom) {
  return {
    x: geom.cx + position.x * geom.radius,
    y: geom.cy + position.y * geom.radius,
  };
}

function drawCircleBackground(geom) {
  circleCtx.clearRect(0, 0, geom.width, geom.height);

  const glow = circleCtx.createRadialGradient(
    geom.cx,
    geom.cy,
    10,
    geom.cx,
    geom.cy,
    Math.max(geom.width, geom.height) * 0.55,
  );
  glow.addColorStop(0, "rgba(56, 189, 248, 0.09)");
  glow.addColorStop(1, "rgba(3, 7, 18, 0)");
  circleCtx.fillStyle = glow;
  circleCtx.fillRect(0, 0, geom.width, geom.height);

  circleCtx.save();
  circleCtx.translate(geom.cx, geom.cy);

  circleCtx.strokeStyle = "rgba(125, 211, 252, 0.32)";
  circleCtx.lineWidth = 1.5;
  circleCtx.beginPath();
  circleCtx.arc(0, 0, geom.radius, 0, Math.PI * 2);
  circleCtx.stroke();

  for (const slot of data.slots) {
    const angle = (slot.phase_pi_over_60 * Math.PI) / 60;
    const x0 = Math.cos(angle) * (geom.radius - 5);
    const y0 = Math.sin(angle) * (geom.radius - 5);
    const x1 = Math.cos(angle) * (geom.radius + 5);
    const y1 = Math.sin(angle) * (geom.radius + 5);
    circleCtx.strokeStyle = "rgba(148, 163, 184, 0.16)";
    circleCtx.lineWidth = 1;
    circleCtx.beginPath();
    circleCtx.moveTo(x0, y0);
    circleCtx.lineTo(x1, y1);
    circleCtx.stroke();
  }

  circleCtx.font = "700 11px Inter, system-ui, sans-serif";
  circleCtx.textAlign = "center";
  circleCtx.textBaseline = "middle";
  for (let f = 0; f < FACES.length; f += 1) {
    const face = FACES[f];
    const angle = (f * Math.PI) / 3;
    const r = geom.radius * 1.16;
    circleCtx.fillStyle = FACE_COLORS[face];
    circleCtx.globalAlpha = 0.92;
    circleCtx.fillText(face, Math.cos(angle) * r, Math.sin(angle) * r);
  }

  circleCtx.restore();
  circleCtx.globalAlpha = 1;
}

function drawCircleTokens(positions, geom, pairs) {
  const overlapping = new Set(pairs.flat());
  const radiusPx = Math.max(5, markerRadius() * geom.radius);
  const selected = selectedToken();
  circleHitPoints = new Array(positions.length);

  for (let token = 0; token < positions.length; token += 1) {
    const position = positions[token];
    const point = toCircleCanvas(position, geom);
    circleHitPoints[token] = { ...point, radius: radiusPx + 7 };

    const face = data.slots[token].solved_color;
    const fill = FACE_COLORS[face] ?? "#e2e8f0";

    if (movingToggle.checked && position.moving) {
      circleCtx.strokeStyle = "rgba(125, 211, 252, 0.48)";
      circleCtx.lineWidth = 2;
      circleCtx.beginPath();
      circleCtx.arc(point.x, point.y, radiusPx + 4, 0, Math.PI * 2);
      circleCtx.stroke();
    }

    if (collisionToggle.checked && overlapping.has(token)) {
      circleCtx.fillStyle = "rgba(251, 113, 133, 0.19)";
      circleCtx.beginPath();
      circleCtx.arc(point.x, point.y, radiusPx + 7, 0, Math.PI * 2);
      circleCtx.fill();
    }

    if (token === selected) {
      circleCtx.strokeStyle = "#7dd3fc";
      circleCtx.lineWidth = 3.2;
      circleCtx.beginPath();
      circleCtx.arc(point.x, point.y, radiusPx + 7, 0, Math.PI * 2);
      circleCtx.stroke();
    }

    circleCtx.fillStyle = fill;
    circleCtx.beginPath();
    circleCtx.arc(point.x, point.y, radiusPx, 0, Math.PI * 2);
    circleCtx.fill();

    circleCtx.strokeStyle = collisionToggle.checked && overlapping.has(token)
      ? "#fb7185"
      : "rgba(3, 7, 18, 0.82)";
    circleCtx.lineWidth = collisionToggle.checked && overlapping.has(token) ? 2.4 : 1.4;
    circleCtx.stroke();

    if (labelsToggle.checked && radiusPx >= 6.4) {
      circleCtx.fillStyle = face === "U" || face === "D" ? "#111827" : "#f8fafc";
      circleCtx.font = `700 ${Math.max(7, Math.min(9, radiusPx * 0.72))}px ui-monospace, SFMono-Regular, monospace`;
      circleCtx.textAlign = "center";
      circleCtx.textBaseline = "middle";
      circleCtx.fillText(data.slots[token].label, point.x, point.y + 0.5);
    }
  }
}

function circleTokenAtEvent(event) {
  if (!data || circleHitPoints.length === 0) return null;
  const rect = circleCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  let best = null;
  let bestDistance2 = Infinity;
  for (let token = 0; token < circleHitPoints.length; token += 1) {
    const point = circleHitPoints[token];
    if (!point) continue;
    const dx = x - point.x;
    const dy = y - point.y;
    const distance2 = dx * dx + dy * dy;
    if (distance2 <= point.radius * point.radius && distance2 < bestDistance2) {
      best = token;
      bestDistance2 = distance2;
    }
  }
  return best;
}

circleCanvas.addEventListener("pointermove", (event) => {
  hoverCircleToken = circleTokenAtEvent(event);
});

circleCanvas.addEventListener("pointerleave", () => {
  hoverCircleToken = null;
});

circleCanvas.addEventListener("click", (event) => {
  const token = circleTokenAtEvent(event);
  if (token !== null) setPinnedToken(token);
});

function updateStats(t, pairs) {
  const metrics = moveMetrics(active?.face);
  const selected = selectedToken();

  statMove.textContent = active ? notationForQuarter(active) : "—";
  statProgress.textContent = active ? `${Math.round(t * 100)}%` : "0%";
  statQueue.textContent = String(queue.length);
  statOverlaps.textContent = String(pairs.length);
  statExact.textContent = metrics ? String(metrics.exact_pair_events) : "—";
  statSelected.textContent = selected === null ? "—" : data.slots[selected].label;
  statState.textContent = isSolved(state)
    ? executedQuarters === 0 ? "Solved" : "Solved again"
    : `${executedQuarters} q-turns`;
}

function draw(now) {
  let t = 0;
  if (active) {
    t = Math.max(0, Math.min(1, (now - active.start) / active.duration));
  }

  const circlePositions = active
    ? positionsForActive(data, active, t)
    : positionsForCommitted(data, state);

  const pairs = overlapPairs(circlePositions, markerRadius());
  const circleGeom = circleGeometry();
  drawCircleBackground(circleGeom);
  drawCircleTokens(circlePositions, circleGeom, pairs);

  cubeRenderer.draw({
    data,
    state,
    active,
    t,
    selectedToken: selectedToken(),
    showLabels: labelsToggle.checked,
    highlightMoving: movingToggle.checked,
  });

  updateStats(t, pairs);
}

function tick(now) {
  lastFrame = now;

  if (data && !paused && active) {
    const t = (now - active.start) / active.duration;
    if (t >= 1) {
      state = applyPermutation(active.old, active.permutation);
      executedQuarters += 1;
      active = null;
      startNext(now);
    }
  } else if (data && !paused && !active) {
    startNext(now);
  }

  if (data) draw(now);
  requestAnimationFrame(tick);
}

runBtn.addEventListener("click", executeAlgorithmText);
algorithmInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") executeAlgorithmText();
});

invertBtn.addEventListener("click", () => {
  try {
    const tokens = parseAlgorithm(algorithmInput.value);
    algorithmInput.value = stringifyTokens(inverseTokens(tokens));
    errorBanner.hidden = true;
  } catch (error) {
    showError(error);
  }
});

scrambleBtn.addEventListener("click", () => {
  const scramble = seededScramble(20);
  algorithmInput.value = stringifyTokens(scramble);
  enqueueTokens(scramble);
});

resetBtn.addEventListener("click", resetAll);
pauseBtn.addEventListener("click", togglePause);

speedRange.addEventListener("input", () => {
  speedValue.textContent = `${currentSpeed().toFixed(2)}×`;
});

markerRange.addEventListener("input", () => {
  markerValue.textContent = `${markerRadius().toFixed(3)} R`;
});

window.addEventListener("resize", () => {
  if (data) draw(lastFrame);
});

buildMoveButtons();
requestAnimationFrame(tick);

try {
  [data, collisionData] = await Promise.all([
    loadJson("c001-browser.json"),
    loadJson("c001-collisions.json"),
  ]);
  validateData(data);
  verifyMoveGeometry(data);
  setReady();
  draw(performance.now());
} catch (error) {
  showError(error);
}
