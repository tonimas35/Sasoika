import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { ROUTINES, KIND_LABEL } from "./routines.js";

const SUPABASE_URL = "https://zxgmtfqgctbwnhykuzyd.supabase.co";
const SUPABASE_KEY = "sb_publishable_WRU0kZGeWv5Yyr6nvidb8Q_fDujckjs"; // clave pública; los datos están protegidos por RLS
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const TZ = "Europe/Madrid";
const todayStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const fmt = (n) => (n == null ? "" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: 1 }));

let user = null;
let goals = { kcal: 2300, protein: 140 };
let currentKind = "A";
let extraExercises = [];

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1800);
}
function fail(error) { if (error) { console.error(error); toast("Error: " + (error.message || error)); return true; } return false; }

// ---------- Navegación ----------
const SCREENS = ["auth", "hoy", "entreno", "progreso", "ajustes"];
function show(name) {
  SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== name));
  $("tabs").classList.toggle("hidden", name === "auth" || name === "ajustes");
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  window.scrollTo(0, 0);
  if (name === "hoy") loadHoy();
  if (name === "entreno") loadEntreno();
  if (name === "progreso") loadProgreso();
  if (name === "ajustes") { $("goalKcal").value = goals.kcal; $("goalProt").value = goals.protein; }
}
document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));

// ---------- Auth ----------
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
  if (error) $("authMsg").textContent = error.message === "Email not confirmed"
    ? "Confirma tu email (revisa la bandeja de entrada) y vuelve a entrar."
    : "No se ha podido entrar: " + error.message;
});
$("signupBtn").addEventListener("click", async () => {
  if (!$("authForm").reportValidity()) return;
  const { data, error } = await sb.auth.signUp({ email: $("email").value.trim(), password: $("password").value,
    options: { emailRedirectTo: location.href.split("#")[0] } });
  if (error) { $("authMsg").textContent = error.message; return; }
  $("authMsg").textContent = data.session ? "" : "Cuenta creada. Confirma el email que te ha llegado y luego pulsa Entrar.";
});
$("logoutBtn").addEventListener("click", () => sb.auth.signOut());
$("settingsBtn").addEventListener("click", () => show("ajustes"));
$("closeSettings").addEventListener("click", () => show("hoy"));

sb.auth.onAuthStateChange((_ev, session) => {
  const was = user?.id;
  user = session?.user ?? null;
  if (!user) return show("auth");
  if (was !== user.id) init();
});

async function init() {
  const { data } = await sb.from("goals").select("*").maybeSingle();
  if (data) goals = data;
  else await sb.from("goals").insert({ kcal: goals.kcal, protein: goals.protein });
  show("hoy");
}

$("goalsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const g = { user_id: user.id, kcal: +$("goalKcal").value || 0, protein: +$("goalProt").value || 0, updated_at: new Date().toISOString() };
  const { error } = await sb.from("goals").upsert(g);
  if (fail(error)) return;
  goals = g; toast("Objetivos guardados"); show("hoy");
});

// ---------- Hoy ----------
async function loadHoy() {
  $("todayLabel").textContent = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const [meals, workouts, body] = await Promise.all([
    sb.from("meals").select("*").gte("eaten_at", startOfToday()).order("eaten_at"),
    sb.from("workouts").select("kind, day").order("day", { ascending: false }).order("id", { ascending: false }).limit(20),
    sb.from("body").select("*").eq("day", todayStr()).maybeSingle(),
  ]);
  renderMeals(meals.data || []);

  const list = workouts.data || [];
  const lastAB = list.find((w) => w.kind === "A" || w.kind === "B");
  const doneToday = list.some((w) => w.day === todayStr() && (w.kind === "A" || w.kind === "B"));
  const next = lastAB?.kind === "A" ? "B" : "A";
  $("nextTitle").textContent = doneToday ? `Hecho hoy: ${KIND_LABEL[lastAB.kind]} ✓` : KIND_LABEL[next];
  $("nextBtn").dataset.kind = doneToday ? lastAB.kind : next;
  $("lastWorkout").textContent = list[0] ? `Último: ${KIND_LABEL[list[0].kind]} · ${relDay(list[0].day)}` : "Aún no hay entrenos";

  $("bodyWeight").value = body.data?.weight_kg ?? "";
  $("bodyWaist").value = body.data?.waist_cm ?? "";
}

