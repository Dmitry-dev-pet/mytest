export const FACE_BASIS = {
  U: { n: [0, 1, 0], a: [1, 0, 0], b: [0, 0, 1] },
  R: { n: [1, 0, 0], a: [0, 0, -1], b: [0, -1, 0] },
  F: { n: [0, 0, 1], a: [1, 0, 0], b: [0, -1, 0] },
  D: { n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, -1] },
  L: { n: [-1, 0, 0], a: [0, 0, 1], b: [0, -1, 0] },
  B: { n: [0, 0, -1], a: [-1, 0, 0], b: [0, -1, 0] },
};

const add = (u, v) => u.map((x, i) => x + v[i]);
const sub = (u, v) => u.map((x, i) => x - v[i]);
const scale = (u, s) => u.map((x) => x * s);
export const dot3 = (u, v) => u.reduce((sum, x, i) => sum + x * v[i], 0);
const cross = (u, v) => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];

export function parseFaceletLabel(label) {
  const match = /^([URFDLB])([1-9])$/.exec(label);
  if (!match) throw new Error(`Invalid facelet label: ${label}`);
  const face = match[1];
  const index = Number(match[2]);
  return {
    face,
    index,
    row: Math.floor((index - 1) / 3),
    col: (index - 1) % 3,
  };
}

export function faceletLabelFromCoord(face, coord) {
  const basis = FACE_BASIS[face];
  if (!basis) throw new Error(`Unknown face: ${face}`);
  if (Math.round(dot3(coord, basis.n)) !== 1) {
    throw new Error(`Coordinate ${coord.join(",")} is not on face ${face}`);
  }
  const offset = sub(coord, basis.n);
  const col = Math.round(dot3(offset, basis.a) + 1);
  const row = Math.round(dot3(offset, basis.b) + 1);
  if (row < 0 || row > 2 || col < 0 || col > 2) {
    throw new Error(`Invalid row/col for ${face} at ${coord.join(",")}`);
  }
  return `${face}${3 * row + col + 1}`;
}

export function facesForCoord(coord) {
  return Object.keys(FACE_BASIS).filter((face) => dot3(coord, FACE_BASIS[face].n) === 1);
}

export function faceletGeometry(label, facePlane = 1.505, stickerHalf = 0.39) {
  const { face, row, col } = parseFaceletLabel(label);
  const basis = FACE_BASIS[face];
  const center = add(
    scale(basis.n, facePlane),
    add(scale(basis.a, col - 1), scale(basis.b, row - 1)),
  );
  const da = scale(basis.a, stickerHalf);
  const db = scale(basis.b, stickerHalf);
  return {
    face,
    center,
    normal: [...basis.n],
    corners: [
      add(add(center, scale(da, -1)), scale(db, -1)),
      add(add(center, da), scale(db, -1)),
      add(add(center, da), db),
      add(add(center, scale(da, -1)), db),
    ],
  };
}

export function rotateAroundAxis(vector, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(
    add(scale(vector, c), scale(cross(axis, vector), s)),
    scale(axis, dot3(axis, vector) * (1 - c)),
  );
}

export function moveAxis(face) {
  const basis = FACE_BASIS[face];
  if (!basis) throw new Error(`Unknown move face: ${face}`);
  return [...basis.n];
}

export function rotateFaceletGeometry(geometry, face, signedProgress) {
  const axis = moveAxis(face);
  const angle = -(Math.PI / 2) * signedProgress;
  return {
    ...geometry,
    center: rotateAroundAxis(geometry.center, axis, angle),
    normal: rotateAroundAxis(geometry.normal, axis, angle),
    corners: geometry.corners.map((corner) => rotateAroundAxis(corner, axis, angle)),
  };
}

function vectorDistance(a, b) {
  return Math.max(...a.map((x, i) => Math.abs(x - b[i])));
}

function geometryDistance(a, b) {
  const cornerSetError = Math.max(
    ...a.corners.map((corner) =>
      Math.min(...b.corners.map((candidate) => vectorDistance(corner, candidate))),
    ),
  );
  return Math.max(
    vectorDistance(a.center, b.center),
    vectorDistance(a.normal, b.normal),
    cornerSetError,
  );
}

export function verifyMoveGeometry(data, tolerance = 1e-9) {
  for (const face of Object.keys(data.moves)) {
    const move = data.moves[face];
    for (const sign of [1, -1]) {
      const permutation = sign === 1 ? move.permutation : move.inverse_permutation;
      for (let source = 0; source < permutation.length; source += 1) {
        const destination = permutation[source];
        if (destination === source) continue;
        const sourceGeometry = faceletGeometry(data.slots[source].label);
        const rotated = rotateFaceletGeometry(sourceGeometry, face, sign);
        const destinationGeometry = faceletGeometry(data.slots[destination].label);
        const error = geometryDistance(rotated, destinationGeometry);
        if (error > tolerance) {
          throw new Error(
            `3D geometry mismatch for ${face}${sign === -1 ? "'" : ""} ` +
            `${data.slots[source].label}->${data.slots[destination].label}: ${error}`,
          );
        }
      }
    }
  }
  return true;
}
