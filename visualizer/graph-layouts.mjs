const FACE = "URFDLB";
const EDGE_ORDER = [2, 6, 8, 4];
const CORNER_ORDER = [1, 3, 9, 7];

const pointOnRing = (cx, cy, r, angle) => ({
  x: cx + r * Math.cos(angle),
  y: cy + r * Math.sin(angle),
});

const shortestAngle = (from, to) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function labelInfo(label) {
  const match = /^([URFDLB])([1-9])$/.exec(label);
  if (!match) throw new Error(`Invalid facelet label: ${label}`);
  return {
    face: match[1],
    faceIndex: FACE.indexOf(match[1]),
    suffix: Number(match[2]),
  };
}

export function centerLabels() {
  return [...FACE].map((face) => `${face}5`);
}

function makeOneCircle(data) {
  const cx = 150;
  const cy = 150;
  const radius = 112;
  const slots = new Map();

  for (const slot of data.slots) {
    const angle = (slot.phase_pi_over_60 * Math.PI) / 60;
    slots.set(slot.label, {
      label: slot.label,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      angle,
      rings: ["one"],
    });
  }

  for (let i = 0; i < FACE.length; i += 1) {
    const angle = Math.PI / 2 - (2 * Math.PI * i) / FACE.length;
    slots.set(`${FACE[i]}5`, {
      label: `${FACE[i]}5`,
      ...pointOnRing(cx, cy, 28, angle),
      angle,
      rings: [],
      center: true,
    });
  }

  return {
    id: "one",
    title: "1 circle",
    viewBox: [0, 0, 300, 300],
    rings: [{ key: "one", cx, cy, r: radius }],
    slots,
    path(sourceLabel, destinationLabel) {
      const a = slots.get(sourceLabel);
      const b = slots.get(destinationLabel);
      const delta = shortestAngle(a.angle, b.angle);
      return {
        cx,
        cy,
        r0: radius,
        r1: radius,
        a0: a.angle,
        delta,
        ringKeys: ["one"],
      };
    },
  };
}

function ringOrdinal(faceIndex, suffix, order) {
  const local = order.indexOf(suffix);
  if (local < 0) throw new Error(`Suffix ${suffix} is not in ring order`);
  return faceIndex * order.length + local;
}

function makeThreeRings() {
  const cx = 150;
  const cy = 150;
  const rings = [
    { key: "center", cx, cy, r: 42 },
    { key: "edge", cx, cy, r: 87 },
    { key: "corner", cx, cy, r: 129 },
  ];
  const slots = new Map();

  for (let faceIndex = 0; faceIndex < FACE.length; faceIndex += 1) {
    const face = FACE[faceIndex];
    const centerAngle = Math.PI / 2 - (2 * Math.PI * faceIndex) / 6;
    slots.set(`${face}5`, {
      label: `${face}5`,
      ...pointOnRing(cx, cy, rings[0].r, centerAngle),
      angle: centerAngle,
      rings: ["center"],
      center: true,
    });

    for (const suffix of EDGE_ORDER) {
      const ordinal = ringOrdinal(faceIndex, suffix, EDGE_ORDER);
      const angle = Math.PI / 2 - (2 * Math.PI * ordinal) / 24;
      slots.set(`${face}${suffix}`, {
        label: `${face}${suffix}`,
        ...pointOnRing(cx, cy, rings[1].r, angle),
        angle,
        rings: ["edge"],
      });
    }

    for (const suffix of CORNER_ORDER) {
      const ordinal = ringOrdinal(faceIndex, suffix, CORNER_ORDER);
      const angle = Math.PI / 2 - (2 * Math.PI * ordinal) / 24;
      slots.set(`${face}${suffix}`, {
        label: `${face}${suffix}`,
        ...pointOnRing(cx, cy, rings[2].r, angle),
        angle,
        rings: ["corner"],
      });
    }
  }

  return {
    id: "three",
    title: "3 rings",
    viewBox: [0, 0, 300, 300],
    rings,
    slots,
    path(sourceLabel, destinationLabel) {
      const a = slots.get(sourceLabel);
      const b = slots.get(destinationLabel);
      const shared = a.rings.find((key) => b.rings.includes(key));
      if (!shared) throw new Error(`No shared 3-ring route ${sourceLabel}->${destinationLabel}`);
      const ring = rings.find((candidate) => candidate.key === shared);
      return {
        cx,
        cy,
        r0: ring.r,
        r1: ring.r,
        a0: a.angle,
        delta: shortestAngle(a.angle, b.angle),
        ringKeys: [shared],
      };
    },
  };
}

const ROW_FAM = [2, 0, 0, 2, 0, 0];
const COL_FAM = [1, 2, 1, 1, 2, 1];
const ROW_FLIP = [true, false, false, false, false, false];
const COL_FLIP = [true, false, true, true, true, false];
const INNER = [true, true, true, false, false, false];

function ringAt(flip, i, n) {
  return flip ? n - 1 - i : i;
}

function intersect(c0, r0, c1, r1) {
  const dx = c1.x - c0.x;
  const dy = c1.y - c0.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d >= r0 + r1 || d <= Math.abs(r0 - r1)) return null;
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h = Math.sqrt(r0 * r0 - a * a);
  const mx = c0.x + (a * dx) / d;
  const my = c0.y + (a * dy) / d;
  const ox = (-dy / d) * h;
  const oy = (dx / d) * h;
  return [
    { x: mx + ox, y: my + oy },
    { x: mx - ox, y: my - oy },
  ];
}