function relDay(day) {
  const diff = Math.round((new Date(todayStr()) - new Date(day)) / 864e5);
  return diff === 0 ? "hoy" : diff === 1 ? "ayer" : `hace ${diff} días`;
}

function renderMeals(meals) {
  const kcal = meals.reduce((s, m) => s + (m.kcal || 0), 0);
  const prot = meals.reduce((s, m) => s + Number(m.protein || 0), 0);
  $("kcalVal").textContent = fmt(kcal); $("kcalGoal").textContent = goals.kcal;
  $("protVal").textContent = fmt(prot); $("protGoal").textContent = goals.protein;
  const C = 94.25; // circunferencia del anillo (r=15)
  const ring = (el, frac) => { el.style.strokeDashoffset = C * (1 - Math.max(0, Math.min(1, frac))); };
  ring($("kcalBar"), kcal / goals.kcal);
  $("kcalBar").classList.toggle("over", kcal > goals.kcal * 1.05);
  ring($("protBar"), prot / goals.protein);
  $("protBar").classList.toggle("done", prot >= goals.protein);

  const ul = $("mealList");
  ul.innerHTML = meals.length ? "" : `<li class="empty">Nada registrado hoy</li>`;
  meals.forEach((m) => {
    const li = document.createElement("li");
    const time = new Date(m.eaten_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    li.innerHTML = `<div><div></div><div class="meta">${time} · ${m.kcal ?? "?"} kcal · ${fmt(m.protein) || "?"} g prot</div></div>
      <button class="del" aria-label="Borrar">✕</button>`;
    li.firstElementChild.firstElementChild.textContent = m.name;
    li.querySelector(".del").onclick = async () => {
      if (!confirm(`¿Borrar "${m.name}"?`)) return;
      if (!fail((await sb.from("meals").delete().eq("id", m.id)).error)) loadHoy();
    };
    ul.appendChild(li);
  });
}

$("addMealBtn").onclick = () => { $("mealForm").classList.remove("hidden"); $("mealName").focus(); };
$("mealCancel").onclick = () => { $("mealForm").reset(); $("mealForm").classList.add("hidden"); };
$("mealForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const row = { name: $("mealName").value.trim(), kcal: $("mealKcal").value ? +$("mealKcal").value : null,
    protein: $("mealProt").value ? +$("mealProt").value : null };
  if (fail((await sb.from("meals").insert(row)).error)) return;
  $("mealForm").reset(); $("mealForm").classList.add("hidden"); toast("Comida guardada"); loadHoy();
});

$("bodyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const w = $("bodyWeight").value, c = $("bodyWaist").value;
  if (!w && !c) return;
  const { error } = await sb.from("body").upsert(
    { user_id: user.id, day: todayStr(), weight_kg: w ? +w : null, waist_cm: c ? +c : null },
    { onConflict: "user_id,day" });
  if (!fail(error)) toast("Guardado");
});

$("nextBtn").onclick = () => { currentKind = $("nextBtn").dataset.kind || "A"; show("entreno"); };

// ---------- Entreno ----------
document.querySelectorAll("#kindSeg button").forEach((b) => b.addEventListener("click", () => {
  currentKind = b.dataset.kind; extraExercises = []; loadEntreno();
}));

async function todayWorkout(kind, create = false) {
  const { data } = await sb.from("workouts").select("*").eq("day", todayStr()).eq("kind", kind).order("id").limit(1);
  if (data?.[0] || !create) return data?.[0] || null;
  const { data: w, error } = await sb.from("workouts").insert({ kind, day: todayStr() }).select().single();
  fail(error); return w;
}

