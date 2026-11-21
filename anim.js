/**
 * Animación de ejercicios de Sasoika: maniquí articulado (hombre/mujer) + aparatos minimalistas.
 * Las poses clave (assets/poses.json) las propuso ChatGPT siguiendo nuestras convenciones;
 * la figura, los aparatos y el reproductor son propios.
 * API: mountAnim(container, key, { sex, highlight }) · disposeAnim()
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const D = THREE.MathUtils.degToRad;
const SKIN = "#f1f1ee", DARK = "#1c1c1c", EQUIP = "#2b2b2b", EQUIP_SOFT = "#d9d9d4";

let renderer, scene, camera, controls, raf, envT, resizeObs, clock;
const disposables = [];
let POSES = null;

async function poses() {
  if (!POSES) POSES = await fetch(new URL("./assets/poses.json?v=2", import.meta.url)).then((r) => r.json());
  return POSES;
}

const mat = (c, rough = 0.6) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 }); disposables.push(m); return m; };
function mesh(geo, m, parent, pos = [0, 0, 0], scale) {
  disposables.push(geo);
  const o = new THREE.Mesh(geo, m); o.position.set(...pos); if (scale) o.scale.set(...scale);
  o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
}
const caps = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 16);
const sph = (r) => new THREE.SphereGeometry(r, 24, 16);
const grp = (parent, pos = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };

// ---------- Maniquí articulado ----------
function buildFigure(sex, hl) {
  const F = sex === "mujer";
  const k = F ? 0.93 : 1;               // escala de altura
  const sh = F ? 0.165 : 0.19, hipW = F ? 0.105 : 0.095;
  const m = (g) => mat(hl.has(g) ? DARK : SKIN, hl.has(g) ? 0.5 : 0.62);
  const skin = mat(SKIN);
  const J = {};

  J.root = grp(scene);
  const pelvis = J.root;
  mesh(sph(0.15), m("gluteos"), pelvis, [0, 0, -0.01], [F ? 1.12 : 1.02, 0.62, 0.72]);
  J.spine = grp(pelvis, [0, 0.07, 0]);
  mesh(caps(0.11, 0.1), m("core"), J.spine, [0, 0.1, 0.005], [F ? 1.0 : 1.08, 1, 0.72]);
  J.chest = grp(J.spine, [0, 0.2, 0]);
  mesh(sph(0.17), m(hl.has("pecho") ? "pecho" : "espalda"), J.chest, [0, 0.08, 0], [F ? 0.95 : 1.12, 1.05, 0.66]);
  if (F) for (const s of [-1, 1]) mesh(sph(0.06), skin, J.chest, [s * 0.065, 0.05, 0.085], [1, 0.9, 0.75]);
  J.neck = grp(J.chest, [0, 0.22, 0]);
  mesh(caps(0.045, 0.06), skin, J.neck, [0, 0.04, 0]);
  mesh(sph(0.1), skin, J.neck, [0, 0.17, 0.01], [0.9, 1.08, 1]);

  for (const [s, side] of [[1, "L"], [-1, "R"]]) {
    const shoulder = J["shoulder" + side] = grp(J.chest, [s * sh, 0.18, 0]);
    mesh(sph(0.06), m("hombros"), shoulder, [0, 0, 0]);
    const armM = hl.has("biceps") ? m("biceps") : m("triceps");
    mesh(caps(0.045, 0.2), armM, shoulder, [0, -0.145, 0]);
    const elbow = J["elbow" + side] = grp(shoulder, [0, -0.29, 0]);
    mesh(caps(0.038, 0.19), skin, elbow, [0, -0.13, 0]);
    const wrist = J["wrist" + side] = grp(elbow, [0, -0.26, 0]);
    mesh(sph(0.04), skin, wrist, [0, -0.045, 0], [0.75, 1.2, 0.5]);
    J["hand" + side] = grp(wrist, [0, -0.05, 0]);

    const hip = J["hip" + side] = grp(pelvis, [s * hipW, -0.04, 0]);
    const thighM = hl.has("cuadriceps") ? m("cuadriceps") : m("isquios");
    mesh(caps(F ? 0.072 : 0.07, 0.3), thighM, hip, [0, -0.22, 0]);
    const knee = J["knee" + side] = grp(hip, [0, -0.44, 0]);
    mesh(caps(0.05, 0.32), m("gemelos"), knee, [0, -0.215, -0.005]);
    const ankle = J["ankle" + side] = grp(knee, [0, -0.43, 0]);
    mesh(new THREE.BoxGeometry(0.08, 0.05, 0.2), skin, ankle, [0, -0.03, 0.05]);
    J["foot" + side] = grp(ankle, [0, -0.05, 0.05]);
  }
  J.root.scale.setScalar(k);
  return J;
}

// Aplica una pose con nuestras convenciones (grados)
function val(p, name, side, sub) {
  const a = p[name + side] ?? p[name];
  if (a == null) return 0;
  if (typeof a === "number") return sub === "flex" || !sub ? a : 0;
  return a[sub] ?? 0;
}
function applyPose(J, p, sex) {
  const r = p.root || {};
  const k = sex === "mujer" ? 0.93 : 1;
  J.root.position.set(0, (r.y ?? 0.95) * k, (r.z ?? 0) * k);
  J.root.rotation.set(D(r.pitch ?? 0), 0, 0);
  const spine = typeof p.spine === "object" ? p.spine.flex ?? 0 : p.spine ?? 0;
  J.spine.rotation.x = D(spine * 0.5); J.chest.rotation.x = D(spine * 0.5);
  J.neck.rotation.x = D(typeof p.neck === "object" ? p.neck.flex ?? 0 : p.neck ?? 0);
  for (const [s, side] of [[1, "L"], [-1, "R"]]) {
    J["shoulder" + side].rotation.set(-D(val(p, "shoulder", side, "flex")), 0, s * D(val(p, "shoulder", side, "abd")), "ZXY");
    J["elbow" + side].rotation.x = -D(val(p, "elbow", side));
    J["wrist" + side].rotation.y = s * D(val(p, "wrist", side));
    J["hip" + side].rotation.set(-D(val(p, "hip", side, "flex")), 0, s * D(val(p, "hip", side, "abd")), "ZXY");
    J["knee" + side].rotation.x = D(val(p, "knee", side));
    J["ankle" + side].rotation.x = -D(val(p, "ankle", side));
  }
}

// Mezcla dos poses (números y objetos {flex, abd}); root incluido
function mix(a, b, t) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key], y = b[key];
    if (typeof x === "object" || typeof y === "object") {
      const xo = typeof x === "object" ? x : { flex: x ?? 0 }, yo = typeof y === "object" ? y : { flex: y ?? 0 };
      out[key] = {}; for (const kk of new Set([...Object.keys(xo), ...Object.keys(yo)])) out[key][kk] = (xo[kk] ?? yo[kk] ?? 0) + ((yo[kk] ?? xo[kk] ?? 0) - (xo[kk] ?? yo[kk] ?? 0)) * t;
    } else out[key] = (x ?? y ?? 0) + ((y ?? x ?? 0) - (x ?? y ?? 0)) * t;
  }
  return out;
}
const merge = (base, over) => { const o = { ...base }; for (const k in over) if (k !== "t") o[k] = typeof over[k] === "object" && typeof base[k] === "object" ? { ...base[k], ...over[k] } : over[k]; return o; };

// ---------- Aparatos ----------
const wp = (obj) => obj.getWorldPosition(new THREE.Vector3());
function dumbbell(parent) {
  const g = grp(parent, [0, -0.02, 0]); const e = mat(EQUIP, 0.4);
  mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 12), e, g, [0, 0, 0], null).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 20), e, g, [s * 0.085, 0, 0]).rotation.z = Math.PI / 2;
}
function bar(p1, p2, r = 0.016, m = mat(EQUIP, 0.35)) {
  const len = p1.distanceTo(p2), geo = new THREE.CylinderGeometry(r, r, len, 12);
  const o = mesh(geo, m, scene); o.position.copy(p1).add(p2).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize()); return o;
}
function box(w, h, d, pos, rotX = 0, m = mat(EQUIP_SOFT, 0.7)) { const o = mesh(new THREE.BoxGeometry(w, h, d), m, scene, pos); o.rotation.x = rotX; return o; }

function buildEquipment(key, J) {
  scene.updateMatrixWorld(true);
  const hL = wp(J.handL), hR = wp(J.handR), pel = wp(J.root), fL = wp(J.footL), fR = wp(J.footR);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  switch (key) {
    case "dominadas": case "elevacion_piernas": {
      const y = Math.max(hL.y, hR.y) + 0.01, z = (hL.z + hR.z) / 2;
      bar(V(-0.6, y, z), V(0.6, y, z), 0.018);
      for (const s of [-1, 1]) bar(V(s * 0.6, 0, z), V(s * 0.6, y, z), 0.025);
      for (const h of [hL, hR]) bar(V(h.x, y - 0.06, z), V(h.x, y + 0.04, z), 0.02); // asas neutras
      break;
    }
    case "fondos": {
      for (const h of [hL, hR]) {
        bar(V(h.x, h.y, h.z - 0.35), V(h.x, h.y, h.z + 0.35), 0.022);
        for (const dz of [-0.35, 0.35]) bar(V(h.x, 0, h.z + dz), V(h.x, h.y, h.z + dz), 0.022);
      }
      break;
    }
    case "press_pecho": case "curl_biceps": case "press_militar": {
      const seatY = pel.y - 0.11;
      if (key === "press_pecho") box(0.3, 0.06, 1.2, [0, seatY, pel.z + 0.32]);
      else { box(0.35, 0.06, 0.4, [0, seatY, pel.z + 0.06]); if (key === "press_militar") box(0.35, 0.65, 0.06, [0, seatY + 0.36, pel.z - 0.16], -0.12); }
      for (const dz of key === "press_pecho" ? [-0.15, 0.75] : [0.06]) bar(V(0, 0, pel.z + dz), V(0, seatY, pel.z + dz), 0.03);
      dumbbell(J.handL); dumbbell(J.handR);
      break;
    }
    case "peso_muerto_rumano": dumbbell(J.handL); dumbbell(J.handR); break;
    case "curl_femoral": {
      const y = pel.y - 0.13;
      box(0.32, 0.07, 1.25, [0, y, pel.z + 0.25]);
      bar(V(0, 0, pel.z), V(0, y, pel.z), 0.035);
      // rodillo que sigue a los tobillos
      for (const a of [J.ankleL, J.ankleR]) { const r = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 16), mat(EQUIP, 0.5), a, [0, -0.02, -0.06]); r.rotation.z = Math.PI / 2; }
      break;
    }
    case "prensa": {
      box(0.4, 0.07, 0.4, [0, pel.y - 0.1, pel.z - 0.02]);
      box(0.4, 0.7, 0.07, [0, pel.y + 0.25, pel.z - 0.25], -0.35);
      // plataforma que sigue a los pies
      const plate = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.04), mat(EQUIP, 0.5), J.footL, [-0.1, 0.12, 0.08]);
      plate.rotation.x = Math.PI / 2;
      break;
    }
    case "remo_maquina": {
      box(0.35, 0.06, 0.35, [0, pel.y - 0.1, pel.z]);
      const ch = wp(J.chest);
      box(0.3, 0.45, 0.08, [0, ch.y + 0.02, ch.z + 0.2]);
      for (const h of [J.handL, J.handR]) mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 10), mat(EQUIP, 0.4), h, [0, -0.02, 0]);
      break;
    }
    case "extension_triceps": {
      const top = V(0, 2.15, (hL.z + hR.z) / 2 + 0.15);
      box(0.12, 2.2, 0.12, [0, 1.1, top.z + 0.08], 0, mat(EQUIP, 0.5));
      const rope = mat(EQUIP, 0.6);
      const ropeL = mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), rope, scene); // se actualiza cada frame
      return () => { const a = wp(J.handL).add(wp(J.handR)).multiplyScalar(0.5); ropeL.position.copy(a).add(top).multiplyScalar(0.5); ropeL.scale.y = a.distanceTo(top); ropeL.quaternion.setFromUnitVectors(V(0, 1, 0), top.clone().sub(a).normalize()); };
    }
    case "plancha": box(0.6, 0.012, 1.8, [0, 0.006, pel.z + 0.1], 0, mat("#e6e6e2", 0.9)); break;
  }
  return null;
}

// ---------- Escena ----------
export async function mountAnim(container, key, { sex = "hombre", highlight = [] } = {}) {
  disposeAnim();
  const P = (await poses())[key];
  if (!P) { container.innerHTML = `<p class="empty">Animación no disponible</p>`; return; }
  const w = container.clientWidth || 400, h = container.clientHeight || 300;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = ""; container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); envT = pm.fromScene(new RoomEnvironment(), 0.04); pm.dispose();
  scene.environment = envT.texture; scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e9e5, 0.9));
  const key_ = new THREE.DirectionalLight(0xffffff, 1.8); key_.position.set(2, 3.5, 2.5); key_.castShadow = true;
  key_.shadow.mapSize.set(1024, 1024); Object.assign(key_.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1 }); key_.shadow.radius = 5; key_.shadow.normalBias = 0.02;
  scene.add(key_);
  const floor = mesh(new THREE.CircleGeometry(1.6, 64), new THREE.ShadowMaterial({ opacity: 0.1 }), scene); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;

  const J = buildFigure(sex, new Set(highlight));
  const keys = P.keys?.length ? P.keys : [{ t: 0 }];
  const base = merge({ root: P.root || {} }, P.pose || {});
  const poseAt = (i) => { let p = base; for (let j = 0; j <= i; j++) p = merge(p, keys[j]); if (keys[i].root) p.root = { ...base.root, ...keys[i].root }; return p; };
  const frames = keys.map((k, i) => ({ t: k.t ?? i, pose: poseAt(i) }));
  const total = frames.at(-1).t + 0.6; // pausa breve antes de repetir

  applyPose(J, frames[0].pose, sex);
  const update = buildEquipment(key, J);

  // Encuadre: caja del cuerpo en la pose inicial
  scene.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(J.root); const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
  camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 40);
  const dist = Math.max(sz.y, sz.z * 0.8, sz.x) / (2 * Math.tan(D(15))) * 1.55;
  camera.position.set(c.x + dist * 0.72, c.y + dist * 0.18, c.z + dist * 0.7);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(c); controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true;
  controls.minPolarAngle = Math.PI * 0.25; controls.maxPolarAngle = Math.PI * 0.55; controls.update();

  resizeObs = new ResizeObserver(() => { const W = container.clientWidth, H = container.clientHeight; if (W && H) { renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); } });
  resizeObs.observe(container);

  clock = new THREE.Clock();
  const ease = (x) => x * x * (3 - 2 * x);
  const loop = () => {
    const t = clock.getElapsedTime() % total;
    let i = frames.findIndex((f) => f.t > t); if (i === -1) i = frames.length; // tras el último: mantener
    const p = i === 0 ? frames[0].pose : i >= frames.length ? frames.at(-1).pose
      : mix(frames[i - 1].pose, frames[i].pose, ease((t - frames[i - 1].t) / (frames[i].t - frames[i - 1].t)));
    if (frames.length > 1) applyPose(J, p, sex);
    update?.();
    controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop);
  };
  loop();
}

export function disposeAnim() {
  cancelAnimationFrame(raf); resizeObs?.disconnect(); resizeObs = null; controls?.dispose(); controls = null;
  disposables.forEach((d) => d.dispose?.()); disposables.length = 0; envT?.dispose(); envT = null;
  if (renderer) { renderer.dispose(); renderer.domElement.remove(); renderer = null; }
  scene = null;
}
