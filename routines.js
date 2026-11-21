// Rutinas. Para cambiar ejercicios, edita esta lista.
// type: "reps" (peso + repeticiones) o "time" (segundos)
export const ROUTINES = {
  A: [
    { name: "Dominadas agarre neutro", target: "3 × 5-8", type: "reps", bodyweight: true },
    { name: "Prensa", target: "3 × 8-12", type: "reps" },
    { name: "Press pecho mancuernas", target: "3 × 8-12", type: "reps" },
    { name: "Curl femoral tumbado", target: "2 × 10-15", type: "reps" },
    { name: "Curl bíceps", target: "2 × 10-15", type: "reps" },
    { name: "Plancha", target: "2 × 30-45 s", type: "time" },
  ],
  B: [
    { name: "Fondos", target: "3 × 6-10", type: "reps", bodyweight: true },
    { name: "Peso muerto rumano", target: "3 × 8-12", type: "reps" },
    { name: "Remo en máquina", target: "3 × 8-12", type: "reps" },
    { name: "Press militar", target: "2 × 8-12", type: "reps" },
    { name: "Extensión tríceps", target: "2 × 10-15", type: "reps" },
    { name: "Elevación de piernas", target: "2 × 10-15", type: "reps", bodyweight: true },
  ],
};

export const KIND_LABEL = { A: "Rutina A", B: "Rutina B", Futbol: "Fútbol", Cardio: "Cardio", Otro: "Otro" };