function pickSide(roots, a, b, third, inner, centers) {
  const ca = centers[a];
  const cb = centers[b];
  const cc = centers[third];
  const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
  const tx = cc.x - mid.x;
  const ty = cc.y - mid.y;
  const [p, q] = roots;
  const sp = (p.x - mid.x) * tx + (p.y - mid.y) * ty;
  const sq = (q.x - mid.x) * tx + (q.y - mid.y) * ty;
  const toward = sp > sq ? p : q;
  return inner ? toward : toward === p ? q : p;
}

function makeNineRings() {
  const O = { x: 150, y: 150 };
  const D = 48;
  const centers = [-90, 30, 150].map((deg) => {
    const t = (deg * Math.PI) / 180;
    return { x: O.x + D * Math.cos(t), y: O.y + D * Math.sin(t) };
  });
  const radii = [73, 87, 101];
  const rings = [];
  for (let fam = 0; fam < 3; fam += 1) {
    for (let idx = 0; idx < 3; idx += 1) {
      rings.push({
        key: `${fam}:${idx}`,
        cx: centers[fam].x,
        cy: centers[fam].y,
        r: radii[idx],
      });
    }
  }

  const ringOf = {
    U: { fam: 0, idx: 0 },
    D: { fam: 0, idx: 2 },
    R: { fam: 1, idx: 0 },
    L: { fam: 1, idx: 2 },
    F: { fam: 2, idx: 0 },
    B: { fam: 2, idx: 2 },
  };

  const slots = new Map();
  const faceCentroids = [];

  for (let f = 0; f < 6; f += 1) {
    const a = ROW_FAM[f];
    const b = COL_FAM[f];
    const third = ringOf[FACE[f]].fam;
    let sumX = 0;
    let sumY = 0;

    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const ri = ringAt(ROW_FLIP[f], r, 3);
        const ci = ringAt(COL_FLIP[f], c, 3);
        const roots = intersect(centers[a], radii[ri], centers[b], radii[ci]);
        const p = roots
          ? pickSide(roots, a, b, third, INNER[f], centers)
          : { x: 0, y: 0 };
        const suffix = 3 * r + c + 1;
        const label = `${FACE[f]}${suffix}`;
        const ringRefs = [`${a}:${ri}`, `${b}:${ci}`];
        slots.set(label, {
          label,
          x: p.x,
          y: p.y,
          face: f,
          rings: ringRefs,
          center: suffix === 5,
        });
        sumX += p.x;
        sumY += p.y;
      }
    }
    faceCentroids[f] = { x: sumX / 9, y: sumY / 9 };
  }

  return {
    id: "nine",
    title: "9 rings",
    viewBox: [0, 0, 300, 300],
    rings,
    slots,
    path(sourceLabel, destinationLabel) {
      const a = slots.get(sourceLabel);
      const b = slots.get(destinationLabel);

      let cx;
      let cy;
      let r0;
      let r1;
      let ringKeys = [];

      if (a.face === b.face) {
        const centroid = faceCentroids[a.face];
        cx = centroid.x;
        cy = centroid.y;
        r0 = Math.hypot(a.x - cx, a.y - cy);
        r1 = Math.hypot(b.x - cx, b.y - cy);
      } else {
        const shared = a.rings.find((key) => b.rings.includes(key));
        if (!shared) throw new Error(`Jevspin route missing for ${sourceLabel}->${destinationLabel}`);
        const ring = rings.find((candidate) => candidate.key === shared);
        cx = ring.cx;
        cy = ring.cy;
        r0 = ring.r;
        r1 = ring.r;
        ringKeys = [shared];
      }

      const a0 = Math.atan2(a.y - cy, a.x - cx);
      const a1 = Math.atan2(b.y - cy, b.x - cx);
      return {
        cx,
        cy,
        r0,
        r1,
        a0,
        delta: shortestAngle(a0, a1),
        ringKeys,
      };
    },
  };
}

export function createGraphLayout(mode, data) {
  if (mode === "one") return makeOneCircle(data);
  if (mode === "three") return makeThreeRings();
  if (mode === "nine") return makeNineRings();
  throw new Error(`Unknown graph mode: ${mode}`);
}

export function verifyGraphLayouts(data) {
  for (const mode of ["one", "three", "nine"]) {
    const layout = createGraphLayout(mode, data);
    for (const slot of data.slots) {
      if (!layout.slots.has(slot.label)) {
        throw new Error(`${mode} layout missing ${slot.label}`);
      }
    }
    for (const face of FACE) {
      if (!layout.slots.has(`${face}5`)) {
        throw new Error(`${mode} layout missing center ${face}5`);
      }
    }

    for (const move of Object.values(data.moves)) {
      for (const permutation of [move.permutation, move.inverse_permutation]) {
        for (let source = 0; source < 48; source += 1) {
          const destination = permutation[source];
          if (source === destination) continue;
          layout.path(data.slots[source].label, data.slots[destination].label);
        }
      }
    }
  }
  return true;
}
