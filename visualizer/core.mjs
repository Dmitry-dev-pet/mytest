export const FACES = ["U", "R", "F", "D", "L", "B"];

export const FACE_COLORS = {
  U: "#f8fafc",
  R: "#ef4444",
  F: "#22c55e",
  D: "#facc15",
  L: "#f97316",
  B: "#3b82f6",
};

export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function easeCubic(t) {
  const x = clamp(t);
  return 3 * x * x - 2 * x * x * x;
}

export function shortestDelta(fromPhase, toPhase) {
  let delta = toPhase - fromPhase;
  if (delta > 60) delta -= 120;
  if (delta < -60) delta += 120;
  return delta;
}

export function validateData(data) {
  if (!data || data.schema !== "C-001-v1") {
    throw new Error(`Unsupported browser data schema: ${data?.schema ?? "missing"}`);
  }
  if (!Array.isArray(data.slots) || data.slots.length !== 48) {
    throw new Error("Expected exactly 48 sticker slots.");
  }
  if (!data.moves || typeof data.moves !== "object") {
    throw new Error("Move table is missing.");
  }

  for (let i = 0; i < data.slots.length; i += 1) {
    const slot = data.slots[i];
    if (slot.id !== i) throw new Error(`Slot id mismatch at index ${i}.`);
    if (!Number.isInteger(slot.phase_pi_over_60)) {
      throw new Error(`Slot ${slot.label} has a non-integer phase.`);
    }
    if (!Array.isArray(slot.xy) || slot.xy.length !== 2) {
      throw new Error(`Slot ${slot.label} is missing xy coordinates.`);
    }
  }

  for (const face of FACES) {
    const move = data.moves[face];
    if (!move) throw new Error(`Move ${face} is missing.`);
    for (const key of ["permutation", "inverse_permutation", "delta_pi_over_60"]) {
      if (!Array.isArray(move[key]) || move[key].length !== 48) {
        throw new Error(`Move ${face} has invalid ${key}.`);
      }
    }

    const seen = new Set(move.permutation);
    if (seen.size !== 48 || Math.min(...seen) !== 0 || Math.max(...seen) !== 47) {
      throw new Error(`Move ${face} is not a permutation of 0..47.`);
    }

    for (let source = 0; source < 48; source += 1) {
      const destination = move.permutation[source];
      if (move.inverse_permutation[destination] !== source) {
        throw new Error(`Move ${face} inverse mismatch at source ${source}.`);
      }
      const expectedDelta = shortestDelta(
        data.slots[source].phase_pi_over_60,
        data.slots[destination].phase_pi_over_60,
      );
      if (move.delta_pi_over_60[source] !== expectedDelta) {
        throw new Error(`Move ${face} delta mismatch at source ${source}.`);
      }
    }
  }

  return true;
}

export function createSolvedState(size = 48) {
  return Array.from({ length: size }, (_, i) => i);
}

export function isSolved(state) {
  return state.every((token, slot) => token === slot);
}

export function applyPermutation(state, permutation) {
  if (state.length !== permutation.length) {
    throw new Error("State and permutation sizes differ.");
  }
  const next = new Array(state.length);
  for (let source = 0; source < state.length; source += 1) {
    next[permutation[source]] = state[source];
  }
  return next;
}

export function prepareQuarter(data, state, face, sign = 1) {
  if (!FACES.includes(face)) throw new Error(`Unknown face: ${face}`);
  if (sign !== 1 && sign !== -1) throw new Error("Quarter-turn sign must be +1 or -1.");

  const move = data.moves[face];
  const permutation = sign === 1 ? move.permutation : move.inverse_permutation;
  const old = state.slice();
  const deltas = permutation.map((destination, source) =>
    shortestDelta(
      data.slots[source].phase_pi_over_60,
      data.slots[destination].phase_pi_over_60,
    ),
  );

  return {
    face,
    sign,
    old,
    permutation,
    deltas,
  };
}

export function positionsForCommitted(data, state) {
  const byToken = new Array(state.length);
  for (let slot = 0; slot < state.length; slot += 1) {
    const token = state[slot];
    const [x, y] = data.slots[slot].xy;
    byToken[token] = {
      token,
      x,
      y,
      source: slot,
      destination: slot,
      moving: false,
    };
  }
  return byToken;
}

export function positionsForActive(data, active, t) {
  const u = easeCubic(t);
  const byToken = new Array(active.old.length);

  for (let source = 0; source < active.old.length; source += 1) {
    const token = active.old[source];
    const destination = active.permutation[source];
    const phase = data.slots[source].phase_pi_over_60 + u * active.deltas[source];
    const angle = (phase * Math.PI) / 60;
    byToken[token] = {
      token,
      x: Math.cos(angle),
      y: Math.sin(angle),
      source,
      destination,
      moving: destination !== source,
    };
  }

  return byToken;
}

export function parseAlgorithm(text) {
  const normalized = text
    .replaceAll("’", "'")
    .replaceAll("′", "'")
    .trim();

  if (!normalized) return [];

  return normalized
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((raw) => {
      const token = raw.toUpperCase();
      const match = token.match(/^([URFDLB])(2|')?$/);
      if (!match) {
        throw new Error(`Unsupported move "${raw}". Use U R F D L B with optional ' or 2.`);
      }
      const [, face, suffix = ""] = match;
      return {
        face,
        turns: suffix === "'" ? -1 : suffix === "2" ? 2 : 1,
      };
    });
}

export function expandToQuarters(tokens) {
  const quarters = [];
  for (const token of tokens) {
    if (token.turns === 2) {
      quarters.push({ face: token.face, sign: 1 });
      quarters.push({ face: token.face, sign: 1 });
    } else {
      quarters.push({ face: token.face, sign: token.turns });
    }
  }
  return quarters;
}

export function inverseTokens(tokens) {
  return [...tokens].reverse().map((token) => ({
    face: token.face,
    turns: token.turns === 2 ? 2 : -token.turns,
  }));
}

export function stringifyTokens(tokens) {
  return tokens
    .map(({ face, turns }) => `${face}${turns === -1 ? "'" : turns === 2 ? "2" : ""}`)
    .join(" ");
}

export function seededScramble(length = 20, seed = Date.now() >>> 0) {
  let x = seed >>> 0 || 0x9e3779b9;
  const random = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0x100000000;
  };

  const suffixes = [1, -1, 2];
  const out = [];
  let previousFace = null;

  while (out.length < length) {
    const face = FACES[Math.floor(random() * FACES.length)];
    if (face === previousFace) continue;
    previousFace = face;
    const turns = suffixes[Math.floor(random() * suffixes.length)];
    out.push({ face, turns });
  }

  return out;
}

export function overlapPairs(positions, markerRadius = 0.04) {
  const threshold2 = (2 * markerRadius) ** 2;
  const pairs = [];
  for (let a = 0; a < positions.length; a += 1) {
    for (let b = a + 1; b < positions.length; b += 1) {
      const dx = positions[a].x - positions[b].x;
      const dy = positions[a].y - positions[b].y;
      if (dx * dx + dy * dy < threshold2 - 1e-12) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}
