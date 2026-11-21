# Sasoika

«Sasoika»: de *sasoian egon*, estar en forma, en euskera.

App web mínima para registrar comidas y entrenos (objetivo: Vietnam, enero 2027).

- **Hoy**: proteína y kcal del día frente al objetivo, qué rutina toca, comidas y peso/cintura.
- **Entreno**: rutinas A/B con lo que hiciste la última vez; añade series con un toque. También fútbol y cardio.
- **Progreso**: peso, cintura, evolución por ejercicio y entrenos por semana.

Stack: HTML + JS sin build, Supabase (Postgres + Auth + RLS), GitHub Pages.

Las rutinas se editan en `routines.js`. Claude puede leer y escribir los datos directamente en Supabase (proyecto `forma-tracker`).
