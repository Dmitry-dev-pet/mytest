import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PCFSoftShadowMap,
  Raycaster,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FACE_COLORS } from "./core.mjs";
import {
  FACE_BASIS,
  faceletLabelFromCoord,
  facesForCoord,
  moveAxis,
} from "./cube-math.mjs";

const PLASTIC = "#090b0f";
const BODY_SIZE = 0.92;
const STICKER_SIZE = 0.76;
const STICKER_RADIUS = 0.115;
const STICKER_OFFSET = BODY_SIZE / 2 + 0.008;

const spring = (t) =>
  t >= 1 ? 1 : 1 - Math.exp(-5 * t) * Math.cos(4 * t);

function roundedRect(size, radius) {
  const s = size / 2;
  const r = radius;
  const shape = new Shape();
  shape.moveTo(-s + r, -s);
  shape.lineTo(s - r, -s);
  shape.quadraticCurveTo(s, -s, s, -s + r);
  shape.lineTo(s, s - r);
  shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(-s + r, s);
  shape.quadraticCurveTo(-s, s, -s, s - r);
  shape.lineTo(-s, -s + r);
  shape.quadraticCurveTo(-s, -s, -s + r, -s);
  return shape;
}

const bodyGeometry = new RoundedBoxGeometry(
  BODY_SIZE,
  BODY_SIZE,
  BODY_SIZE,
  5,
  0.085,
);
const stickerGeometry = new ShapeGeometry(roundedRect(STICKER_SIZE, STICKER_RADIUS));

const bodyMaterial = new MeshPhysicalMaterial({
  color: new Color(PLASTIC),
  roughness: 0.34,
  metalness: 0.02,
  clearcoat: 0.2,
  clearcoatRoughness: 0.32,
});