async function loadEntreno() {
  document.querySelectorAll("#kindSeg button").forEach((b) => b.classList.toggle("active", b.dataset.kind === currentKind));
  const simple = !(currentKind in ROUTINES);
  $("simpleLog").classList.toggle("hidden", !simple);
  $("extraForm").classList.toggle("hidden", simple);
  $("exercises").innerHTML = "";

  if (simple) {
    const w = await todayWorkout(currentKind);
    $("simpleText").textContent = w ? `${KIND_LABEL[currentKind]} registrado hoy ✓` : `¿Has hecho ${KIND_LABEL[currentKind].toLowerCase()} hoy?`;
    $("simpleNotes").value = w?.notes || "";
    $("simpleSave").textContent = w ? "Actualizar notas" : "Registrar";
    return;
  }

  const w = await todayWorkout(currentKind);
  const { data: recent } = await sb.from("sets").select("*, workouts!inner(day, kind)")
    .order("created_at", { ascending: false }).limit(400);
  const sets = recent || [];
  const todaySets = w ? sets.filter((s) => s.workout_id === w.id).reverse() : [];

  const list = [...ROUTINES[currentKind]];
  const names = new Set(list.map((e) => e.name));
  [...todaySets.map((s) => s.exercise), ...extraExercises].forEach((n) => {
    if (!names.has(n)) { names.add(n); list.push({ name: n, target: "", type: "reps" }); }
  });

  list.forEach((ex) => {
    const mine = todaySets.filter((s) => s.exercise === ex.name);
    const prev = sets.filter((s) => s.exercise === ex.name && s.workout_id !== w?.id);
    const lastWid = prev[0]?.workout_id;
    const last = prev.filter((s) => s.workout_id === lastWid).reverse();
    $("exercises").appendChild(exerciseCard(ex, mine, last));
  });
}

function setLabel(s, type) {
  if (type === "time" || (s.seconds && !s.reps)) return `${s.seconds} s`;
  return s.weight_kg ? `${fmt(s.weight_kg)} kg × ${s.reps}` : `${s.reps} reps`;
}

function exerciseCard(ex, mine, last) {
  const card = document.createElement("div");
  card.className = "card";
  const lastTxt = last.length ? `Última vez (${relDay(last[0].workouts.day)}): ${last.map((s) => setLabel(s, ex.type)).join(", ")}` : "Sin registros previos";
  card.innerHTML = `
    <div class="ex-head"><span class="ex-name"></span><span class="ex-target">${ex.target}</span></div>
    <div class="ex-last"></div>
    <div class="chips"></div>
    <form class="set-row">
      ${ex.type === "time"
        ? `<input type="number" inputmode="numeric" placeholder="segundos" name="seconds" required>`
        : `<input type="number" inputmode="decimal" step="0.5" placeholder="${ex.bodyweight ? "lastre kg" : "kg"}" name="weight">
           <input type="number" inputmode="numeric" placeholder="reps" name="reps" required>`}
      <button class="primary" type="submit">＋</button>
    </form>`;
  card.querySelector(".ex-name").textContent = ex.name;
  card.querySelector(".ex-last").textContent = lastTxt;

  const chips = card.querySelector(".chips");
  mine.forEach((s) => {
    const c = document.createElement("button");
    c.className = "chip done"; c.textContent = setLabel(s, ex.type); c.title = "Toca para borrar";
    c.onclick = async () => {
      if (!confirm(`¿Borrar la serie ${c.textContent}?`)) return;
      if (!fail((await sb.from("sets").delete().eq("id", s.id)).error)) loadEntreno();
    };
    chips.appendChild(c);
  });

  // Prefill con la última serie de hoy o de la última vez
  const ref = mine[mine.length - 1] || last[mine.length] || last[last.length - 1];
  const form = card.querySelector("form");
  if (ref) {
    if (form.weight && ref.weight_kg) form.weight.value = ref.weight_kg;
    if (form.reps && ref.reps) form.reps.placeholder = `reps (${ref.reps})`;
    if (form.seconds && ref.seconds) form.seconds.placeholder = `segundos (${ref.seconds})`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button"); btn.disabled = true;
    const w = await todayWorkout(currentKind, true);
    const row = { workout_id: w.id, exercise: ex.name, set_no: mine.length + 1 };
    if (form.seconds) row.seconds = +form.seconds.value;
    else { row.weight_kg = form.weight.value ? +form.weight.value : null; row.reps = +form.reps.value; }
    const { error } = await sb.from("sets").insert(row);
    btn.disabled = false;
    if (!fail(error)) { toast(`Serie ${row.set_no} guardada`); loadEntreno(); }
  });
  return card;
}

$("extraForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = $("extraName").value.trim(); if (!n) return;
  extraExercises.push(n); $("extraName").value = ""; loadEntreno();
});

$("simpleSave").onclick = async () => {
  const w = await todayWorkout(currentKind, true);
  const { error } = await sb.from("workouts").update({ notes: $("simpleNotes").value || null }).eq("id", w.id);
  if (!fail(error)) { toast("Registrado"); loadEntreno(); }
};

