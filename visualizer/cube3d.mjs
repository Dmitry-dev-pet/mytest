import { FACE_COLORS, easeCubic } from "./core.mjs";

const FACE_GEOMETRY = {
  U: { n: [0, 1, 0], a: [1, 0, 0], b: [0, 0, 1] },
  R: { n: [1, 0, 0], a: [0, 0, -1], b: [0, -1, 0] },
  F: { n: [0, 0, 1], a: [1, 0, 0], b: [0, -1, 0] },
  D: { n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, -1] },
  L: { n: [-1, 0, 0], a: [0, 0, 1], b: [0, -1, 0] },
  B: { n: [0, 0, -1], a: [-1, 0, 0], b: [0, -1, 0] },
};

const FACE_PLANE = 1.52;
const STICKER_HALF = 0.425;
const CUBE_HALF = 1.56;

const add = (u, v) => u.map((x, i) => x + v[i]);
const sub = (u, v) => u.map((x, i) => x - v[i]);
const scale = (u, s) => u.map((x) => x * s);
const dot = (u, v) => u.reduce((sum, x, i) => sum + x * v[i], 0);
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
  const row = Math.floor((index - 1) / 3);
  const col = (index - 1) % 3;
  return { face, index, row, col };
}

export function faceletGeometry(label, stickerHalf = STICKER_HALF) {
  const { face, row, col } = parseFaceletLabel(label);
  const basis = FACE_GEOMETRY[face];
  const center = add(
    scale(basis.n, FACE_PLANE),
    add(scale(basis.a, col - 1), scale(basis.b, row - 1)),
  );
  const da = scale(basis.a, stickerHalf);
  const db = scale(basis.b, stickerHalf);
  const corners = [
    add(add(center, scale(da, -1)), scale(db, -1)),
    add(add(center, da), scale(db, -1)),
    add(add(center, da), db),
    add(add(center, scale(da, -1)), db),
  ];
  return {
    face,
    center,
    normal: [...basis.n],
    corners,
  };
}

export function rotateAroundAxis(vector, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(
    add(scale(vector, c), scale(cross(axis, vector), s)),
    scale(axis, dot(axis, vector) * (1 - c)),
  );
}

export function moveAxis(face) {
  const basis = FACE_GEOMETRY[face];
  if (!basis) throw new Error(`Unknown face axis: ${face}`);
  return [...basis.n];
}

export function rotateGeometry(geometry, face, signedProgress) {
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
        const rotated = rotateGeometry(sourceGeometry, face, sign);
        const destinationGeometry = faceletGeometry(data.slots[destination].label);
        const error = geometryDistance(rotated, destinationGeometry);
        if (error > tolerance) {
          throw new Error(
            `3D geometry mismatch for ${face}${sign === -1 ? "'" : ""} ` +
            `${data.slots[source].label} -> ${data.slots[destination].label}: ${error}`,
          );
        }
      }
    }
  }
  return true;
}

function committedTokenGeometry(data, state) {
  const byToken = new Array(state.length);
  for (let slot = 0; slot < state.length; slot += 1) {
    const token = state[slot];
    byToken[token] = {
      token,
      label: data.slots[token].label,
      geometry: faceletGeometry(data.slots[slot].label),
      moving: false,
    };
  }
  return byToken;
}

function activeTokenGeometry(data, active, t) {
  const u = easeCubic(t);
  const byToken = new Array(active.old.length);
  for (let source = 0; source < active.old.length; source += 1) {
    const token = active.old[source];
    const destination = active.permutation[source];
    let geometry = faceletGeometry(data.slots[source].label);
    if (destination !== source) {
      geometry = rotateGeometry(geometry, active.face, active.sign * u);
    }
    byToken[token] = {
      token,
      label: data.slots[token].label,
      geometry,
      moving: destination !== source,
    };
  }
  return byToken;
}

export function cubeTokenGeometry(data, state, active = null, t = 0) {
  return active
    ? activeTokenGeometry(data, active, t)
    : committedTokenGeometry(data, state);
}

function rotateY(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
}

function rotateX(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
}

