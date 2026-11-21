import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { ROUTINES, KIND_LABEL, MUSCLES, KIND_MUSCLES, MUSCLE_LABEL, DETAILS } from "./routines.js?v=10";

const SUPABASE_URL = "https://zxgmtfqgctbwnhykuzyd.supabase.co";
const SUPABASE_KEY = "sb_publishable_WRU0kZGeWv5Yyr6nvidb8Q_fDujckjs"; // clave pública; los datos están protegidos por RLS
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const TZ = "Europe/Madrid";
const dayOf = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: TZ });
const todayStr = () => dayOf(new Date());
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
const mondayOf = (s) => { const d = new Date(s + "T12:00:00"); return addDays(s, -((d.getDay() + 6) % 7)); };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const fmt = (n, dec = 1) => (n == null ? "" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: dec }));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const GOAL_DEFAULTS = { kcal: 2300, protein: 140, event_name: "Vietnam", event_date: "2027-01-16", start_date: "2026-11-21",
  target_weight: null, target_waist: null, weekly_sessions: 3 };

let user = null;
let goals = { ...GOAL_DEFAULTS };
let currentKind = null;
let extraExercises = [];
let mannequin = null; // módulo 3D cargado bajo demanda

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1800);
}
function fail(error) { if (error) { console.error(error); toast("Error: " + (error.message || error)); return true; } return false; }

// ---------- Navegación ----------
const SCREENS = ["auth", "inicio", "comidas", "entrenos", "progreso", "ajustes"];
function show(name) {
  SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== name));
  $("tabs").classList.toggle("hidden", name === "auth" || name === "ajustes");
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  window.scrollTo(0, 0);
  ({ inicio: loadInicio, comidas: loadComidas, entrenos: loadEntrenos, progreso: loadProgreso, ajustes: fillGoalsForm }[name] || (() => {}))();
}
document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));

function segmented(segId, prefix, onChange) {
  document.querySelectorAll(`#${segId} button`).forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(`#${segId} button`).forEach((x) => {
      x.classList.toggle("active", x === b);
      $(`${prefix}-${x.dataset.sub}`).classList.toggle("hidden", x !== b);
    });
    onChange?.(b.dataset.sub);
  }));
}
segmented("mealSeg", "meal", (s) => s === "historico" ? loadHistory() : loadComidas());
segmented("trainSeg", "train", (s) => s === "rutina" ? renderRoutineView() : loadEntrenos());

// ---------- Auth ----------
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim(), password = $("password").value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (!error) {
    // Pide al navegador que guarde la contraseña (Chrome/Edge/Android); Safari lo detecta por el formulario
    try { if (window.PasswordCredential) await navigator.credentials.store(new PasswordCredential({ id: email, password, name: email })); } catch {}
  }
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
$("editGoals").addEventListener("click", () => show("ajustes"));
$("closeSettings").addEventListener("click", () => show("inicio"));

sb.auth.onAuthStateChange((_ev, session) => {
  const was = user?.id;
  user = session?.user ?? null;
  if (!user) return show("auth");
  if (was !== user.id) setTimeout(init, 0);
});

async function init() {
  const { data } = await sb.from("goals").select("*").maybeSingle();
  if (data) goals = { ...GOAL_DEFAULTS, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)) };
  else await sb.from("goals").insert({ kcal: goals.kcal, protein: goals.protein });
  show("inicio");
}

// ---------- Objetivos (ajustes) ----------
function fillGoalsForm() {
  $("gEventName").value = goals.event_name || "";
  $("gEventDate").value = goals.event_date || "";
  $("gStartDate").value = goals.start_date || "";
  $("gWeight").value = goals.target_weight ?? "";
  $("gWaist").value = goals.target_waist ?? "";
  $("goalKcal").value = goals.kcal; $("goalProt").value = goals.protein;
  $("gSessions").value = goals.weekly_sessions;
}
$("goalsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const num = (id) => ($(id).value === "" ? null : +$(id).value);
  const g = { user_id: user.id, kcal: num("goalKcal") || 0, protein: num("goalProt") || 0,
    event_name: $("gEventName").value.trim() || null, event_date: $("gEventDate").value || null, start_date: $("gStartDate").value || null,
    target_weight: num("gWeight"), target_waist: num("gWaist"), weekly_sessions: num("gSessions") || 3, updated_at: new Date().toISOString() };
  if (fail((await sb.from("goals").upsert(g)).error)) return;
  goals = { ...GOAL_DEFAULTS, ...g }; toast("Objetivos guardados"); show("inicio");
});

