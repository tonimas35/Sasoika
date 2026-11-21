// Bienvenida tipo evaluación inicial de un entrenador personal.
// runOnboarding(container, prefill) -> Promise<answers | null>
const DAYS = [[1, "L"], [2, "M"], [3, "X"], [4, "J"], [5, "V"], [6, "S"], [0, "D"]];

const STEPS = [
  { id: "intro", type: "intro" },
  { id: "display_name", type: "text", q: "¿Cómo te llamas?", hint: "Así sabré a quién animar.", placeholder: "Tu nombre" },
  { id: "sex", type: "single", q: "¿Hombre o mujer?", hint: "Lo uso para calcular tu gasto calórico y para la figura de las animaciones.",
    options: [["hombre", "Hombre"], ["mujer", "Mujer"]] },
  { id: "body", type: "numbers", q: "Unos datos básicos", hint: "Con esto calculo tus calorías y tu proteína. La cintura es opcional.",
    fields: [["age", "Edad", "años"], ["height_cm", "Altura", "cm"], ["weight", "Peso", "kg"], ["waist", "Cintura (opcional)", "cm"]] },
  { id: "objective", type: "single", q: "¿Cuál es tu objetivo principal?", hint: "Elige el que más te importe ahora mismo.",
    options: [["perder_grasa", "Perder grasa", "Bajar de peso y marcarme más"], ["recomposicion", "Perder grasa y ganar músculo", "Mejorar el físico sin cambiar mucho el peso"],
      ["ganar_musculo", "Ganar músculo", "Subir de volumen y fuerza"], ["salud", "Salud y forma", "Sentirme mejor, más energía y menos ahogo"]] },
  { id: "experience", type: "single", q: "¿Cómo está tu entrenamiento ahora?",
    options: [["cero", "Empiezo de cero", "Nunca he entrenado con pesas"], ["vuelta", "Vuelvo tras un parón", "Ya entrenaba, pero llevo meses sin ir"],
      ["regular", "Entreno ya", "Voy de forma regular"]] },
  { id: "gym_days", type: "days", q: "¿Qué días puedes ir al gimnasio?", hint: "Marca los días que de verdad puedes cumplir. Mejor 2-3 fijos que 5 que se caen." },
  { id: "sport", type: "sport", q: "¿Haces algún otro deporte fijo?", hint: "Por ejemplo fútbol, pádel o correr. Lo tendré en cuenta para no cargarte las piernas el día después." },
  { id: "session_min", type: "single", q: "¿Cuánto tiempo tienes por sesión?",
    options: [["30", "30 minutos"], ["45", "45 minutos"], ["60", "1 hora"], ["75", "Más de 1 hora"]] },
  { id: "activity", type: "single", q: "Fuera del gimnasio, ¿cómo es tu día a día?",
    options: [["sedentario", "Sentado casi todo el día", "Oficina, pocos pasos"], ["ligero", "Algo de movimiento", "Camino o voy en bici a diario"],
      ["activo", "Activo", "De pie o moviéndome gran parte del día"], ["muy_activo", "Muy activo", "Trabajo físico"]] },
  { id: "injuries", type: "multi", q: "¿Tienes alguna lesión o molestia?", hint: "Marca todas las que apliquen.",
    options: [["ninguna", "Ninguna"], ["rodilla", "Rodilla"], ["espalda", "Espalda baja"], ["hombro", "Hombro"], ["muneca", "Muñeca o codo"], ["otra", "Otra"]] },
  { id: "health", type: "multi", q: "Unas preguntas de salud", hint: "Las hace cualquier entrenador antes de empezar. Marca si alguna es un sí.",
    options: [["corazon", "Un médico me ha dicho que tengo un problema de corazón o tensión alta"], ["pecho", "Noto dolor en el pecho al hacer ejercicio"],
      ["mareo", "Pierdo el equilibrio por mareos o me he desmayado"], ["embarazo", "Estoy embarazada o he dado a luz hace poco"],
      ["medicacion", "Tomo medicación que afecta al ejercicio"], ["ninguna", "Ninguna de estas"]] },
  { id: "event", type: "event", q: "¿Tienes una fecha objetivo?", hint: "Un viaje, una boda, el verano… Ayuda mucho a mantener la constancia. Es opcional." },
];