function cameraTransform(v, yaw, pitch) {
  return rotateX(rotateY(v, yaw), pitch);
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const crosses = yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function shadeColor(hex, factor) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const f = Math.max(0.42, Math.min(1.08, factor));
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

function cubeFacePolygon(face) {
  const basis = FACE_GEOMETRY[face];
  const center = scale(basis.n, CUBE_HALF);
  const da = scale(basis.a, 1.5);
  const db = scale(basis.b, 1.5);
  return {
    face,
    normal: basis.n,
    corners: [
      add(add(center, scale(da, -1)), scale(db, -1)),
      add(add(center, da), scale(db, -1)),
      add(add(center, da), db),
      add(add(center, scale(da, -1)), db),
    ],
  };
}

function centerSticker(face) {
  const basis = FACE_GEOMETRY[face];
  const center = scale(basis.n, FACE_PLANE);
  const da = scale(basis.a, STICKER_HALF);
  const db = scale(basis.b, STICKER_HALF);
  return {
    face,
    normal: basis.n,
    corners: [
      add(add(center, scale(da, -1)), scale(db, -1)),
      add(add(center, da), scale(db, -1)),
      add(add(center, da), db),
      add(add(center, scale(da, -1)), db),
    ],
  };
}

export class CubeRenderer {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onHover = callbacks.onHover ?? (() => {});
    this.onClick = callbacks.onClick ?? (() => {});
    this.yaw = -0.62;
    this.pitch = 0.48;
    this.cameraDistance = 7.2;
    this.hitRegions = [];
    this.drag = null;
    this.wasDragged = false;

    canvas.addEventListener("pointerdown", (event) => {
      this.drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        yaw: this.yaw,
        pitch: this.pitch,
      };
      this.wasDragged = false;
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (this.drag && event.pointerId === this.drag.id) {
        const dx = event.clientX - this.drag.x;
        const dy = event.clientY - this.drag.y;
        if (Math.hypot(dx, dy) > 3) this.wasDragged = true;
        this.yaw = this.drag.yaw + dx * 0.009;
        this.pitch = Math.max(-1.2, Math.min(1.2, this.drag.pitch + dy * 0.009));
        return;
      }
      const token = this.hitTest(event);
      this.onHover(token);
    });

    const release = (event) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      if (!this.wasDragged) {
        const token = this.hitTest(event);
        if (token !== null) this.onClick(token);
      }
      this.drag = null;
    };

    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointerleave", () => {
      if (!this.drag) this.onHover(null);
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  project(world, viewport) {
    const camera = cameraTransform(world, this.yaw, this.pitch);
    const baseScale = Math.min(viewport.width, viewport.height) * 0.205;
    const perspective = this.cameraDistance / (this.cameraDistance - camera[2]);
    return {
      x: viewport.width / 2 + camera[0] * baseScale * perspective,
      y: viewport.height / 2 - camera[1] * baseScale * perspective,
      z: camera[2],
      perspective,
    };
  }

  transformNormal(normal) {
    return cameraTransform(normal, this.yaw, this.pitch);
  }

  hitTest(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    for (let i = this.hitRegions.length - 1; i >= 0; i -= 1) {
      const region = this.hitRegions[i];
      if (pointInPolygon(x, y, region.points)) return region.token;
    }
    return null;
  }

  draw({
    data,
    state,
    active = null,
    t = 0,
    selectedToken = null,
    showLabels = true,
    highlightMoving = true,
  }) {
    const viewport = this.resize();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, viewport.width, viewport.height);

    const glow = ctx.createRadialGradient(
      viewport.width * 0.5,
      viewport.height * 0.45,
      10,
      viewport.width * 0.5,
      viewport.height * 0.45,
      Math.max(viewport.width, viewport.height) * 0.58,
    );
    glow.addColorStop(0, "rgba(56, 189, 248, 0.10)");
    glow.addColorStop(1, "rgba(3, 7, 18, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    const surfaces = [];

    for (const face of Object.keys(FACE_GEOMETRY)) {
      const base = cubeFacePolygon(face);
      const normal = this.transformNormal(base.normal);
      if (normal[2] <= 0) continue;
      const points = base.corners.map((corner) => this.project(corner, viewport));
      surfaces.push({
        kind: "base",
        depth: points.reduce((sum, point) => sum + point.z, 0) / points.length,
        normal,
        points,
      });

      const center = centerSticker(face);
      const centerNormal = this.transformNormal(center.normal);
      const centerPoints = center.corners.map((corner) => this.project(corner, viewport));
      surfaces.push({
        kind: "center",
        face,
        depth: centerPoints.reduce((sum, point) => sum + point.z, 0) / centerPoints.length + 0.001,
        normal: centerNormal,
        points: centerPoints,
      });
    }

    const tokens = cubeTokenGeometry(data, state, active, t);
    for (const item of tokens) {
      const normal = this.transformNormal(item.geometry.normal);
      if (normal[2] <= 0.015) continue;
      const points = item.geometry.corners.map((corner) => this.project(corner, viewport));
      surfaces.push({
        kind: "token",
        token: item.token,
        label: item.label,
        moving: item.moving,
        depth: points.reduce((sum, point) => sum + point.z, 0) / points.length + 0.002,
        normal,
        points,
      });
    }

    surfaces.sort((a, b) => a.depth - b.depth);
    this.hitRegions = [];

    for (const surface of surfaces) {
      const points = surface.points;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();

      if (surface.kind === "base") {
        ctx.fillStyle = "rgba(5, 10, 18, 0.96)";
        ctx.fill();
        ctx.strokeStyle = "rgba(148, 163, 184, 0.24)";
        ctx.lineWidth = 1;
        ctx.stroke();
        continue;
      }

      const tokenFace = surface.kind === "center"
        ? surface.face
        : data.slots[surface.token].solved_color;
      const light = 0.52 + Math.max(0, surface.normal[2]) * 0.55;
      ctx.fillStyle = shadeColor(FACE_COLORS[tokenFace], light);
      ctx.fill();

      const selected = surface.kind === "token" && surface.token === selectedToken;
      const moving = surface.kind === "token" && surface.moving;

      ctx.strokeStyle = selected
        ? "#7dd3fc"
        : highlightMoving && moving
          ? "rgba(125, 211, 252, 0.72)"
          : "rgba(2, 6, 23, 0.92)";
      ctx.lineWidth = selected ? 3.2 : highlightMoving && moving ? 2.2 : 1.5;
      ctx.stroke();

      if (surface.kind === "token") {
        this.hitRegions.push({ token: surface.token, points });

        if (showLabels && selected) {
          const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
          const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
          ctx.fillStyle = tokenFace === "U" || tokenFace === "D" ? "#111827" : "#f8fafc";
          ctx.font = "800 12px ui-monospace, SFMono-Regular, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(surface.label, x, y);
        }
      }
    }

    ctx.fillStyle = "rgba(148, 163, 184, 0.78)";
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("drag to rotate · click a sticker to pin", 14, viewport.height - 14);
  }
}