// ---------- Inicio ----------
async function loadInicio() {
  $("todayLabel").textContent = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const from7 = addDays(todayStr(), -6);
  const [wk, sets, meals, body] = await Promise.all([
    sb.from("workouts").select("id, kind, day").gte("day", mondayOf(from7)).order("day"),
    sb.from("sets").select("exercise, workouts!inner(day)").gte("workouts.day", from7),
    sb.from("meals").select("eaten_at, protein").gte("eaten_at", new Date(from7 + "T00:00:00").toISOString()),
    sb.from("body").select("day, weight_kg, waist_cm").order("day"),
  ]);
  const workouts = wk.data || [];

  // Músculos (últimos 7 días)
  const score = {};
  (sets.data || []).forEach((s) => Object.entries(MUSCLES[s.exercise] || {}).forEach(([m, f]) => (score[m] = (score[m] || 0) + f)));
  workouts.filter((w) => w.day >= from7).forEach((w) => Object.entries(KIND_MUSCLES[w.kind] || {}).forEach(([m, f]) => (score[m] = (score[m] || 0) + f)));
  const inten = Object.fromEntries(Object.entries(score).map(([m, v]) => [m, Math.min(1, v / 6)]));
  const trained = Object.entries(inten).sort((a, b) => b[1] - a[1]);
  $("muscleChips").innerHTML = trained.length
    ? trained.map(([m, t]) => `<span class="mchip"><i style="opacity:${0.25 + 0.75 * t}"></i>${MUSCLE_LABEL[m]}</span>`).join("")
    : `<span class="muted small">Aún nada esta semana</span>`;
  const missing = Object.keys(MUSCLE_LABEL).filter((m) => !score[m]).map((m) => MUSCLE_LABEL[m]);
  $("muscleMissing").textContent = missing.length && trained.length ? `Sin tocar: ${missing.join(", ")}` : "";
  renderMannequin(inten);

  // Resumen
  const weekStart = mondayOf(todayStr());
  const gym = workouts.filter((w) => w.day >= weekStart && (w.kind === "A" || w.kind === "B")).length;
  const other = workouts.filter((w) => w.day >= weekStart && (w.kind === "Futbol" || w.kind === "Cardio")).length;
  $("sumSessions").innerHTML = `${gym}<small> / ${goals.weekly_sessions}</small>`;
  $("sumSessionsSub").textContent = other ? `gimnasio · +${other} fútbol/cardio` : "gimnasio esta semana";

  const protByDay = {};
  (meals.data || []).forEach((m) => { const d = dayOf(m.eaten_at); protByDay[d] = (protByDay[d] || 0) + Number(m.protein || 0); });
  const days = Object.values(protByDay);
  const avgProt = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
  $("sumProt").innerHTML = avgProt == null ? "–" : `${fmt(avgProt, 0)}<small> g</small>`;
  $("sumProtSub").textContent = avgProt == null ? "registra comidas" : `objetivo ${goals.protein} g · ${days.length} días`;

  const b = body.data || [];
  const ws = b.filter((r) => r.weight_kg != null), cs = b.filter((r) => r.waist_cm != null);
  const lastW = ws.at(-1), firstW = ws[0], lastC = cs.at(-1), firstC = cs[0];
  const delta = (a, z, u) => { const d = a - z; return Math.abs(d) < 0.05 ? "desde el inicio" : `${d > 0 ? "+" : ""}${fmt(d)} ${u} desde el inicio`; };
  $("sumWeight").innerHTML = lastW ? `${fmt(lastW.weight_kg)}<small> kg</small>` : "–";
  $("sumWeightSub").textContent = lastW ? delta(lastW.weight_kg, firstW.weight_kg, "kg") : "registra tu peso";
  $("sumWaist").innerHTML = lastC ? `${fmt(lastC.waist_cm)}<small> cm</small>` : "–";
  $("sumWaistSub").textContent = lastC ? delta(lastC.waist_cm, firstC.waist_cm, "cm") : "registra tu cintura";

  const today = b.find((r) => r.day === todayStr());
  $("bodyWeight").value = today?.weight_kg ?? "";
  $("bodyWaist").value = today?.waist_cm ?? "";

  // Objetivos
  const ev = goals.event_date;
  $("eventName").textContent = goals.event_name || "Objetivo";
  if (ev) {
    const left = daysBetween(todayStr(), ev);
    const total = Math.max(1, daysBetween(goals.start_date || todayStr(), ev));
    $("eventDate").textContent = new Date(ev + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" });
    $("eventDays").innerHTML = left > 0 ? `${left}<small> días</small>` : left === 0 ? "¡Hoy! ✈️" : "Conseguido";
    $("eventBar").style.width = Math.min(100, Math.max(2, ((total - left) / total) * 100)) + "%";
    $("eventSub").textContent = left > 0 ? `${Math.floor(left / 7)} semanas y ${left % 7} días · ${Math.round(((total - left) / total) * 100)}% del plan` : "";
  }
  const rows = [];
  const row = (label, now, target, frac) => rows.push(`<div class="goal-row"><div class="row-between"><span class="label">${label}</span><span>${now}</span></div>
      <div class="bar"><div class="fill" style="width:${Math.max(2, Math.min(100, frac * 100))}%"></div></div></div>`);
  row("Entrenos esta semana", `${gym} / ${goals.weekly_sessions}`, null, gym / goals.weekly_sessions);
  row("Proteína media", avgProt == null ? `– / ${goals.protein} g` : `${fmt(avgProt, 0)} / ${goals.protein} g`, null, (avgProt || 0) / goals.protein);
  if (goals.target_weight && lastW) {
    const span = Math.abs(firstW.weight_kg - goals.target_weight) || 1;
    row("Peso", `${fmt(lastW.weight_kg)} → ${fmt(goals.target_weight)} kg`, null, 1 - Math.abs(lastW.weight_kg - goals.target_weight) / span);
  }
  if (goals.target_waist && lastC) {
    const span = Math.abs(firstC.waist_cm - goals.target_waist) || 1;
    row("Cintura", `${fmt(lastC.waist_cm)} → ${fmt(goals.target_waist)} cm`, null, 1 - Math.abs(lastC.waist_cm - goals.target_waist) / span);
  }
  if (!goals.target_weight || !goals.target_waist) rows.push(`<p class="muted small">Pon un peso y una cintura objetivo en <b>Editar</b> para ver tu avance.</p>`);
  $("goalList").innerHTML = rows.join("");
}

async function renderMannequin(inten) {
  try {
    if (!mannequin) {
      mannequin = await import("./mannequin.js?v=5");
      mannequin.mountMannequin($("mannequin"));
    } else if (!$("mannequin").querySelector("canvas")) {
      mannequin.mountMannequin($("mannequin"));
    }
    mannequin.paintMuscles(inten);
  } catch (e) {
    console.error(e);
    $("mannequin").innerHTML = `<p class="empty">No se ha podido cargar la figura 3D</p>`;
  }
}

$("bodyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const w = $("bodyWeight").value, c = $("bodyWaist").value;
  if (!w && !c) return;
  const { error } = await sb.from("body").upsert(
    { user_id: user.id, day: todayStr(), weight_kg: w ? +w : null, waist_cm: c ? +c : null },
    { onConflict: "user_id,day" });
  if (!fail(error)) { toast("Guardado"); loadInicio(); }
});

