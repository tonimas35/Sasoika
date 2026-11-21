# Sasoika

«Sasoika»: de *sasoian egon*, estar en forma, en euskera.

App web mínima para registrar comidas y entrenos (objetivo: Vietnam, enero 2027).

- **Hoy**: proteína y kcal del día frente al objetivo, qué rutina toca, comidas y peso/cintura.
- **Entreno**: rutinas A/B con lo que hiciste la última vez; añade series con un toque. También fútbol y cardio.
- **Progreso**: peso, cintura, evolución por ejercicio y entrenos por semana.

Stack: HTML + JS sin build, Supabase (Postgres + Auth + RLS), GitHub Pages.

Las rutinas se editan en `routines.js`. Claude puede leer y escribir los datos directamente en Supabase (proyecto `forma-tracker`).

## Créditos

Modelo anatómico 3D: [Z-Anatomy](https://www.z-anatomy.com) (Gauthier Kervyn, Marcin Zielinski y colaboradores), basado en BodyParts3D © The Database Center for Life Science. Licencia [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). El archivo `assets/body.glb` es una adaptación (músculos superficiales agrupados, decimado y comprimido) y se distribuye bajo la misma licencia.
