/**
 * Maniquí 3D de Sasoika.
 * Modelo anatómico: Z-Anatomy (https://www.z-anatomy.com), derivado de BodyParts3D
 * (Database Center for Life Science), licencia CC BY-SA 4.0. Procesado para Sasoika:
 * músculos superficiales agrupados en 10 grupos + huesos visibles, decimado y comprimido.
 *
 * API: mountMannequin(container) · paintMuscles({ pecho: 0..1, ... }) · disposeMannequin()
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const MODEL_URL = new URL("./assets/body.glb", import.meta.url).href;
const SKIN = new THREE.Color("#f2f2ef");
const MUSCLE_0 = new THREE.Color("#ecece8");
const MUSCLE_1 = new THREE.Color("#141414");
const HEIGHT = 1.78;
const GROUPS = ["pecho", "espalda", "hombros", "biceps", "triceps", "core", "gluteos", "cuadriceps", "isquios", "gemelos"];

let scene, camera, renderer, controls, mannequin, envTarget, raf, resizeObs, pending = {};
const muscles = new Map();
const geos = new Set();
const mats = new Set();
const { clamp } = THREE.MathUtils;

const material = (color, rough = 0.62) => { const m = new THREE.MeshStandardMaterial({ color: color.clone(), roughness: rough, metalness: 0 }); mats.add(m); return m; };

async function loadModel() {
  const draco = new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const gltf = await loader.loadAsync(MODEL_URL);
  draco.dispose();
  if (!scene) return; // desmontado mientras cargaba
  mannequin = gltf.scene;
  mannequin.traverse((o) => {
    if (!o.isMesh) return;
    geos.add(o.geometry);
    o.castShadow = true; o.receiveShadow = true;
    const name = o.name.split(".")[0];
    const isMuscle = GROUPS.includes(name) || GROUPS.includes(o.parent?.name);
    const g = GROUPS.includes(name) ? name : o.parent?.name;
    o.material = isMuscle ? material(MUSCLE_0, 0.55) : material(SKIN, 0.68);
    if (isMuscle) { if (!muscles.has(g)) muscles.set(g, []); muscles.get(g).push(o); }
  });
  // Normalizar: de pie sobre el suelo, centrado y a 1,78 m
  const box = new THREE.Box3().setFromObject(mannequin);
  const size = box.getSize(new THREE.Vector3());
  const s = HEIGHT / size.y;
  mannequin.scale.setScalar(s);
  box.setFromObject(mannequin);
  const c = box.getCenter(new THREE.Vector3());
  mannequin.position.set(-c.x, -box.min.y, -c.z);
  scene.add(mannequin);
  paintMuscles(pending);
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

  loadModel().catch((e) => console.error("No se pudo cargar el modelo", e));

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
  pending = intensities;
  for (const [name, list] of muscles) {
    const t = clamp(intensities[name] || 0, 0, 1);
    const c = MUSCLE_0.clone().lerp(MUSCLE_1, t === 0 ? 0 : 0.18 + 0.72 * t);
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