// ---------- Comidas ----------
async function loadComidas() {
  const since = new Date(); since.setDate(since.getDate() - 60);
  const [today, recent] = await Promise.all([
    sb.from("meals").select("*").gte("eaten_at", startOfToday()).order("eaten_at"),
    sb.from("meals").select("name, kcal, protein, eaten_at").gte("eaten_at", since.toISOString()).order("eaten_at", { ascending: false }),
  ]);
  renderToday(today.data || []);
  renderFrequent(recent.data || []);
}

function renderToday(meals) {
  const kcal = meals.reduce((s, m) => s + (m.kcal || 0), 0);
  const prot = meals.reduce((s, m) => s + Number(m.protein || 0), 0);
  $("kcalVal").textContent = fmt(kcal, 0); $("kcalGoal").textContent = goals.kcal;
  $("protVal").textContent = fmt(prot, 0); $("protGoal").textContent = goals.protein;
  const C = 94.25;
  const ring = (el, f) => { el.style.strokeDashoffset = C * (1 - Math.max(0, Math.min(1, f))); };
  ring($("kcalBar"), kcal / goals.kcal); $("kcalBar").classList.toggle("over", kcal > goals.kcal * 1.05);
  ring($("protBar"), prot / goals.protein); $("protBar").classList.toggle("done", prot >= goals.protein);

  const ul = $("mealList");
  ul.innerHTML = meals.length ? "" : `<li class="empty">Nada registrado hoy</li>`;
  meals.forEach((m) => {
    const li = document.createElement("li");
    const time = new Date(m.eaten_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    li.innerHTML = `<div><div>${esc(m.name)}</div><div class="meta">${time} · ${m.kcal ?? "?"} kcal · ${fmt(m.protein) || "?"} g prot</div></div>
      <button class="del" aria-label="Borrar">✕</button>`;
    li.querySelector(".del").onclick = async () => {
      if (!confirm(`¿Borrar "${m.name}"?`)) return;
      if (!fail((await sb.from("meals").delete().eq("id", m.id)).error)) loadComidas();
    };
    ul.appendChild(li);
  });
}

function renderFrequent(recent) {
  const by = {};
  recent.forEach((m) => {
    const k = m.name.trim().toLowerCase();
    if (!by[k]) by[k] = { name: m.name.trim(), kcal: m.kcal, protein: m.protein, n: 0 };
    by[k].n++;
  });
  const list = Object.values(by).sort((a, b) => b.n - a.n).slice(0, 10);
  $("frequentWrap").classList.toggle("hidden", list.length === 0);
  const box = $("frequent"); box.innerHTML = "";
  list.forEach((f) => {
    const b = document.createElement("button");
    b.className = "fchip";
    b.innerHTML = `${esc(f.name)}<small>${f.kcal ?? "?"} kcal · ${fmt(f.protein) || "?"} g</small>`;
    b.onclick = async () => {
      if (fail((await sb.from("meals").insert({ name: f.name, kcal: f.kcal, protein: f.protein })).error)) return;
      toast("Añadida: " + f.name); loadComidas();
    };
    box.appendChild(b);
  });
}

$("mealForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const row = { name: $("mealName").value.trim(), kcal: $("mealKcal").value ? +$("mealKcal").value : null,
    protein: $("mealProt").value ? +$("mealProt").value : null };
  if (fail((await sb.from("meals").insert(row)).error)) return;
  $("mealForm").reset(); toast("Comida guardada"); loadComidas();
});

