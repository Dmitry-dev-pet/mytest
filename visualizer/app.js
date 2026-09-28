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

const canvas = document.querySelector("#cube-canvas");
const ctx = canvas.getContext("2d");
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
  statusText.textContent = "C-001 data loaded";
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      button.dataset.face = face;
      button.dataset.suffix = suffix;
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

function canvasGeometry() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const radius = Math.min(width, height) * 0.39;
  return {
    width,
    height,
    cx: width / 2,
    cy: height / 2,
    radius,
  };
}

function toCanvas(position, geom) {
  return {
    x: geom.cx + position.x * geom.radius,
    y: geom.cy + position.y * geom.radius,
  };
}

function drawBackground(geom) {
  ctx.clearRect(0, 0, geom.width, geom.height);

  ctx.save();
  ctx.translate(geom.cx, geom.cy);

  ctx.strokeStyle = "rgba(125, 211, 252, 0.28)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, geom.radius, 0, Math.PI * 2);
  ctx.stroke();

  for (const slot of data.slots) {
    const angle = (slot.phase_pi_over_60 * Math.PI) / 60;
    const x0 = Math.cos(angle) * (geom.radius - 6);
    const y0 = Math.sin(angle) * (geom.radius - 6);
    const x1 = Math.cos(angle) * (geom.radius + 6);
    const y1 = Math.sin(angle) * (geom.radius + 6);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let f = 0; f < FACES.length; f += 1) {
    const face = FACES[f];
    const angle = (f * Math.PI) / 3;
    const r = geom.radius * 1.16;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    ctx.fillStyle = FACE_COLORS[face];
    ctx.globalAlpha = 0.9;
    ctx.fillText(face, x, y);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawTokens(positions, geom, pairs) {
  const overlapping = new Set(pairs.flat());
  const radiusPx = Math.max(5.5, markerRadius() * geom.radius);

  for (let token = 0; token < positions.length; token += 1) {
    const position = positions[token];
    const point = toCanvas(position, geom);
    const face = data.slots[token].solved_color;
    const fill = FACE_COLORS[face] ?? "#e2e8f0";

    if (movingToggle.checked && position.moving) {
      ctx.strokeStyle = "rgba(125, 211, 252, 0.54)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radiusPx + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (collisionToggle.checked && overlapping.has(token)) {
      ctx.fillStyle = "rgba(251, 113, 133, 0.18)";
      ctx.beginPath();
      ctx.arc(point.x, point.y, radiusPx + 7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = collisionToggle.checked && overlapping.has(token)
      ? "#fb7185"
      : "rgba(3, 7, 18, 0.78)";
    ctx.lineWidth = collisionToggle.checked && overlapping.has(token) ? 2.5 : 1.4;
    ctx.stroke();

    if (labelsToggle.checked && radiusPx >= 7) {
      ctx.fillStyle = face === "U" || face === "D" ? "#111827" : "#f8fafc";
      ctx.font = `700 ${Math.max(7, Math.min(10, radiusPx * 0.7))}px ui-monospace, SFMono-Regular, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(data.slots[token].label, point.x, point.y + 0.5);
    }
  }
}

function updateStats(t, pairs) {
  const metrics = moveMetrics(active?.face);
  statMove.textContent = active ? notationForQuarter(active) : "—";
  statProgress.textContent = active ? `${Math.round(t * 100)}%` : "0%";
  statQueue.textContent = String(queue.length);
  statOverlaps.textContent = String(pairs.length);
  statExact.textContent = metrics ? String(metrics.exact_pair_events) : "—";
  statState.textContent = isSolved(state)
    ? executedQuarters === 0 ? "Solved" : "Solved again"
    : `${executedQuarters} q-turns`;
}

function draw(now) {
  resizeCanvas();
  const geom = canvasGeometry();
  drawBackground(geom);

  let t = 0;
  let positions;
  if (active) {
    t = Math.max(0, Math.min(1, (now - active.start) / active.duration));
    positions = positionsForActive(data, active, t);
  } else {
    positions = positionsForCommitted(data, state);
  }

  const pairs = overlapPairs(positions, markerRadius());
  drawTokens(positions, geom, pairs);
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
  setReady();
  draw(performance.now());
} catch (error) {
  showError(error);
}
