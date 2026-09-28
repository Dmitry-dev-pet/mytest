import {
  FACES,
  applyPermutation,
  createSolvedState,
  expandToQuarters,
  inverseTokens,
  isSolved,
  parseAlgorithm,
  prepareQuarter,
  seededScramble,
  stringifyTokens,
  validateData,
} from "./core.mjs";
import { verifyMoveGeometry } from "./cube-math.mjs";
import { ThreeCubeView } from "./cube-view.mjs";
import { verifyGraphLayouts } from "./graph-layouts.mjs";
import { GraphView } from "./graph-view.mjs";

const cubeHost = document.querySelector("#cube-host");
const graphHost = document.querySelector("#graph-host");
const graphTitle = document.querySelector("#graph-title");
const graphModeNote = document.querySelector("#graph-mode-note");
const graphModeButtons = [...document.querySelectorAll("[data-graph-mode]")];

const statusDot = document.querySelector("#status-dot");
const statusText = document.querySelector("#status-text");
const errorBanner = document.querySelector("#error-banner");
const moveGrid = document.querySelector("#move-grid");
const algorithmInput = document.querySelector("#algorithm-input");
const runBtn = document.querySelector("#run-btn");
const invertBtn = document.querySelector("#invert-btn");
const scrambleBtn = document.querySelector("#scramble-btn");
const pauseBtn = document.querySelector("#pause-btn");
const resetBtn = document.querySelector("#reset-btn");
const speedRange = document.querySelector("#speed-range");
const speedValue = document.querySelector("#speed-value");
const trailsToggle = document.querySelector("#trails-toggle");
const labelsToggle = document.querySelector("#labels-toggle");

const statMove = document.querySelector("#stat-move");
const statProgress = document.querySelector("#stat-progress");
const statQueue = document.querySelector("#stat-queue");
const statSelected = document.querySelector("#stat-selected");
const statState = document.querySelector("#stat-state");
const statCollisions = document.querySelector("#stat-collisions");

let data;
let collisionData;
let state = createSolvedState();
let queue = [];
let active = null;
let paused = false;
let pausedAt = null;
let executedQuarters = 0;
let graphMode = "one";
let hoverCubeToken = null;
let hoverGraphToken = null;
let pinnedToken = null;

const selectedToken = () => pinnedToken ?? hoverCubeToken ?? hoverGraphToken;

const cubeView = new ThreeCubeView(cubeHost, {
  onHover(token) {
    hoverCubeToken = token;
  },
  onClick(token) {
    pinnedToken = pinnedToken === token ? null : token;
  },
});

const graphView = new GraphView(graphHost, {
  onHover(token) {
    hoverGraphToken = token;
  },
  onClick(token) {
    pinnedToken = pinnedToken === token ? null : token;
  },
});

const MODE_COPY = {
  one: {
    title: "1 circle",
    note: "Established W8 minimum: all 48 moving stickers live on one fixed circle.",
  },
  three: {
    title: "3 rings",
    note: "Readability baseline from our earlier demo: fixed centers, edges and corners are visually separated.",
  },
  nine: {
    title: "9 rings",
    note: "Jevspin/MathFlow-style three-family intersection layout, shown as a visual prior-art comparison.",
  },
};

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
  statusText.textContent = "visualizer error";
  errorBanner.hidden = false;
  errorBanner.textContent = error instanceof Error ? error.message : String(error);
}

function setReady() {
  statusDot.className = "status-dot ready";
  statusText.textContent = "exact cube + graph state synchronized";
}

function currentSpeed() {
  return Number(speedRange.value);
}

function quarterDurationMs() {
  return 310 / currentSpeed();
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
  hoverGraphToken = null;
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
    statusText.textContent = "paused";
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
    const group = document.createElement("div");
    group.className = "move-family";

    const faceLabel = document.createElement("span");
    faceLabel.className = "move-face";
    faceLabel.textContent = face;
    group.append(faceLabel);

    for (const suffix of ["", "'", "2"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "move-button";
      button.textContent = `${face}${suffix}`;
      button.addEventListener("click", () => {
        enqueueTokens(parseAlgorithm(button.textContent));
      });
      group.append(button);
    }

    moveGrid.append(group);
  }
}

function setGraphMode(mode) {
  graphMode = mode;
  const copy = MODE_COPY[mode];
  graphTitle.textContent = copy.title;
  graphModeNote.textContent = copy.note;
  for (const button of graphModeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.graphMode === mode));
  }
  if (data) graphView.setMode(mode, data);
}

function updateReadout(t) {
  const selected = selectedToken();
  statMove.textContent = active ? notationForQuarter(active) : "—";
  statProgress.textContent = active ? `${Math.round(t * 100)}%` : "0%";
  statQueue.textContent = String(queue.length);
  statSelected.textContent = selected === null ? "—" : data.slots[selected].label;
  statState.textContent = isSolved(state)
    ? executedQuarters === 0 ? "solved" : "solved again"
    : `${executedQuarters} quarter turns`;

  if (graphMode === "one" && active) {
    statCollisions.textContent = String(
      collisionData?.metrics?.[active.face]?.exact_pair_events ?? "—",
    );
  } else {
    statCollisions.textContent = graphMode === "one" ? "—" : "n/a";
  }
}

function render(now) {
  if (!data) return;

  let t = 0;
  if (active) {
    t = Math.max(0, Math.min(1, (now - active.start) / active.duration));
  }

  const selected = selectedToken();

  cubeView.renderFrame({
    data,
    state,
    active,
    t,
    selectedToken: selected,
  });

  graphView.render({
    mode: graphMode,
    data,
    state,
    active,
    t,
    selectedToken: selected,
    showLabels: labelsToggle.checked,
    showTrails: trailsToggle.checked,
  });

  updateReadout(t);
}

function tick(now) {
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

  render(now);
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

pauseBtn.addEventListener("click", togglePause);
resetBtn.addEventListener("click", resetAll);

speedRange.addEventListener("input", () => {
  speedValue.textContent = `${currentSpeed().toFixed(2)}×`;
});

for (const button of graphModeButtons) {
  button.addEventListener("click", () => setGraphMode(button.dataset.graphMode));
}

buildMoveButtons();
setGraphMode("one");
requestAnimationFrame(tick);

try {
  [data, collisionData] = await Promise.all([
    loadJson("c001-browser.json"),
    loadJson("c001-collisions.json"),
  ]);
  validateData(data);
  verifyMoveGeometry(data);
  verifyGraphLayouts(data);
  graphView.setMode(graphMode, data);
  setReady();
} catch (error) {
  showError(error);
}
