/* Local data layer. Everything is saved in this phone's browser (localStorage),
   so no server is needed. Uses PLAN and slug() from plan.js. */

const STORE_KEY = "tt-data-v1";
const BACKUP_KEY = "tt-last-backup";
const KNOWN_CATEGORIES = ["power", "explosive", "functional", "accessory"];

let db = loadDb();

function loadDb() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.logs)) {
        const maxId = data.logs.reduce((max, l) => Math.max(max, Number(l.id) || 0), 0);
        return { nextId: Math.max(Number(data.nextId) || 1, maxId + 1), logs: data.logs };
      }
    }
  } catch {
    // Unreadable data: keep a copy so it is never silently overwritten
    try { if (raw) localStorage.setItem(STORE_KEY + "-damaged", raw); } catch { /* ignore */ }
  }
  return { nextId: 1, logs: [] };
}

function saveDb() {
  localStorage.setItem(STORE_KEY, JSON.stringify(db)); // throws if storage is full or blocked
}

function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

function getPlan() {
  const plan = {};
  for (const [day, items] of Object.entries(PLAN)) {
    plan[day] = items.map(([name, category, muscle, sets, reps], index) => ({
      position: index + 1,
      sets,
      reps,
      exercise: { id: slug(name), name, category, muscle_group: muscle },
    }));
  }
  return plan;
}

// Newest first
function getLogs() {
  return [...db.logs].sort((a, b) => {
    if (a.logged_on === b.logged_on) return b.id - a.id;
    return a.logged_on < b.logged_on ? 1 : -1;
  });
}

function numberOrNull(value, max) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error("A number is out of range.");
  return n;
}

function addLog(input) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.logged_on || ""))) throw new Error("Invalid date.");
  const ex = input.exercise;
  const log = {
    id: db.nextId,
    exercise_id: ex.id,
    logged_on: input.logged_on,
    sets: numberOrNull(input.sets, 100) ?? 1,
    reps: numberOrNull(input.reps, 1000),
    weight_kg: numberOrNull(input.weight_kg, 1000),
    duration_seconds: numberOrNull(input.duration_seconds, 36000),
    distance_m: numberOrNull(input.distance_m, 100000),
    notes: null,
    exercise: { id: ex.id, name: ex.name, category: ex.category },
  };
  db.logs.push(log);
  db.nextId += 1;
  try {
    saveDb();
  } catch {
    db.logs.pop();
    db.nextId -= 1;
    throw new Error("This browser would not save the data (storage is full or blocked).");
  }
  requestPersistence();
  return log;
}

function deleteLog(id) {
  const before = db.logs;
  db.logs = db.logs.filter((l) => l.id !== id);
  try {
    saveDb();
  } catch {
    db.logs = before;
    throw new Error("This browser would not save the change.");
  }
}

/* ---------- backup ---------- */

function exportBackup() {
  const payload = {
    app: "training-tracker",
    version: 1,
    exportedAt: new Date().toISOString(),
    logs: db.logs,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `training-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  try { localStorage.setItem(BACKUP_KEY, new Date().toISOString()); } catch { /* ignore */ }
}

// Replaces all history on this phone with the contents of a backup file
function importBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("That file is not a valid backup."); }
  if (!data || !Array.isArray(data.logs)) throw new Error("That file is not a Training Tracker backup.");

  const cleaned = data.logs.map((l, index) => {
    const name = l && l.exercise && l.exercise.name;
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(String(l.logged_on || ""))) {
      throw new Error(`Entry ${index + 1} in the file is not valid.`);
    }
    const category = KNOWN_CATEGORIES.includes(l.exercise.category) ? l.exercise.category : "accessory";
    const id = l.exercise.id || slug(name);
    return {
      oldId: Number(l.id) || 0,
      exercise_id: id,
      logged_on: l.logged_on,
      sets: numberOrNull(l.sets, 100) ?? 1,
      reps: numberOrNull(l.reps, 1000),
      weight_kg: numberOrNull(l.weight_kg, 1000),
      duration_seconds: numberOrNull(l.duration_seconds, 36000),
      distance_m: numberOrNull(l.distance_m, 100000),
      notes: null,
      exercise: { id, name, category },
    };
  });

  cleaned.sort((a, b) => {
    if (a.logged_on === b.logged_on) return a.oldId - b.oldId;
    return a.logged_on < b.logged_on ? -1 : 1;
  });
  const logs = cleaned.map((l, i) => {
    const { oldId, ...rest } = l;
    return { id: i + 1, ...rest };
  });

  const previous = db;
  db = { nextId: logs.length + 1, logs };
  try {
    saveDb();
  } catch {
    db = previous;
    throw new Error("This browser would not save the data.");
  }
  return logs.length;
}

function backupStatus() {
  let saved = null;
  try { saved = localStorage.getItem(BACKUP_KEY); } catch { /* ignore */ }
  if (!saved) return "No backup yet. Export one after your first workout.";
  const days = Math.floor((Date.now() - new Date(saved).getTime()) / 86400000);
  if (days <= 0) return "Last backup: today.";
  if (days >= 7) return `Last backup: ${days} days ago. Export a new one.`;
  return `Last backup: ${days} ${days === 1 ? "day" : "days"} ago.`;
}

function updateLog(id, changes) {
  const index = db.logs.findIndex((l) => l.id === id);
  if (index === -1) throw new Error("That set no longer exists.");
  const previous = db.logs[index];
  const updated = { ...previous };
  if ("reps" in changes) updated.reps = numberOrNull(changes.reps, 1000);
  if ("weight_kg" in changes) updated.weight_kg = numberOrNull(changes.weight_kg, 1000);
  if ("duration_seconds" in changes) updated.duration_seconds = numberOrNull(changes.duration_seconds, 36000);
  if ("distance_m" in changes) updated.distance_m = numberOrNull(changes.distance_m, 100000);
  db.logs[index] = updated;
  try {
    saveDb();
  } catch {
    db.logs[index] = previous;
    throw new Error("This browser would not save the change.");
  }
  return updated;
}