async function loadHistory() {
  const since = new Date(); since.setDate(since.getDate() - 30);
  const { data, error } = await sb.from("meals").select("*").gte("eaten_at", since.toISOString()).order("eaten_at", { ascending: false });
  if (fail(error)) return;
  const byDay = {};
  (data || []).forEach((m) => (byDay[dayOf(m.eaten_at)] ||= []).push(m));
  const box = $("history");
  const days = Object.keys(byDay).sort().reverse();
  if (!days.length) { box.innerHTML = `<p class="empty">Todavía no hay comidas registradas</p>`; return; }
  box.innerHTML = days.map((d) => {
    const ms = byDay[d].slice().reverse();
    const k = ms.reduce((s, m) => s + (m.kcal || 0), 0), p = ms.reduce((s, m) => s + Number(m.protein || 0), 0);
    const label = d === todayStr() ? "Hoy" : d === addDays(todayStr(), -1) ? "Ayer"
      : new Date(d + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });
    return `<div class="card day-card">
      <div class="day-head"><b>${label}</b><span class="muted small">${fmt(k, 0)} kcal · ${fmt(p, 0)} g prot</span></div>
      <div class="mini-bar"><div style="width:${Math.min(100, (p / goals.protein) * 100)}%"></div></div>
      <div class="day-meals">${ms.map((m) => `<div class="day-meal"><span>${esc(m.name)}</span><span>${m.kcal ?? "?"} kcal · ${fmt(m.protein) || "?"} g</span></div>`).join("")}</div>
    </div>`;
  }).join("");
  box.querySelectorAll(".day-card").forEach((c) => c.addEventListener("click", () => c.classList.toggle("open")));
}

// ---------- Entrenos ----------
document.querySelectorAll("#kindSeg button").forEach((b) => b.addEventListener("click", () => {
  currentKind = b.dataset.kind; extraExercises = []; loadEntrenos();
}));

async function nextRoutine() {
  const { data } = await sb.from("workouts").select("kind, day").in("kind", ["A", "B"]).order("day", { ascending: false }).order("id", { ascending: false }).limit(1);
  const last = data?.[0];
  if (last?.day === todayStr()) return { kind: last.kind, today: true };
  return { kind: last?.kind === "A" ? "B" : "A", today: false };
}

async function todayWorkout(kind, create = false) {
  const { data } = await sb.from("workouts").select("*").eq("day", todayStr()).eq("kind", kind).order("id").limit(1);
  if (data?.[0] || !create) return data?.[0] || null;
  const { data: w, error } = await sb.from("workouts").insert({ kind, day: todayStr() }).select().single();
  fail(error); return w;
}

