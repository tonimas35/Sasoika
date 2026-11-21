import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const NEUTRAL = new THREE.Color("#f3f3f0");
const LOW = new THREE.Color("#e6e6e2");
const HIGH = new THREE.Color("#141414");

let renderer, scene, camera, controls, parts = {}, raf;

function mat(color = NEUTRAL) {
  return new THREE.MeshStandardMaterial({ color: color.clone(), roughness: 0.82, metalness: 0.02 });
}

// Crea el maniquí con piezas simples. Las piezas con "muscle" se colorean según el trabajo semanal.
function buildBody() {
  const body = new THREE.Group();
  const add = (geom, pos, opts = {}) => {
    const m = new THREE.Mesh(geom, mat(opts.muscle ? LOW : NEUTRAL));
    m.position.set(...pos);
    if (opts.scale) m.scale.set(...opts.scale);
    if (opts.rot) m.rotation.set(...opts.rot);
    m.castShadow = true;
    body.add(m);
    if (opts.muscle) (parts[opts.muscle] ||= []).push(m);
    return m;
  };
  const caps = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20);
  const sph = (r) => new THREE.SphereGeometry(r, 28, 20);

  // Cabeza, cuello y tronco
  add(sph(0.105), [0, 1.69, 0], { scale: [0.92, 1.05, 1] });
  add(caps(0.048, 0.06), [0, 1.56, 0]);
  add(caps(0.16, 0.3), [0, 1.27, 0], { scale: [1.3, 1, 0.68] });
  add(sph(0.15), [0, 0.98, 0], { scale: [1.15, 0.7, 0.78] });

  // Músculos del tronco
  for (const s of [-1, 1]) add(sph(0.095), [s * 0.085, 1.37, 0.075], { scale: [1.05, 0.72, 0.45], muscle: "pecho" });
  add(sph(0.12), [0, 1.3, -0.085], { scale: [1.55, 1.55, 0.38], muscle: "espalda" });
  add(sph(0.09), [0, 1.12, 0.08], { scale: [1, 1.45, 0.38], muscle: "core" });
  for (const s of [-1, 1]) add(sph(0.085), [s * 0.075, 0.95, -0.07], { scale: [1, 1, 0.8], muscle: "gluteos" });

  // Brazos
  for (const s of [-1, 1]) {
    add(sph(0.072), [s * 0.255, 1.44, 0], { muscle: "hombros" });
    add(caps(0.043, 0.15), [s * 0.28, 1.25, 0.022], { rot: [0, 0, s * 0.08], muscle: "biceps" });
    add(caps(0.043, 0.15), [s * 0.28, 1.25, -0.022], { rot: [0, 0, s * 0.08], muscle: "triceps" });
    add(caps(0.038, 0.19), [s * 0.305, 0.99, 0.01], { rot: [0, 0, s * 0.06] });
    add(sph(0.045), [s * 0.315, 0.83, 0.015], { scale: [0.8, 1.15, 0.6] });
  }

  // Piernas
  for (const s of [-1, 1]) {
    add(caps(0.074, 0.27), [s * 0.1, 0.66, 0.025], { muscle: "cuadriceps" });
    add(caps(0.068, 0.25), [s * 0.1, 0.67, -0.03], { muscle: "isquios" });
    add(caps(0.05, 0.28), [s * 0.1, 0.3, 0.012]);
    add(caps(0.052, 0.13), [s * 0.1, 0.36, -0.028], { muscle: "gemelos" });
    add(new THREE.BoxGeometry(0.085, 0.05, 0.2), [s * 0.1, 0.035, 0.035]);
  }
  return body;
}

export function mountMannequin(container) {
  disposeMannequin();
  parts = {};
  const w = container.clientWidth, h = container.clientHeight;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 20);
  camera.position.set(0, 1.05, 3.9);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e8e4, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1.5, 3, 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(-2, 2, -2);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.ShadowMaterial({ opacity: 0.08 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  scene.add(buildBody());

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.95, 0);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.minPolarAngle = Math.PI * 0.35;
  controls.maxPolarAngle = Math.PI * 0.55;
  controls.update();

  const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
  loop();
}

// intensities: { musculo: 0..1 }
export function paintMuscles(intensities) {
  for (const [name, meshes] of Object.entries(parts)) {
    const t = Math.max(0, Math.min(1, intensities[name] || 0));
    const c = t === 0 ? LOW.clone() : LOW.clone().lerp(HIGH, 0.25 + 0.75 * t);
    meshes.forEach((m) => m.material.color.copy(c));
  }
}

export function disposeMannequin() {
  cancelAnimationFrame(raf);
  if (renderer) { renderer.dispose(); renderer.domElement.remove(); renderer = null; }
}