// ---------- Progreso ----------
async function loadProgreso() {
  const [body, sets, workouts] = await Promise.all([
    sb.from("body").select("day, weight_kg, waist_cm").order("day"),
    sb.from("sets").select("exercise, weight_kg, reps, seconds, workouts!inner(day)").order("created_at").limit(5000),
    sb.from("workouts").select("day, kind").order("day"),
  ]);
  const b = body.data || [];
  lineChart($("chartWeight"), b.filter((r) => r.weight_kg != null).map((r) => [r.day, +r.weight_kg]), "kg");
  lineChart($("chartWaist"), b.filter((r) => r.waist_cm != null).map((r) => [r.day, +r.waist_cm]), "cm");

  const all = sets.data || [];
  const exNames = [...new Set(all.map((s) => s.exercise))];
  const sel = $("exSelect"); const prev = sel.value;
  sel.innerHTML = exNames.map((n) => `<option></option>`).join("");
  [...sel.options].forEach((o, i) => { o.value = o.textContent = exNames[i]; });
  if (exNames.includes(prev)) sel.value = prev;
  const drawEx = () => {
    const rows = all.filter((s) => s.exercise === sel.value);
    const byDay = {};
    const useWeight = rows.some((s) => s.weight_kg > 0);
    const useTime = !useWeight && rows.some((s) => s.seconds);
    rows.forEach((s) => {
      const v = useWeight ? +s.weight_kg || 0 : useTime ? s.seconds || 0 : s.reps || 0;
      byDay[s.workouts.day] = Math.max(byDay[s.workouts.day] || 0, v);
    });
    lineChart($("chartEx"), Object.entries(byDay).sort(), useWeight ? "kg máx" : useTime ? "s máx" : "reps máx");
  };
  sel.onchange = drawEx;
  if (exNames.length) drawEx(); else $("chartEx").innerHTML = `<p class="empty">Sin datos todavía</p>`;

  // Entrenos por semana (últimas 10)
  const weeks = {};
  const monday = (d) => { const x = new Date(d); const k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return x.toISOString().slice(0, 10); };
  (workouts.data || []).forEach((w) => { const k = monday(w.day); weeks[k] = (weeks[k] || 0) + 1; });
  const out = [];
  for (let i = 9; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i * 7); const k = monday(d.toISOString().slice(0, 10)); out.push([k, weeks[k] || 0]); }
  barChart($("chartWeeks"), out);
}

function lineChart(el, pts, unit) {
  if (pts.length === 0) { el.innerHTML = `<p class="empty">Sin datos todavía</p>`; return; }
  const W = 320, H = 160, P = 28;
  const ys = pts.map((p) => p[1]);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => P + (pts.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (pts.length - 1));
  const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const d = (s) => new Date(s).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
    <path d="${path}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p[1])}" r="3" fill="#fff" stroke="var(--ink)" stroke-width="2"/>`).join("")}
    <text x="${P}" y="14" fill="var(--muted)" font-size="11">${fmt(max)} ${unit}</text>
    <text x="${P}" y="${H - 6}" fill="var(--muted)" font-size="11">${d(pts[0][0])}</text>
    <text x="${W - P}" y="${H - 6}" fill="var(--muted)" font-size="11" text-anchor="end">${d(last[0])} · ${fmt(last[1])} ${unit}</text>
  </svg>`;
}

function barChart(el, data) {
  const W = 320, H = 160, P = 20, max = Math.max(4, ...data.map((d) => d[1]));
  const bw = (W - 2 * P) / data.length;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
    ${data.map((d, i) => { const h = (d[1] / max) * (H - 2 * P); return `
      <rect x="${P + i * bw + 3}" y="${H - P - h}" width="${bw - 6}" height="${h}" rx="4" fill="${i === data.length - 1 ? "var(--ink)" : d[1] >= 3 ? "#c9c9c4" : "#e4e4e0"}"/>
      ${d[1] ? `<text x="${P + i * bw + bw / 2}" y="${H - P - h - 4}" fill="var(--muted)" font-size="11" text-anchor="middle">${d[1]}</text>` : ""}`; }).join("")}
    <line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" stroke="var(--line)"/>
    <text x="${W - P}" y="${H - 4}" fill="var(--muted)" font-size="11" text-anchor="end">esta semana</text>
  </svg>`;
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