async function loadEntrenos() {
  const next = await nextRoutine();
  if (!currentKind) currentKind = next.kind;
  $("nextHint").textContent = next.today ? `Hoy ya has hecho la ${KIND_LABEL[next.kind]} ✓` : `Te toca la ${KIND_LABEL[next.kind]}`;
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
  const { data: recent } = await sb.from("sets").select("*, workouts!inner(day, kind)").order("created_at", { ascending: false }).limit(400);
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

function setLabel(s) {
  if (s.seconds && !s.reps) return `${s.seconds} s`;
  return s.weight_kg ? `${fmt(s.weight_kg)} kg × ${s.reps}` : `${s.reps} reps`;
}

async function addSet(ex, mine, values) {
  const w = await todayWorkout(currentKind, true);
  if (!w) return;
  const row = { workout_id: w.id, exercise: ex.name, set_no: mine.length + 1, ...values };
  if (!fail((await sb.from("sets").insert(row)).error)) { toast(`Serie ${row.set_no} guardada`); startRest(DETAILS[ex.name]?.rest || 90); loadEntrenos(); }
}

function exerciseCard(ex, mine, last) {
  const card = document.createElement("div");
  card.className = "card";
  const lastTxt = last.length ? `Última vez (${relDay(last[0].workouts.day)}): ${last.map(setLabel).join(", ")}` : "Sin registros previos";
  card.innerHTML = `
    <div class="ex-head"><span class="ex-name ${DETAILS[ex.name] ? "tap" : ""}">${esc(ex.name)}</span>${ex.target ? `<span class="ex-target">${ex.target}</span>` : ""}</div>
    <div class="ex-last">${esc(lastTxt)}</div>
    <div class="chips"></div>
    <form class="set-row">
      ${ex.type === "time"
        ? `<input type="number" inputmode="numeric" placeholder="segundos" name="seconds" required>`
        : `<input type="number" inputmode="decimal" step="0.5" placeholder="${ex.bodyweight ? "lastre kg" : "kg"}" name="weight">
           <input type="number" inputmode="numeric" placeholder="reps" name="reps" required>`}
      <button class="primary" type="submit">＋</button>
    </form>`;

  card.querySelector(".ex-name.tap")?.addEventListener("click", () => openSheet(ex));
  const chips = card.querySelector(".chips");
  mine.forEach((s) => {
    const c = document.createElement("button");
    c.className = "chip"; c.textContent = setLabel(s); c.title = "Toca para borrar";
    c.onclick = async () => {
      if (!confirm(`¿Borrar la serie ${c.textContent}?`)) return;
      if (!fail((await sb.from("sets").delete().eq("id", s.id)).error)) loadEntrenos();
    };
    chips.appendChild(c);
  });

  // "Igual que la última vez": la serie equivalente de la sesión anterior
  const ref = last[mine.length];
  if (ref) {
    const r = document.createElement("button");
    r.className = "repeat"; r.type = "button";
    r.textContent = `↺ Igual que la última: ${setLabel(ref)}`;
    r.onclick = () => addSet(ex, mine, { weight_kg: ref.weight_kg, reps: ref.reps, seconds: ref.seconds });
    card.insertBefore(r, card.querySelector("form"));
  }

  const form = card.querySelector("form");
  const pre = mine.at(-1) || ref || last.at(-1);
  if (pre) {
    if (form.weight && pre.weight_kg) form.weight.value = pre.weight_kg;
    if (form.reps && pre.reps) form.reps.placeholder = `reps (${pre.reps})`;
    if (form.seconds && pre.seconds) form.seconds.placeholder = `segundos (${pre.seconds})`;
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button"); btn.disabled = true;
    const v = form.seconds ? { seconds: +form.seconds.value }
      : { weight_kg: form.weight.value ? +form.weight.value : null, reps: +form.reps.value };
    await addSet(ex, mine, v);
    btn.disabled = false;
  });
  return card;
}

function relDay(day) {
  const diff = daysBetween(day, todayStr());
  return diff === 0 ? "hoy" : diff === 1 ? "ayer" : `hace ${diff} días`;
}

$("extraForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = $("extraName").value.trim(); if (!n) return;
  extraExercises.push(n); $("extraName").value = ""; loadEntrenos();
});

$("simpleSave").onclick = async () => {
  const w = await todayWorkout(currentKind, true);
  if (!w) return;
  if (!fail((await sb.from("workouts").update({ notes: $("simpleNotes").value || null }).eq("id", w.id)).error)) { toast("Registrado"); loadEntrenos(); }
};

// Plan semanal: lunes, viernes y domingo gimnasio (alternando A/B); jueves fútbol
const PLAN = { 1: "gym", 4: "Futbol", 5: "gym", 0: "gym" }; // getDay(): 0 = domingo
const DOW = ["L", "M", "X", "J", "V", "S", "D"];
function phaseOf(week) {
  if (week <= 2) return { name: "Readaptación", txt: "2-3 series, lejos del fallo (3-4 reps en reserva)." };
  if (week <= 7) return { name: "Progresión", txt: "3 series, 1-2 reps en reserva. Sube peso al llegar al tope del rango." };
  return { name: "Puesta a punto", txt: "Mantén cargas y llega descansado al viaje." };
}

