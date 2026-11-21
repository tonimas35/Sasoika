/**
 * Maniquí 3D de Sasoika — geometría procedural (sin modelos externos).
 * Diseño anatómico basado en la propuesta de ChatGPT: superficies continuas
 * por secciones elípticas y músculos que siguen la superficie de la piel.
 *
 * API: mountMannequin(container) · paintMuscles({ pecho: 0..1, ... }) · disposeMannequin()
 * Ejes: +Y arriba, +Z delante.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const SKIN = new THREE.Color("#f1f1ee");
const MUSCLE_0 = new THREE.Color("#e4e4df");
const MUSCLE_1 = new THREE.Color("#141414");
const HEIGHT = 1.78;

let scene, camera, renderer, controls, mannequin, envTarget, raf, resizeObs;
const muscles = new Map();
const geos = new Set();
const mats = new Set();

const { clamp, lerp } = THREE.MathUtils;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- materiales y mallas ----------
function material(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: color.clone(), roughness: 0.78, metalness: 0, side: THREE.DoubleSide, ...opts });
  mats.add(m); return m;
}
const skinMat = () => material(SKIN);
const muscleMat = () => material(MUSCLE_0, { roughness: 0.84, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

function mesh(geometry, mat, parent = mannequin) {
  geos.add(geometry);
  const m = new THREE.Mesh(geometry, mat);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
function muscleMesh(name, geometry) {
  const m = mesh(geometry, muscleMat()); m.renderOrder = 2;
  if (!muscles.has(name)) muscles.set(name, []);
  muscles.get(name).push(m); return m;
}

// ---------- utilidades de superficie ----------
function interp(profile, y) {
  const norm = (p) => ({ y: p.y, x: p.x ?? 0, z: p.z ?? 0, rx: p.rx, rz: p.rz });
  if (y <= profile[0].y) return norm(profile[0]);
  const last = profile[profile.length - 1];
  if (y >= last.y) return norm(last);
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y), s = t * t * (3 - 2 * t);
      return { y, x: lerp(a.x ?? 0, b.x ?? 0, s), z: lerp(a.z ?? 0, b.z ?? 0, s), rx: lerp(a.rx, b.rx, s), rz: lerp(a.rz, b.rz, s) };
    }
  }
  return norm(last);
}

function grid(rows, cols, sampler) {
  const pos = [], idx = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) { const p = sampler(j / cols, i / rows); pos.push(p.x, p.y, p.z); }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function loft(profile, radial = 32, vertical = 48) {
  const y0 = profile[0].y, y1 = profile[profile.length - 1].y;
  return grid(vertical, radial, (u, v) => {
    const y = lerp(y0, y1, v), p = interp(profile, y), th = u * Math.PI * 2;
    return { x: p.x + Math.sin(th) * p.rx, y, z: p.z + Math.cos(th) * p.rz };
  });
}

function surfPoint(profile, y, th, lift = 0) {
  const p = interp(profile, y);
  return new THREE.Vector3(p.x + Math.sin(th) * (p.rx + lift), y, p.z + Math.cos(th) * (p.rz + lift));
}

// Parche muscular que sigue la superficie (sin "óvalos pegados")
function patch(name, profile, { y0, y1, theta0, theta1, lift = 0.0035, shape = null, rows = 18, cols = 14, exp = 0.36, relief = 0.002 }) {
  const g = grid(rows, cols, (u, v) => {
    const y = lerp(y0, y1, v);
    const env = Math.pow(Math.max(0, Math.sin(Math.PI * v)), exp);
    const half = ((theta1 - theta0) / 2) * env * (shape ? shape(v) : 1);
    const th = (theta0 + theta1) / 2 + (2 * u - 1) * half;
    const vol = relief * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    return surfPoint(profile, y, th, lift + Math.max(0, vol));
  });
  return muscleMesh(name, g);
}

// ---------- tronco ----------
const TORSO = [
  { y: 0.86, rx: 0.115, rz: 0.088, z: 0 },
  { y: 0.89, rx: 0.144, rz: 0.105, z: 0 },
  { y: 0.94, rx: 0.157, rz: 0.111, z: 0 },
  { y: 0.99, rx: 0.146, rz: 0.106, z: 0 },
  { y: 1.04, rx: 0.127, rz: 0.092, z: 0.002 },
  { y: 1.10, rx: 0.135, rz: 0.099, z: 0.004 },
  { y: 1.17, rx: 0.164, rz: 0.116, z: 0.002 },
  { y: 1.24, rx: 0.191, rz: 0.132, z: 0 },
  { y: 1.31, rx: 0.202, rz: 0.135, z: -0.003 },
  { y: 1.37, rx: 0.200, rz: 0.125, z: -0.006 },
  { y: 1.415, rx: 0.187, rz: 0.112, z: -0.010 },
  { y: 1.445, rx: 0.155, rz: 0.095, z: -0.010 },
  { y: 1.475, rx: 0.100, rz: 0.075, z: -0.007 },
  { y: 1.505, rx: 0.065, rz: 0.062, z: -0.003 },
];

function buildTorso() {
  mesh(loft(TORSO, 48, 72), skinMat());

  // Pectorales
  for (const s of [-1, 1]) patch("pecho", TORSO, {
    y0: 1.245, y1: 1.403, theta0: s === 1 ? 0.09 : -1.18, theta1: s === 1 ? 1.18 : -0.09, lift: 0.0045, rows: 22, cols: 18,
    exp: 0.38, relief: 0.0022,
    shape: (v) => (0.45 + 0.55 * smoothstep(0, 0.24, v)) * (1 - 0.22 * smoothstep(0.72, 1, v)),
  });

  // Abdomen: recto abdominal en 6 bloques + oblicuos
  for (const s of [-1, 1]) {
    for (const [y0, y1] of [[1.075, 1.133], [1.14, 1.198], [1.205, 1.257]])
      patch("core", TORSO, { y0, y1, theta0: s === 1 ? 0.055 : -0.47, theta1: s === 1 ? 0.47 : -0.055, lift: 0.0027, rows: 10, cols: 10 });
    patch("core", TORSO, { y0: 1.025, y1: 1.208, theta0: s === 1 ? 0.68 : -1.47, theta1: s === 1 ? 1.47 : -0.68, lift: 0.0028,
      shape: (v) => 0.75 + 0.25 * Math.sin(v * Math.PI) });
  }

  // Espalda: dorsales, trapecio y lumbares
  for (const s of [-1, 1]) {
    const c = Math.PI + s * 0.57;
    patch("espalda", TORSO, { y0: 1.055, y1: 1.362, theta0: c - 0.66, theta1: c + 0.66, lift: 0.0035, rows: 28, cols: 18,
      shape: (v) => 0.42 + 0.58 * smoothstep(0.08, 0.75, v) });
    patch("espalda", TORSO, { y0: 1.355, y1: 1.474, theta0: Math.PI + s * 0.12 - 0.35, theta1: Math.PI + s * 0.12 + 0.35, lift: 0.003 });
    patch("espalda", TORSO, { y0: 0.99, y1: 1.19, theta0: Math.PI + s * 0.24 - 0.18, theta1: Math.PI + s * 0.24 + 0.18, lift: 0.003 });
  }

  // Glúteos
  for (const s of [-1, 1]) {
    const c = Math.PI + s * 0.75;
    patch("gluteos", TORSO, { y0: 0.865, y1: 1.005, theta0: c - 0.68, theta1: c + 0.68, lift: 0.004,
      shape: (v) => 0.85 + 0.15 * Math.sin(v * Math.PI) });
  }
}

// ---------- piernas ----------
function legProfile(s) {
  return [
    { y: 0.105, x: s * 0.105, z: -0.012, rx: 0.043, rz: 0.044 },
    { y: 0.16, x: s * 0.108, z: -0.015, rx: 0.047, rz: 0.052 },
    { y: 0.255, x: s * 0.116, z: -0.022, rx: 0.069, rz: 0.076 },
    { y: 0.355, x: s * 0.121, z: -0.020, rx: 0.076, rz: 0.082 },
    { y: 0.455, x: s * 0.126, z: 0.003, rx: 0.061, rz: 0.066 },
    { y: 0.505, x: s * 0.128, z: 0.012, rx: 0.069, rz: 0.072 },
    { y: 0.585, x: s * 0.132, z: 0.012, rx: 0.092, rz: 0.098 },
    { y: 0.68, x: s * 0.130, z: 0.006, rx: 0.110, rz: 0.111 },
    { y: 0.77, x: s * 0.125, z: 0.002, rx: 0.119, rz: 0.118 },
    { y: 0.86, x: s * 0.119, z: -0.002, rx: 0.113, rz: 0.111 },
    { y: 0.915, x: s * 0.115, z: 0, rx: 0.090, rz: 0.087 },
  ];
}

function buildLeg(s) {
  const p = legProfile(s);
  mesh(loft(p, 28, 48), skinMat());
  patch("cuadriceps", p, { y0: 0.492, y1: 0.855, theta0: -1.04, theta1: 1.04, lift: 0.0038, rows: 30, cols: 18, exp: 0.33, relief: 0.0016,
    shape: (v) => 0.78 + 0.22 * Math.sin(v * Math.PI) });
  patch("cuadriceps", p, { y0: 0.545, y1: 0.835, theta0: s === 1 ? 0.9 : -1.55, theta1: s === 1 ? 1.55 : -0.9, lift: 0.0035, exp: 0.33, relief: 0.0016 });
  patch("isquios", p, { y0: 0.515, y1: 0.858, theta0: Math.PI - 1.12, theta1: Math.PI + 1.12, lift: 0.0037, rows: 28, cols: 18, exp: 0.33, relief: 0.0016 });
  patch("gemelos", p, { y0: 0.173, y1: 0.415, theta0: Math.PI - 1.17, theta1: Math.PI + 1.17, lift: 0.0038, rows: 22, cols: 18, exp: 0.33, relief: 0.0016,
    shape: (v) => 0.7 + 0.3 * Math.sin(Math.PI * v) });

  // Rótula
  const knee = mesh(new THREE.SphereGeometry(1, 18, 12), skinMat());
  knee.position.set(s * 0.126, 0.472, 0.062); knee.scale.set(0.05, 0.061, 0.026);

  // Pie
  const fp = [
    { z: -0.065, rx: 0.037, ry: 0.034, y: 0.047 }, { z: -0.04, rx: 0.049, ry: 0.052, y: 0.056 },
    { z: 0, rx: 0.056, ry: 0.058, y: 0.052 }, { z: 0.045, rx: 0.067, ry: 0.04, y: 0.04 },
    { z: 0.105, rx: 0.072, ry: 0.027, y: 0.032 }, { z: 0.157, rx: 0.055, ry: 0.021, y: 0.028 },
    { z: 0.183, rx: 0.02, ry: 0.016, y: 0.025 }, { z: 0.19, rx: 0.002, ry: 0.002, y: 0.025 },
  ];
  const foot = mesh(grid(24, 24, (u, v) => {
    const k = v * (fp.length - 1), i = Math.min(Math.floor(k), fp.length - 2), t = k - i, a = fp[i], b = fp[i + 1], th = u * Math.PI * 2;
    return { x: s * 0.105 + Math.sin(th) * lerp(a.rx, b.rx, t), y: lerp(a.y, b.y, t) + Math.cos(th) * lerp(a.ry, b.ry, t), z: lerp(a.z, b.z, t) };
  }), skinMat());
  foot.rotation.y = s * 0.055;
}

// ---------- brazos ----------
function armProfile(s) {
  return [
    { y: 0.925, x: s * 0.362, z: 0.018, rx: 0.036, rz: 0.037 },
    { y: 0.99, x: s * 0.365, z: 0.015, rx: 0.044, rz: 0.043 },
    { y: 1.065, x: s * 0.368, z: 0.008, rx: 0.056, rz: 0.053 },
    { y: 1.145, x: s * 0.362, z: 0, rx: 0.066, rz: 0.062 },
    { y: 1.185, x: s * 0.358, z: -0.009, rx: 0.054, rz: 0.052 },
    { y: 1.255, x: s * 0.344, z: -0.015, rx: 0.072, rz: 0.068 },
    { y: 1.335, x: s * 0.316, z: -0.017, rx: 0.081, rz: 0.076 },
    { y: 1.405, x: s * 0.269, z: -0.011, rx: 0.091, rz: 0.085 },
    { y: 1.455, x: s * 0.225, z: -0.009, rx: 0.081, rz: 0.076 },
    { y: 1.477, x: s * 0.199, z: -0.008, rx: 0.055, rz: 0.057 },
  ];
}

function buildArm(s) {
  const p = armProfile(s);
  mesh(loft(p, 26, 48), skinMat());
  patch("biceps", p, { y0: 1.205, y1: 1.392, theta0: -0.9, theta1: 0.9, lift: 0.0036, rows: 20, cols: 14, exp: 0.33, relief: 0.0016 });
  patch("triceps", p, { y0: 1.195, y1: 1.402, theta0: Math.PI - 1.05, theta1: Math.PI + 1.05, lift: 0.0036, rows: 20, cols: 14, exp: 0.33, relief: 0.0016 });
  patch("hombros", p, { y0: 1.34, y1: 1.473, theta0: -Math.PI, theta1: Math.PI, lift: 0.0043, rows: 20, cols: 32, exp: 0.33, relief: 0.0016 });

  // Mano estilizada + pulgar
  const x = s * 0.362;
  mesh(loft([
    { y: 0.79, x: x + s * 0.003, z: 0.027, rx: 0.02, rz: 0.018 },
    { y: 0.805, x: x + s * 0.002, z: 0.026, rx: 0.032, rz: 0.02 },
    { y: 0.845, x, z: 0.022, rx: 0.039, rz: 0.022 },
    { y: 0.9, x, z: 0.019, rx: 0.032, rz: 0.025 },
    { y: 0.93, x, z: 0.017, rx: 0.034, rz: 0.032 },
  ], 18, 22), skinMat());
  const thumb = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x - s * 0.03, 0.894, 0.031), new THREE.Vector3(x - s * 0.048, 0.865, 0.045), new THREE.Vector3(x - s * 0.049, 0.837, 0.042),
  ]);
  mesh(new THREE.TubeGeometry(thumb, 10, 0.014, 8, false), skinMat());
}

// ---------- cuello, cabeza, clavículas ----------
function buildHeadNeck() {
  mesh(loft([
    { y: 1.475, rx: 0.075, rz: 0.069, z: -0.005 }, { y: 1.51, rx: 0.067, rz: 0.061, z: -0.002 },
    { y: 1.55, rx: 0.062, rz: 0.058, z: 0 }, { y: 1.595, rx: 0.061, rz: 0.058, z: 0.002 }, { y: 1.625, rx: 0.067, rz: 0.062, z: 0.006 },
  ], 30, 24), skinMat());

  const prof = [[0, 0], [0.014, 0.027], [0.03, 0.043], [0.057, 0.06], [0.09, 0.071], [0.12, 0.077], [0.155, 0.084],
    [0.19, 0.085], [0.225, 0.082], [0.255, 0.072], [0.283, 0.051], [0.302, 0.023], [0.31, 0]];
  const head = mesh(new THREE.LatheGeometry(prof.map(([y, r]) => new THREE.Vector2(r, y)), 48), skinMat());
  head.position.set(0, 1.585, 0.012); head.scale.set(1.0, 0.84, 1.1);

  for (const s of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.055, 1.456, 0.072), new THREE.Vector3(s * 0.115, 1.451, 0.091),
      new THREE.Vector3(s * 0.185, 1.428, 0.083), new THREE.Vector3(s * 0.221, 1.413, 0.06),
    ]);
    mesh(new THREE.TubeGeometry(c, 20, 0.008, 8, false), skinMat()).castShadow = false;
  }
}

function buildMannequin() {
  mannequin = new THREE.Group();
  scene.add(mannequin);
  buildTorso();
  buildLeg(-1); buildLeg(1);
  buildArm(-1); buildArm(1);
  buildHeadNeck();
  mannequin.scale.setScalar(HEIGHT / 1.885);
  mannequin.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mannequin);
  mannequin.position.y -= box.min.y;
}

// ---------- escena ----------
function frame() {
  const w = renderer.domElement.clientWidth || 1, h = renderer.domElement.clientHeight || 1;
  camera.aspect = w / h;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const needH = HEIGHT * 1.14;                                  // altura visible con margen
  const needW = 0.9;                                            // anchura con brazos y margen
  const dH = needH / 2 / Math.tan(vfov / 2);
  const dW = needW / 2 / (Math.tan(vfov / 2) * camera.aspect);
  const d = Math.max(dH, dW);
  camera.position.set(0, HEIGHT * 0.53, d);
  camera.updateProjectionMatrix();
  controls?.target.set(0, HEIGHT * 0.5, 0);
  controls?.update();
}

export function mountMannequin(container) {
  disposeMannequin();
  const w = container.clientWidth || 400, h = container.clientHeight || 340;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  camera = new THREE.PerspectiveCamera(24, w / h, 0.1, 30);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e9e5, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(1.6, 3.2, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1; key.shadow.camera.right = 1; key.shadow.camera.top = 2.2; key.shadow.camera.bottom = -0.3;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-2.2, 2.4, -2.5);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.75, 64), new THREE.ShadowMaterial({ opacity: 0.1 }));
  geos.add(floor.geometry); mats.add(floor.material);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);

  buildMannequin();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.9;
  controls.minPolarAngle = Math.PI * 0.38; controls.maxPolarAngle = Math.PI * 0.54;
  frame();

  resizeObs = new ResizeObserver(() => {
    const W = container.clientWidth, H = container.clientHeight;
    if (W && H) { renderer.setSize(W, H); frame(); }
  });
  resizeObs.observe(container);

  const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
  loop();
}

export function paintMuscles(intensities = {}) {
  for (const [name, list] of muscles) {
    const t = clamp(intensities[name] || 0, 0, 1);
    const c = MUSCLE_0.clone().lerp(MUSCLE_1, t === 0 ? 0 : 0.2 + 0.8 * t);
    list.forEach((m) => m.material.color.copy(c));
  }
}

export function disposeMannequin() {
  cancelAnimationFrame(raf);
  resizeObs?.disconnect(); resizeObs = null;
  controls?.dispose(); controls = null;
  geos.forEach((g) => g.dispose()); geos.clear();
  mats.forEach((m) => m.dispose()); mats.clear();
  muscles.clear();
  envTarget?.dispose(); envTarget = null;
  if (renderer) { renderer.dispose(); renderer.domElement.remove(); renderer = null; }
  scene = null; mannequin = null;
}