function stickerMaterial(color) {
  return new MeshPhysicalMaterial({
    color: new Color(color),
    roughness: 0.24,
    metalness: 0,
    clearcoat: 0.28,
    clearcoatRoughness: 0.22,
    emissive: new Color("#000000"),
    emissiveIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

function orientSticker(mesh, face) {
  if (face === "R") {
    mesh.rotation.y = Math.PI / 2;
    mesh.position.x = STICKER_OFFSET;
  } else if (face === "L") {
    mesh.rotation.y = -Math.PI / 2;
    mesh.position.x = -STICKER_OFFSET;
  } else if (face === "U") {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = STICKER_OFFSET;
  } else if (face === "D") {
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = -STICKER_OFFSET;
  } else if (face === "F") {
    mesh.position.z = STICKER_OFFSET;
  } else if (face === "B") {
    mesh.rotation.y = Math.PI;
    mesh.position.z = -STICKER_OFFSET;
  }
}

function stateSignature(state) {
  return state.join(",");
}

function layerContains(position, face) {
  const axis = FACE_BASIS[face].n;
  return Math.round(
    position.x * axis[0] + position.y * axis[1] + position.z * axis[2],
  ) === 1;
}

export class ThreeCubeView {
  constructor(host, callbacks = {}) {
    this.host = host;
    this.onHover = callbacks.onHover ?? (() => {});
    this.onClick = callbacks.onClick ?? (() => {});
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(30, 1, 0.1, 60);
    this.camera.position.set(6.7, 5.35, 7.25);

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    host.replaceChildren(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 7.4;
    this.controls.maxDistance = 13.5;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = Math.PI - 0.25;
    this.controls.target.set(0, 0, 0);

    this.root = new Group();
    this.scene.add(this.root);

    this.raycaster = new Raycaster();
    this.pointer = new Vector2();
    this.cubies = [];
    this.stickerMeshes = [];
    this.pivot = null;
    this.activeRef = null;
    this.stateSig = "";
    this.selectedToken = null;

    this.setupStudio();
    this.bindPointer();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  setupStudio() {
    this.scene.add(new AmbientLight(0xffffff, 0.42));

    const key = new DirectionalLight(0xffffff, 3.0);
    key.position.set(4.8, 7.8, 6.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 24;
    key.shadow.bias = -0.00035;
    this.scene.add(key);

    const fill = new DirectionalLight(0xffe6c8, 1.15);
    fill.position.set(-5.0, 2.8, 1.5);
    this.scene.add(fill);

    const rim = new DirectionalLight(0x74b9ff, 1.45);
    rim.position.set(1.0, 4.0, -6.0);
    this.scene.add(rim);

    const floor = new Mesh(
      new PlaneGeometry(14, 14),
      new MeshPhysicalMaterial({
        color: new Color("#ddd8cc"),
        roughness: 0.76,
        metalness: 0,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.53;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  resize() {
    const width = Math.max(1, this.host.clientWidth || 480);
    const height = Math.max(1, this.host.clientHeight || 430);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  bindPointer() {
    const canvas = this.renderer.domElement;

    const pick = (event) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.stickerMeshes, false)[0];
      return Number.isInteger(hit?.object?.userData?.token)
        ? hit.object.userData.token
        : null;
    };

    canvas.addEventListener("pointermove", (event) => {
      if (event.buttons) return;
      this.onHover(pick(event));
    });
    canvas.addEventListener("pointerleave", () => this.onHover(null));
    canvas.addEventListener("click", (event) => {
      const token = pick(event);
      if (token !== null) this.onClick(token);
    });
  }

  disposeRoot() {
    this.root.clear();
    this.cubies = [];
    this.stickerMeshes = [];
    this.pivot = null;
  }

  buildState(data, state) {
    this.disposeRoot();
    this.stateSig = stateSignature(state);
    this.activeRef = null;

    const slotByLabel = new Map(data.slots.map((slot) => [slot.label, slot.id]));

    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (let z = -1; z <= 1; z += 1) {
          if (x === 0 && y === 0 && z === 0) continue;
          const coord = [x, y, z];
          const cubie = new Group();
          cubie.position.set(x, y, z);

          const body = new Mesh(bodyGeometry, bodyMaterial);
          body.castShadow = true;
          body.receiveShadow = true;
          cubie.add(body);

          for (const face of facesForCoord(coord)) {
            const label = faceletLabelFromCoord(face, coord);
            const parsedIndex = Number(label.slice(1));

            let token = null;
            let colorFace = face;
            if (parsedIndex !== 5) {
              const slot = slotByLabel.get(label);
              token = state[slot];
              colorFace = data.slots[token].solved_color;
            }

            const sticker = new Mesh(
              stickerGeometry,
              stickerMaterial(FACE_COLORS[colorFace]),
            );
            orientSticker(sticker, face);
            sticker.castShadow = true;
            sticker.userData.token = token;
            sticker.userData.homeLabel =
              token === null ? `${face}5` : data.slots[token].label;
            cubie.add(sticker);

            if (token !== null) this.stickerMeshes.push(sticker);
          }

          this.root.add(cubie);
          this.cubies.push(cubie);
        }
      }
    }

    this.updateSelection(this.selectedToken);
  }

  beginMove(data, state, active) {
    this.buildState(data, state);
    this.activeRef = active;

    const pivot = new Group();
    this.root.add(pivot);

    const layer = this.cubies.filter((cubie) =>
      layerContains(cubie.position, active.face),
    );
    for (const cubie of layer) pivot.attach(cubie);
    this.pivot = pivot;
  }

  updateSelection(token) {
    this.selectedToken = token;
    for (const mesh of this.stickerMeshes) {
      const selected = mesh.userData.token === token;
      mesh.material.emissive.set(selected ? "#7dd3fc" : "#000000");
      mesh.material.emissiveIntensity = selected ? 0.55 : 0;
      mesh.scale.setScalar(selected ? 1.055 : 1);
    }
  }

  renderFrame({ data, state, active, t, selectedToken = null }) {
    const sig = stateSignature(state);

    if (active) {
      if (this.activeRef !== active) {
        this.beginMove(data, state, active);
      }
      const axisArray = moveAxis(active.face);
      const axis = new Vector3(...axisArray).normalize();
      const e = spring(t);
      this.pivot.quaternion.setFromAxisAngle(
        axis,
        -(Math.PI / 2) * active.sign * e,
      );
    } else if (this.activeRef || this.stateSig !== sig || this.cubies.length === 0) {
      this.buildState(data, state);
    }

    if (selectedToken !== this.selectedToken) {
      this.updateSelection(selectedToken);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