export function runOnboarding(root, prefill = {}) {
  return new Promise((resolve) => {
    const a = { ...prefill };
    let i = 0;
    const render = () => {
      const s = STEPS[i];
      const pct = Math.round((i / (STEPS.length - 1)) * 100);
      let body = "";
      if (s.type === "intro") {
        body = `<div class="ob-intro"><div class="ob-avatar">S</div>
          <h1>Hola, soy tu entrenador en Sasoika.</h1>
          <p>Antes de empezar quiero conocerte, como haría cualquier preparador en la primera sesión. Son 12 preguntas rápidas y con ellas preparo tu plan: días de entreno, calorías y proteína.</p>
          <p class="muted small">Tardas unos 2 minutos. Podrás cambiarlo todo luego en Objetivos.</p></div>`;
      } else {
        body = `<p class="label">Pregunta ${i} de ${STEPS.length - 1}</p><h1 class="ob-q">${s.q}</h1>${s.hint ? `<p class="muted">${s.hint}</p>` : ""}<div class="ob-body">`;
        if (s.type === "text") body += `<input id="obIn" placeholder="${s.placeholder}" value="${a[s.id] ?? ""}" autocomplete="given-name">`;
        if (s.type === "single" || s.type === "multi") {
          const sel = s.type === "multi" ? new Set(a[s.id] || []) : new Set([String(a[s.id] ?? "")]);
          body += s.options.map(([v, t, sub]) => `<button class="ob-opt ${sel.has(v) ? "on" : ""}" data-v="${v}"><b>${t}</b>${sub ? `<small>${sub}</small>` : ""}</button>`).join("");
        }
        if (s.type === "numbers") body += `<div class="ob-grid">${s.fields.map(([k, t, u]) => `<label>${t}<div class="ob-unit"><input type="number" inputmode="decimal" data-k="${k}" value="${a[k] ?? ""}"><span>${u}</span></div></label>`).join("")}</div>`;
        if (s.type === "days" || s.type === "sport") {
          const key = s.type === "days" ? "gym_days" : "sport_day";
          const sel = new Set(s.type === "days" ? a.gym_days || [] : a.sport_day != null ? [a.sport_day] : []);
          if (s.type === "sport") body += `<input id="obIn" placeholder="Deporte (déjalo vacío si no haces)" value="${a.sport_name ?? ""}">`;
          body += `<div class="ob-days" data-key="${key}">${DAYS.map(([v, t]) => `<button class="${sel.has(v) ? "on" : ""}" data-v="${v}">${t}</button>`).join("")}</div>`;
        }
        if (s.type === "event") body += `<input id="obIn" placeholder="Nombre (p. ej. Vietnam)" value="${a.event_name ?? ""}"><input id="obDate" type="date" value="${a.event_date ?? ""}">`;
        body += `</div>`;
      }
      root.innerHTML = `<div class="ob-bar"><div style="width:${pct}%"></div></div>${body}
        <div class="ob-nav">${i > 0 ? `<button class="ghost" id="obBack">Atrás</button>` : `<button class="ghost" id="obSkip">Ahora no</button>`}
        <button class="primary" id="obNext">${i === 0 ? "Empezar" : i === STEPS.length - 1 ? "Ver mi plan" : "Siguiente"}</button></div>`;

      root.querySelectorAll(".ob-opt").forEach((b) => b.onclick = () => {
        if (s.type === "single") { a[s.id] = b.dataset.v; render(); setTimeout(next, 180); return; }
        let set = new Set(a[s.id] || []);
        if (b.dataset.v === "ninguna") set = new Set(["ninguna"]);
        else { set.delete("ninguna"); set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v); }
        a[s.id] = [...set]; render();
      });
      root.querySelectorAll(".ob-days button").forEach((b) => b.onclick = () => {
        const v = +b.dataset.v;
        if (s.type === "days") { const set = new Set(a.gym_days || []); set.has(v) ? set.delete(v) : set.add(v); a.gym_days = [...set]; }
        else { a.sport_name = root.querySelector("#obIn").value; a.sport_day = a.sport_day === v ? null : v; }
        render();
      });
      const back = root.querySelector("#obBack"); if (back) back.onclick = () => { collect(); i--; render(); };
      const skip = root.querySelector("#obSkip"); if (skip) skip.onclick = () => resolve(null);
      root.querySelector("#obNext").onclick = next;
      root.querySelector("input")?.focus?.();
    };
    const collect = () => {
      const s = STEPS[i];
      if (s.type === "text") a[s.id] = root.querySelector("#obIn").value.trim();
      if (s.type === "numbers") root.querySelectorAll("[data-k]").forEach((x) => (a[x.dataset.k] = x.value === "" ? null : +x.value));
      if (s.type === "sport") a.sport_name = root.querySelector("#obIn").value.trim() || null;
      if (s.type === "event") { a.event_name = root.querySelector("#obIn").value.trim() || null; a.event_date = root.querySelector("#obDate").value || null; }
    };
    const valid = () => {
      const s = STEPS[i];
      if (s.type === "text") return !!a[s.id];
      if (s.type === "numbers") return a.age > 12 && a.height_cm > 120 && a.weight > 30;
      if (s.type === "single") return a[s.id] != null;
      if (s.type === "multi") return (a[s.id] || []).length > 0;
      if (s.type === "days") return (a.gym_days || []).length > 0;
      return true;
    };
    const next = () => {
      collect();
      if (!valid()) { root.querySelector(".ob-nav").classList.add("shake"); setTimeout(() => root.querySelector(".ob-nav")?.classList.remove("shake"), 400); return; }
      if (i === STEPS.length - 1) return resolve(a);
      i++; render(); window.scrollTo(0, 0);
    };
    render();
  });
}

// Plan a partir de las respuestas (Mifflin-St Jeor + factor de actividad + objetivo)
export function buildPlan(a) {
  const male = a.sex !== "mujer";
  const bmr = 10 * a.weight + 6.25 * a.height_cm - 5 * a.age + (male ? 5 : -161);
  const base = { sedentario: 1.2, ligero: 1.35, activo: 1.5, muy_activo: 1.65 }[a.activity] ?? 1.3;
  const sessions = (a.gym_days || []).length + (a.sport_day != null ? 1 : 0);
  const tdee = bmr * (base + Math.min(0.25, sessions * 0.05));
  const adj = { perder_grasa: -0.2, recomposicion: -0.1, ganar_musculo: 0.1, salud: 0 }[a.objective] ?? 0;
  // Nunca por debajo del metabolismo basal + 10 %
  const kcal = Math.round(Math.max(tdee * (1 + adj), bmr * 1.1) / 50) * 50;
  const pkg = { perder_grasa: 2.0, recomposicion: 2.0, ganar_musculo: 1.8, salud: 1.6 }[a.objective] ?? 1.8;
  const protein = Math.round((a.weight * pkg) / 5) * 5;
  return { kcal, protein, tdee: Math.round(tdee), sessions: (a.gym_days || []).length };
}