async function renderRoutineView() {
  const today = todayStr(), mon = mondayOf(today);
  const { data } = await sb.from("workouts").select("day, kind").gte("day", addDays(mon, -21)).order("day").order("id");
  const done = {};
  (data || []).forEach((w) => (done[w.day] ||= []).push(w.kind));
  const lastAB = [...(data || [])].reverse().find((w) => w.kind === "A" || w.kind === "B")?.kind;
  let next = lastAB === "A" ? "B" : "A";

  const cell = (d) => {
    const dow = new Date(d + "T12:00:00").getDay();
    const k = done[d];
    let label = "", cls = "";
    if (k?.length) { label = k.map((x) => (x === "Futbol" ? "⚽" : x === "Cardio" ? "🚴" : x)).join(""); cls = "done"; }
    else if (d >= today && PLAN[dow] && !(dow === 0 && (done[addDays(d, -1)] || []).some((x) => x === "A" || x === "B"))) {
      if (PLAN[dow] === "gym") { label = next; next = next === "A" ? "B" : "A"; }
      else label = "⚽";
      cls = "plan";
    } else if (d < today && PLAN[dow]) { label = "·"; cls = "miss"; }
    return `<div class="pday ${cls} ${d === today ? "today" : ""}"><span>${DOW[(dow + 6) % 7]}</span><b>${label || "&nbsp;"}</b></div>`;
  };
  const week = (start) => Array.from({ length: 7 }, (_, i) => cell(addDays(start, i))).join("");

  const weekN = Math.max(1, Math.floor(daysBetween(goals.start_date || today, today) / 7) + 1);
  const ph = phaseOf(weekN);
  const planHtml = `
    <div class="section-head"><h2>Plan</h2><span class="label">Semana ${weekN} · ${ph.name}</span></div>
    <div class="card">
      <span class="label">Esta semana</span><div class="pweek">${week(mon)}</div>
      <span class="label">Semana que viene</span><div class="pweek">${week(addDays(mon, 7))}</div>
      <p class="muted small">Gimnasio lunes, viernes y fin de semana (sábado o domingo) alternando A y B (si un día no puedes, la siguiente sesión sigue el orden). Jueves fútbol: el viernes, menos carga de pierna. ${ph.txt}</p>
    </div>`;

  $("routineView").innerHTML = planHtml + Object.entries(ROUTINES).map(([k, list]) => `
    <div class="section-head"><h2>${KIND_LABEL[k]}</h2></div>
    ${list.map((ex, i) => `<div class="card routine-ex" data-k="${k}" data-i="${i}">
      <div class="ex-head"><span class="ex-name tap">${i + 1}. ${esc(ex.name)}</span><span class="ex-target">${ex.target}</span></div>
      <div class="muscles">${Object.keys(MUSCLES[ex.name] || {}).map((m) => `<span class="mchip">${MUSCLE_LABEL[m]}</span>`).join("")}</div>
      ${ex.tip ? `<div class="tip">${esc(ex.tip)}</div>` : ""}
    </div>`).join("")}`).join("") +
    `<p class="muted small pad">Toca un ejercicio para ver la ficha completa. Cuando hagas el máximo del rango en todas las series, sube el peso.</p>`;
  $("routineView").querySelectorAll(".routine-ex").forEach((c) => c.addEventListener("click", () => openSheet(ROUTINES[c.dataset.k][+c.dataset.i])));
}

