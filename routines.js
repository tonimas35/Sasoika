// Rutinas. Para cambiar ejercicios, edita esta lista.
// type: "reps" (peso + repeticiones) o "time" (segundos)
export const ROUTINES = {
  A: [
    { name: "Dominadas agarre neutro", target: "3 × 5-8", type: "reps", bodyweight: true,
      tip: "Palmas enfrentadas. Baja del todo con control y sube hasta pasar la barbilla." },
    { name: "Prensa", target: "3 × 8-12", type: "reps",
      tip: "Lumbar pegada al respaldo. Baja hasta ~90° y no bloquees las rodillas arriba." },
    { name: "Press pecho mancuernas", target: "3 × 8-12", type: "reps",
      tip: "Escápulas juntas y codos a ~45°. Baja hasta notar estiramiento en el pecho." },
    { name: "Curl femoral tumbado", target: "2 × 10-15", type: "reps",
      tip: "Rodillas en el borde, rodillo sobre los talones. Cadera pegada al banco." },
    { name: "Curl bíceps", target: "2 × 10-15", type: "reps",
      tip: "Sentado, codos quietos pegados al cuerpo. Baja en 2-3 segundos." },
    { name: "Plancha", target: "2 × 30-45 s", type: "time",
      tip: "Codos bajo los hombros. Aprieta abdomen y glúteos y respira." },
  ],
  B: [
    { name: "Fondos", target: "3 × 6-10", type: "reps", bodyweight: true,
      tip: "Baja controlado hasta codos a 90°. Torso un poco inclinado para más pecho." },
    { name: "Peso muerto rumano", target: "3 × 8-12", type: "reps",
      tip: "Espalda recta, rodillas algo flexionadas. Lleva la cadera atrás hasta notar los isquios." },
    { name: "Remo en máquina", target: "3 × 8-12", type: "reps",
      tip: "Pecho apoyado, tira con los codos y junta escápulas al final." },
    { name: "Press militar", target: "2 × 8-12", type: "reps",
      tip: "Abdomen firme, sin arquear la lumbar. Sube en vertical por encima de la cabeza." },
    { name: "Extensión tríceps", target: "2 × 10-15", type: "reps",
      tip: "Codos fijos; solo se mueve el antebrazo." },
    { name: "Elevación de piernas", target: "2 × 10-15", type: "reps", bodyweight: true,
      tip: "Sin balanceo. Sube las piernas con el abdomen y baja lento." },
  ],
};

export const KIND_LABEL = { A: "Rutina A", B: "Rutina B", Futbol: "Fútbol", Cardio: "Cardio", Otro: "Otro" };

// Músculos trabajados por ejercicio (peso relativo)
export const MUSCLES = {
  "Dominadas agarre neutro": { espalda: 1, biceps: 0.6 },
  "Prensa": { cuadriceps: 1, gluteos: 0.6 },
  "Press pecho mancuernas": { pecho: 1, triceps: 0.5, hombros: 0.4 },
  "Fondos": { pecho: 0.8, triceps: 1, hombros: 0.4 },
  "Curl femoral tumbado": { isquios: 1 },
  "Curl bíceps": { biceps: 1 },
  "Plancha": { core: 1 },
  "Peso muerto rumano": { isquios: 1, gluteos: 0.8, espalda: 0.4 },
  "Remo en máquina": { espalda: 1, biceps: 0.5 },
  "Press militar": { hombros: 1, triceps: 0.5 },
  "Extensión tríceps": { triceps: 1 },
  "Elevación de piernas": { core: 1 },
  "Sentadilla búlgara": { cuadriceps: 1, gluteos: 0.8 },
  "Elevaciones laterales": { hombros: 1 },
  "Curl martillo": { biceps: 1 },
};
export const KIND_MUSCLES = { Futbol: { cuadriceps: 3, isquios: 2, gemelos: 3, gluteos: 2 }, Cardio: { cuadriceps: 1.5, gemelos: 1.5 } };
export const MUSCLE_LABEL = { pecho: "Pecho", espalda: "Espalda", hombros: "Hombros", biceps: "Bíceps", triceps: "Tríceps",
  core: "Core", gluteos: "Glúteos", cuadriceps: "Cuádriceps", isquios: "Isquios", gemelos: "Gemelos" };