// ---------- Ficha de ejercicio ----------
let notesTimer = null;
async function openSheet(ex) {
  const d = DETAILS[ex.name]; if (!d) return;
  const mus = MUSCLES[ex.name] || {};
  const prim = Object.keys(mus).filter((m) => mus[m] >= 0.8), sec = Object.keys(mus).filter((m) => mus[m] < 0.8);
  $("shName").textContent = ex.name;
  $("shTarget").textContent = prim.map((m) => MUSCLE_LABEL[m]).join(" · ");
  $("shMuscles").textContent = sec.length ? "Ayudan: " + sec.map((m) => MUSCLE_LABEL[m]).join(", ") : "";
  const week = Math.max(1, Math.floor(daysBetween(goals.start_date || todayStr(), todayStr()) / 7) + 1);
  const range = (ex.target.split("×")[1] || "").trim();
  $("shSets").textContent = week <= 2 && ex.type !== "time" ? `2-3 × ${range}` : ex.target;
  $("shTempo").textContent = d.tempo;
  $("shRest").textContent = d.rest >= 120 ? `${d.rest / 60} min` : `${d.rest} s`;
  $("shSteps").innerHTML = d.steps.map((x) => `<li>${esc(x)}</li>`).join("");
  $("shErrors").innerHTML = d.errors.map((x) => `<li>${esc(x)}</li>`).join("");
  $("shBreath").textContent = d.breath;
  $("shHist").textContent = "Cargando…"; $("shNotes").value = ""; $("shNotesSt").textContent = "";
  $("sheet").classList.remove("hidden"); document.body.style.overflow = "hidden";
  $("sheet").querySelector(".sheet-panel").scrollTop = 0;

  // Músculos en 3D: principal en negro, secundarios en gris
  try {
    mannequin ||= await import("./mannequin.js?v=5");
    mannequin.mountMannequin($("shModel"));
    mannequin.paintMuscles(Object.fromEntries([...prim.map((m) => [m, 1]), ...sec.map((m) => [m, 0.35])]));
  } catch (e) { console.error(e); }

  const [hist, note] = await Promise.all([
    sb.from("sets").select("weight_kg, reps, seconds, workout_id, workouts!inner(day)").eq("exercise", ex.name).order("created_at", { ascending: false }).limit(200),
    sb.from("exercise_notes").select("notes").eq("exercise", ex.name).maybeSingle(),
  ]);
  const rows = hist.data || [];
  if (!rows.length) $("shHist").textContent = "Aún no lo has hecho. ¡Empieza suave!";
  else {
    const lastW = rows[0].workout_id, last = rows.filter((r) => r.workout_id === lastW).reverse();
    const score = (r) => (r.weight_kg ? r.weight_kg * 1000 + (r.reps || 0) : (r.reps || r.seconds || 0));
    const best = rows.reduce((a, b) => (score(b) > score(a) ? b : a));
    const sessions = new Set(rows.map((r) => r.workout_id)).size;
    $("shHist").innerHTML = `Última vez (${relDay(last[0].workouts.day)}): <b>${last.map(setLabel).join(", ")}</b><br>Mejor serie: <b>${setLabel(best)}</b> · ${sessions} ${sessions === 1 ? "sesión" : "sesiones"}`;
  }
  $("shNotes").value = note.data?.notes || "";
  $("shNotes").oninput = () => {
    clearTimeout(notesTimer); $("shNotesSt").textContent = "…";
    notesTimer = setTimeout(async () => {
      const { error } = await sb.from("exercise_notes").upsert({ user_id: user.id, exercise: ex.name, notes: $("shNotes").value, updated_at: new Date().toISOString() });
      $("shNotesSt").textContent = error ? "No se ha podido guardar" : "Guardado ✓";
    }, 700);
  };
}
function closeSheet() {
  $("sheet").classList.add("hidden"); document.body.style.overflow = "";
  mannequin?.disposeMannequin();
}
$("shClose").onclick = closeSheet;
$("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) closeSheet(); });

// ---------- Temporizador de descanso ----------
let restInt = null;
function startRest(sec) {
  clearInterval(restInt);
  const el = $("restTimer"), end = Date.now() + sec * 1000;
  el.classList.remove("hidden", "done");
  const tick = () => {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    if (left > 0) { el.innerHTML = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}<small>descanso · toca para saltar</small>`; return; }
    clearInterval(restInt);
    el.classList.add("done"); el.innerHTML = "¡A por la siguiente serie!";
    try { navigator.vibrate?.([200, 100, 200]); } catch {}
    setTimeout(() => el.classList.add("hidden"), 5000);
  };
  tick(); restInt = setInterval(tick, 250);
}
$("restTimer").onclick = () => { clearInterval(restInt); $("restTimer").classList.add("hidden"); };

// ---------- Progreso ----------
async function loadProgreso() {
  const since = new Date(); since.setDate(since.getDate() - 90);
  const [body, sets, workouts, meals] = await Promise.all([
    sb.from("body").select("day, weight_kg, waist_cm").order("day"),
    sb.from("sets").select("exercise, weight_kg, reps, seconds, workouts!inner(day)").order("created_at").limit(5000),
    sb.from("workouts").select("day, kind").order("day"),
    sb.from("meals").select("eaten_at, protein").gte("eaten_at", since.toISOString()),
  ]);
  const b = body.data || [];
  lineChart($("chartWeight"), b.filter((r) => r.weight_kg != null).map((r) => [r.day, +r.weight_kg]), "kg", goals.target_weight);
  lineChart($("chartWaist"), b.filter((r) => r.waist_cm != null).map((r) => [r.day, +r.waist_cm]), "cm", goals.target_waist);

  const all = sets.data || [];
  const exNames = [...new Set(all.map((s) => s.exercise))];
  const sel = $("exSelect"); const prev = sel.value;
  sel.innerHTML = exNames.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
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

  const weeks = {};
  (workouts.data || []).filter((w) => w.kind === "A" || w.kind === "B").forEach((w) => { const k = mondayOf(w.day); weeks[k] = (weeks[k] || 0) + 1; });
  const out = [];
  for (let i = 9; i >= 0; i--) { const k = mondayOf(addDays(todayStr(), -7 * i)); out.push([k, weeks[k] || 0]); }
  barChart($("chartWeeks"), out, goals.weekly_sessions);

  const pd = {};
  (meals.data || []).forEach((m) => { const d = dayOf(m.eaten_at); pd[d] = (pd[d] || 0) + Number(m.protein || 0); });
  const last30 = addDays(todayStr(), -30);
  lineChart($("chartProt"), Object.entries(pd).filter(([d]) => d >= last30).sort(), "g", goals.protein);
  activityMap($("activity"), workouts.data || [], pd);
}

// Mapa de actividad tipo GitHub: desde el inicio del plan hasta el viaje
function activityMap(el, workouts, mealDays) {
  const today = todayStr();
  const start = mondayOf(goals.start_date && goals.start_date < today ? goals.start_date : addDays(today, -27));
  const endEv = goals.event_date && goals.event_date > today ? goals.event_date : addDays(today, 14);
  const end = addDays(mondayOf(endEv), 6);
  const lvl = {};
  Object.keys(mealDays).forEach((d) => (lvl[d] = 1));
  workouts.forEach((w) => { const v = w.kind === "A" || w.kind === "B" ? 3 : 2; lvl[w.day] = Math.max(lvl[w.day] || 0, v); });
  const weeks = Math.round(daysBetween(start, end) / 7) + 1;
  let html = `<div class="act-days"><span>L</span><span></span><span>X</span><span></span><span>V</span><span></span><span>D</span></div><div class="act-grid" style="grid-template-columns:repeat(${weeks},1fr)">`;
  for (let w = 0; w < weeks; w++) for (let i = 0; i < 7; i++) {
    const d = addDays(start, w * 7 + i);
    const cls = d === goals.event_date ? "ev" : d > today ? "fut" : `l${lvl[d] || 0}`;
    const label = new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    html += `<i class="${cls} ${d === today ? "today" : ""}" style="grid-column:${w + 1};grid-row:${i + 1}" title="${label}"></i>`;
  }
  el.innerHTML = html + "</div>";
  const gym = workouts.filter((w) => (w.kind === "A" || w.kind === "B") && w.day >= start).length;
  const active = Object.keys(lvl).filter((d) => d >= start && lvl[d] >= 2).length;
  $("actSummary").textContent = `${gym} gimnasio · ${active} días activos`;
}

function lineChart(el, pts, unit, target) {
  if (pts.length === 0) { el.innerHTML = `<p class="empty">Sin datos todavía</p>`; return; }
  const W = 320, H = 150, P = 26;
  const ys = pts.map((p) => p[1]).concat(target ? [target] : []);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1; min -= pad; max += pad;
  const x = (i) => P + (pts.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (pts.length - 1));
  const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const last = pts.at(-1);
  const d = (s) => new Date(s + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
    ${target ? `<line x1="${P}" x2="${W - P}" y1="${y(target)}" y2="${y(target)}" stroke="#c9c9c4" stroke-dasharray="4 4"/>
      <text x="${W - P}" y="${y(target) - 5}" fill="var(--muted)" font-size="10" text-anchor="end">objetivo ${fmt(target)}</text>` : ""}
    <path d="${path}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p[1])}" r="3" fill="#fff" stroke="var(--ink)" stroke-width="2"/>`).join("")}
    <text x="${P}" y="${H - 6}" fill="var(--muted)" font-size="11">${d(pts[0][0])}</text>
    <text x="${W - P}" y="${H - 6}" fill="var(--muted)" font-size="11" text-anchor="end">${d(last[0])} · ${fmt(last[1])} ${unit}</text>
  </svg>`;
}

function barChart(el, data, goal) {
  const W = 320, H = 150, P = 20, max = Math.max(goal + 1, ...data.map((d) => d[1]));
  const bw = (W - 2 * P) / data.length;
  const gy = H - P - (goal / max) * (H - 2 * P);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
    <line x1="${P}" x2="${W - P}" y1="${gy}" y2="${gy}" stroke="#c9c9c4" stroke-dasharray="4 4"/>
    ${data.map((d, i) => { const h = Math.max(d[1] ? 4 : 0, (d[1] / max) * (H - 2 * P)); return `
      <rect x="${P + i * bw + 4}" y="${H - P - h}" width="${bw - 8}" height="${h}" rx="5" fill="${i === data.length - 1 ? "var(--ink)" : d[1] >= goal ? "#bdbdb8" : "#e2e2de"}"/>
      ${d[1] ? `<text x="${P + i * bw + bw / 2}" y="${H - P - h - 5}" fill="var(--muted)" font-size="11" text-anchor="middle">${d[1]}</text>` : ""}`; }).join("")}
    <text x="${W - P}" y="${H - 4}" fill="var(--muted)" font-size="11" text-anchor="end">esta semana</text>
  </svg>`;
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
