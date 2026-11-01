const state = {
  plan: {},
  logs: [],            // newest first
  day: "1",
  view: "today",
  open: new Set(),      // finished exercises the person has expanded
  extra: new Set(),     // finished exercises where an extra set is being entered
  openDates: new Set(), // History folders that are open
  dirty: false,         // a set was edited, so Today needs a refresh
};

// Which weekday each plan day is trained on (0 = Sunday ... 6 = Saturday)
const SCHEDULE = [
  { day: "1", name: "Monday", weekday: 1 },
  { day: "2", name: "Tuesday", weekday: 2 },
  { day: "3", name: "Wednesday", weekday: 3 },
];

// Rest between sets, in seconds. Change these to suit you.
const REST_SECONDS = { power: 180, explosive: 120, functional: 90, accessory: 60 };
// Short rest after the last set of an exercise, before the next one.
const BETWEEN_EXERCISES = 60;

const CATEGORY_LABEL = {
  power: "Power",
  explosive: "Explosive",
  functional: "Functional",
  accessory: "Accessory",
};

/* ---------- helpers ---------- */

// Builds elements without innerHTML
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short",
  });
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function dayName(day) {
  const entry = SCHEDULE.find((s) => s.day === day);
  return entry ? entry.name : `Day ${day}`;
}

// Today's workout, or the next training day if today is a rest day
function suggestedDay() {
  const today = new Date().getDay();
  for (let offset = 0; offset < 7; offset++) {
    const entry = SCHEDULE.find((s) => s.weekday === (today + offset) % 7);
    if (entry) return entry.day;
  }
  return "1";
}

// Which fields an exercise needs
function modeFor(name) {
  const n = name.toLowerCase();
  if (n.includes("hang") || n.includes("plank") || n.includes("bike")) return "time";
  if (n.includes("carry") || n.includes("sled")) return "distance";
  return "reps";
}

// Cardio is entered in minutes; other timed exercises in seconds
function usesMinutes(name) {
  return name.toLowerCase().includes("bike");
}

function toNumber(value) {
  return value === "" ? null : Number(value);
}

function durationText(seconds) {
  if (seconds >= 120) return `${Math.round((seconds / 60) * 10) / 10} min`;
  return `${seconds} s`;
}

// Older entries may hold several sets in one record
function setsOf(log) {
  return log.sets || 1;
}

function setLabel(log) {
  const parts = [];
  if (log.reps != null && log.weight_kg != null) parts.push(`${log.weight_kg} kg × ${log.reps}`);
  else if (log.reps != null) parts.push(`${log.reps} reps`);
  else if (log.weight_kg != null) parts.push(`${log.weight_kg} kg`);
  if (log.duration_seconds != null) parts.push(durationText(log.duration_seconds));
  if (log.distance_m != null) parts.push(`${log.distance_m} m`);
  const text = parts.join(", ");
  return setsOf(log) > 1 ? `${setsOf(log)} sets: ${text}` : text;
}

function todaysLogs(exerciseId) {
  const today = todayStr();
  return state.logs
    .filter((l) => l.exercise_id === exerciseId && l.logged_on === today)
    .sort((a, b) => a.id - b.id);
}

function setsDone(exerciseId) {
  return todaysLogs(exerciseId).reduce((sum, l) => sum + setsOf(l), 0);
}

function isComplete(item) {
  return setsDone(item.exercise.id) >= item.sets;
}

function lastWeight(exerciseId) {
  const log = state.logs.find((l) => l.exercise_id === exerciseId && l.weight_kg != null);
  return log ? log.weight_kg : null;
}

function nextIncomplete(item) {
  const items = state.plan[state.day] || [];
  const index = items.findIndex((i) => i.exercise.id === item.exercise.id);
  return items.slice(index + 1).find((i) => !isComplete(i)) || null;
}

/* ---------- header and belt ---------- */

function initBelt() {
  const belt = document.getElementById("belt");
  belt.append(el("div", { className: "belt-cloth" }), el("div", { className: "belt-bar" }));
}

function updateBelt(done, total) {
  const belt = document.getElementById("belt");
  const bar = belt.querySelector(".belt-bar");
  while (bar.children.length < total) bar.append(el("span", { className: "stripe" }));
  while (bar.children.length > total) bar.lastChild.remove();
  [...bar.children].forEach((stripe, i) => stripe.classList.toggle("on", i < done));
  belt.setAttribute("aria-label", `${done} of ${total} exercises done`);
}

function renderHeader() {
  const title = document.getElementById("day-title");
  const belt = document.getElementById("belt");
  const progress = document.getElementById("progress");
  const days = document.getElementById("days");

  const onToday = state.view === "today";
  belt.hidden = !onToday;
  progress.hidden = !onToday;
  days.hidden = !onToday;

  if (!onToday) {
    title.textContent = state.view === "week" ? "Week" : "History";
    return;
  }

  title.textContent = dayName(state.day);
  const items = state.plan[state.day] || [];
  const doneExercises = items.filter(isComplete).length;
  const totalSets = items.reduce((sum, i) => sum + i.sets, 0);
  const doneSets = items.reduce((sum, i) => sum + Math.min(setsDone(i.exercise.id), i.sets), 0);
  updateBelt(doneExercises, items.length);
  progress.textContent =
    items.length > 0 && doneExercises === items.length
      ? "Session complete"
      : `${doneExercises} of ${items.length} exercises · ${doneSets} of ${totalSets} sets`;
}

function renderDays() {
  const nav = document.getElementById("days");
  nav.replaceChildren();
  for (const day of Object.keys(state.plan)) {
    const btn = el("button", { type: "button", textContent: dayName(day) });
    if (day === state.day) btn.setAttribute("aria-current", "true");
    btn.addEventListener("click", () => {
      state.day = day;
      state.open.clear();
      state.extra.clear();
      renderDays();
      renderToday();
      renderHeader();
      window.scrollTo(0, 0);
    });
    nav.append(btn);
  }
}

/* ---------- today view ---------- */

function field(label, name, placeholder, step, value) {
  const input = el("input", {
    type: "number",
    name,
    placeholder,
    step,
    min: "0",
    value: value ?? "",
    inputMode: "decimal",
  });
  return el("label", { className: "field" }, label, input);
}

function renderToday() {
  const sheet = document.getElementById("sheet");
  sheet.replaceChildren();
  const items = state.plan[state.day] || [];
  if (items.length === 0) {
    sheet.append(
      el("p", { className: "empty", textContent: "No exercises for this day. Check plan.js." })
    );
    return;
  }
  for (const item of items) sheet.append(renderCard(item));
}

// Finished exercise, collapsed to one line
function buildCollapsed(item, done) {
  const ex = item.exercise;
  const openBtn = el("button", { type: "button", className: "link", textContent: "Open" });
  const summary = done === item.sets ? `All ${item.sets} sets done` : `${plural(done, "set")} done`;
  const row = el(
    "article",
    { className: `row done cat-${ex.category}` },
    el(
      "div",
      {},
      el("h3", { textContent: ex.name }),
      el("p", { className: "cat", textContent: summary })
    ),
    openBtn
  );
  openBtn.addEventListener("click", () => {
    state.open.add(ex.id);
    row.replaceWith(renderCard(item));
  });
  return row;
}

function renderCard(item) {
  const ex = item.exercise;
  const logs = todaysLogs(ex.id);
  const done = setsDone(ex.id);
  const complete = done >= item.sets;

  if (complete && !state.open.has(ex.id)) return buildCollapsed(item, done);

  const card = el("article", { className: `row cat-${ex.category}` });
  card.append(
    el(
      "div",
      { className: "row-head" },
      el(
        "div",
        {},
        el("h3", { textContent: ex.name }),
        el("p", { className: "cat", textContent: CATEGORY_LABEL[ex.category] || ex.category })
      ),
      el("p", { className: "target", textContent: `${item.sets} × ${item.reps}` })
    )
  );

  const list = el("div", { className: "sets" });
  let run = 0;
  for (const log of logs) {
    const first = run + 1;
    run += setsOf(log);
    list.append(buildSaved(item, log, first, run, card));
  }

  // The input row shows while sets remain, or when an extra set was requested
  if (!complete || state.extra.has(ex.id)) {
    list.append(buildActive(item, logs, done, complete, card));
  }
  for (let n = done + 2; n <= item.sets; n++) {
    list.append(
      el(
        "div",
        { className: "set pending" },
        el("span", { textContent: `Set ${n}` }),
        el("span", { textContent: `aim ${item.reps}` })
      )
    );
  }
  card.append(list);

  if (complete) {
    const actions = el("div", { className: "actions" });
    if (!state.extra.has(ex.id)) {
      const addBtn = el("button", { type: "button", className: "link", textContent: "Add extra set" });
      addBtn.addEventListener("click", () => {
        state.extra.add(ex.id);
        card.replaceWith(renderCard(item));
      });
      actions.append(addBtn);
    }
    const closeBtn = el("button", { type: "button", className: "link", textContent: "Close" });
    closeBtn.addEventListener("click", () => {
      state.open.delete(ex.id);
      state.extra.delete(ex.id);
      card.replaceWith(renderCard(item));
    });
    actions.append(closeBtn);
    card.append(actions);
  }
  return card;
}

// A saved set on the Today tab, with an Edit button
function buildSaved(item, log, first, last, card) {
  const label = first === last ? `Set ${first}` : `Sets ${first}-${last}`;
  const editBtn = el("button", { type: "button", className: "link", textContent: "Edit" });
  const row = el(
    "div",
    { className: "set saved" },
    el("span", { className: "set-name", textContent: label }),
    el("span", { className: "set-text", textContent: setLabel(log) }),
    editBtn
  );

  editBtn.addEventListener("click", () => {
    row.replaceWith(
      buildEditor(log, label, () => {
        card.replaceWith(renderCard(item));
        renderHeader();
      })
    );
  });
  return row;
}

// Form for correcting or deleting a saved set (used on Today and in History)
function buildEditor(log, label, onClose) {
  const name = log.exercise.name;
  const mode = modeFor(name);
  const inputs = el("div", { className: "inputs" });
  if (mode === "reps") {
    inputs.append(
      field("Reps", "reps", "", "1", log.reps ?? ""),
      field("Weight (kg)", "weight_kg", "kg", "0.5", log.weight_kg ?? "")
    );
  } else if (mode === "time") {
    if (usesMinutes(name)) {
      inputs.append(
        field("Minutes", "minutes", "", "1", log.duration_seconds != null ? log.duration_seconds / 60 : "")
      );
    } else {
      inputs.append(field("Seconds", "duration_seconds", "", "1", log.duration_seconds ?? ""));
    }
  } else {
    inputs.append(
      field("Distance (m)", "distance_m", "", "1", log.distance_m ?? ""),
      field("Weight (kg)", "weight_kg", "kg", "0.5", log.weight_kg ?? "")
    );
  }

  const saveBtn = el("button", { type: "button", className: "save", textContent: "Save changes" });
  const cancelBtn = el("button", { type: "button", className: "link", textContent: "Cancel" });
  const deleteBtn = el("button", { type: "button", className: "link danger", textContent: "Delete set" });
  const error = el("p", { className: "error" });
  error.setAttribute("role", "alert");

  cancelBtn.addEventListener("click", onClose);

  saveBtn.addEventListener("click", () => {
    const changes = {};
    for (const input of inputs.querySelectorAll("input")) {
      changes[input.name] = toNumber(input.value);
    }
    if ("minutes" in changes) {
      changes.duration_seconds = changes.minutes != null ? Math.round(changes.minutes * 60) : null;
      delete changes.minutes;
    }
    if (Object.values(changes).every((v) => v == null)) {
      error.textContent = "Enter at least one value, or delete the set.";
      return;
    }
    try {
      updateLog(log.id, changes);
      state.logs = getLogs();
      state.dirty = true;
      onClose();
    } catch (err) {
      error.textContent = `Could not save: ${err.message}`;
    }
  });

  deleteBtn.addEventListener("click", () => {
    if (!confirm(`Delete ${label.toLowerCase()} of ${name}?`)) return;
    try {
      deleteLog(log.id);
      state.logs = getLogs();
      state.dirty = true;
      hideRest();
      onClose();
    } catch (err) {
      error.textContent = `Could not delete: ${err.message}`;
    }
  });

  return el(
    "div",
    { className: "set editing" },
    el("p", { className: "set-title", textContent: `Editing ${label.toLowerCase()}` }),
    inputs,
    el("div", { className: "editor-actions" }, saveBtn, cancelBtn, deleteBtn),
    error
  );
}

function buildActive(item, logs, done, complete, card) {
  const ex = item.exercise;
  const mode = modeFor(ex.name);
  const prev = logs[logs.length - 1];
  const weight = lastWeight(ex.id);
  const title = complete ? "Extra set" : `Set ${done + 1} of ${item.sets}`;

  const inputs = el("div", { className: "inputs" });
  if (mode === "reps") {
    inputs.append(
      field("Reps", "reps", item.reps, "1", prev?.reps ?? ""),
      field("Weight (kg)", "weight_kg", "kg", "0.5", weight)
    );
  } else if (mode === "time") {
    if (usesMinutes(ex.name)) {
      inputs.append(
        field("Minutes", "minutes", item.reps, "1", prev?.duration_seconds != null ? prev.duration_seconds / 60 : "")
      );
    } else {
      inputs.append(field("Seconds", "duration_seconds", item.reps, "1", prev?.duration_seconds ?? ""));
    }
  } else {
    inputs.append(
      field("Distance (m)", "distance_m", "30", "1", prev?.distance_m ?? ""),
      field("Weight (kg)", "weight_kg", "kg", "0.5", weight)
    );
  }

  const saveBtn = el("button", { type: "button", className: "save", textContent: "Set done" });
  const error = el("p", { className: "error" });
  error.setAttribute("role", "alert");

  const row = el(
    "div",
    { className: "set active" },
    el("p", { className: "set-title", textContent: title }),
    inputs,
    saveBtn,
    error
  );

  saveBtn.addEventListener("click", () => {
    unlockAlerts(); // allows sound, notifications and keeps the screen on

    const body = {
      exercise: { id: ex.id, name: ex.name, category: ex.category },
      sets: 1,
      logged_on: todayStr(),
    };
    for (const input of inputs.querySelectorAll("input")) {
      body[input.name] = toNumber(input.value);
    }
    if ("minutes" in body) {
      if (body.minutes != null) body.duration_seconds = Math.round(body.minutes * 60);
      delete body.minutes;
    }
    const hasData = ["reps", "weight_kg", "duration_seconds", "distance_m"].some((k) => body[k] != null);
    if (!hasData) {
      error.textContent = "Enter reps, weight, time, or distance before saving.";
      return;
    }

    error.textContent = "";
    try {
      const log = addLog(body);
      state.logs.unshift(log);
      state.extra.delete(ex.id);
      renderHeader();
      const fresh = renderCard(item);
      card.replaceWith(fresh);
      afterSet(item, setsDone(ex.id), fresh, complete);
    } catch (err) {
      error.textContent = `Could not save: ${err.message}`;
    }
  });

  return row;
}

// Starts the right rest timer after a set is saved
function afterSet(item, nowDone, card, wasExtra) {
  const ex = item.exercise;
  const restSeconds = REST_SECONDS[ex.category] || 60;

  if (wasExtra) {
    startRest(restSeconds, "Rest · extra set saved");
    return;
  }
  if (nowDone < item.sets) {
    startRest(restSeconds, `Rest · next: set ${nowDone + 1} of ${item.sets}`);
    return;
  }
  const next = nextIncomplete(item);
  if (next) {
    startRest(BETWEEN_EXERCISES, `Rest · next: ${next.exercise.name}`);
    scrollToNext(card);
  } else {
    hideRest();
  }
}

function scrollToNext(card) {
  let next = card.nextElementSibling;
  while (next && next.classList.contains("done")) next = next.nextElementSibling;
  if (next) next.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
}

/* ---------- rest timer and alarm ---------- */

const ALARM_SOUND = true;        // set to false to turn the beeps off
const KEEP_SCREEN_AWAKE = true;  // keeps the screen on while you use the app

const rest = { endAt: 0, timer: null, hideTimer: null, label: "Rest", finished: true };
const baseTitle = document.title;
let audioCtx = null;
let wakeLock = null;
let wantAwake = false;

async function keepAwake() {
  if (!("wakeLock" in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch {
    wakeLock = null;
  }
}

// Browsers only allow sound and notifications after a tap, so this runs on "Set done"
function unlockAlerts() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
    }
  } catch { /* audio unavailable */ }
  if ("Notification" in window && window.isSecureContext && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
  if (KEEP_SCREEN_AWAKE) {
    wantAwake = true;
    keepAwake();
  }
}

function beep(offset, duration, frequency) {
  const start = audioCtx.currentTime + offset;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function playAlarm() {
  if (!ALARM_SOUND || !audioCtx) return;
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    beep(0, 0.25, 880);
    beep(0.35, 0.25, 880);
    beep(0.7, 0.45, 1175);
  } catch { /* ignore */ }
}

function notifyRestOver() {
  if (!("Notification" in window) || !window.isSecureContext) return;
  if (Notification.permission !== "granted" || !document.hidden) return;
  try {
    new Notification("Rest over", { body: rest.label.replace("Rest · ", ""), tag: "rest-over" });
  } catch { /* ignore */ }
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function startRest(seconds, label) {
  rest.endAt = Date.now() + seconds * 1000;
  rest.label = label;
  runRest();
}

function runRest() {
  clearInterval(rest.timer);
  clearTimeout(rest.hideTimer);
  rest.finished = false;
  const box = document.getElementById("rest");
  box.hidden = false;
  box.classList.remove("over");
  document.getElementById("rest-label").textContent = rest.label;
  tickRest();
  rest.timer = setInterval(tickRest, 250);
}

function tickRest() {
  if (rest.finished) return;
  const left = Math.max(0, Math.ceil((rest.endAt - Date.now()) / 1000));
  document.getElementById("rest-time").textContent = formatTime(left);

  if (left > 0) {
    document.title = `${formatTime(left)} rest`;
    return;
  }

  rest.finished = true;
  clearInterval(rest.timer);
  document.getElementById("rest").classList.add("over");
  document.getElementById("rest-label").textContent = "Rest over. Go!";
  document.title = "Rest over!";
  playAlarm();
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  notifyRestOver();
  rest.hideTimer = setTimeout(hideRest, 8000);
}

function hideRest() {
  clearInterval(rest.timer);
  clearTimeout(rest.hideTimer);
  rest.finished = true;
  rest.endAt = 0;
  document.title = baseTitle;
  const box = document.getElementById("rest");
  box.hidden = true;
  box.classList.remove("over");
}

// When the page becomes visible again: alert if the rest ended meanwhile, and re-request the screen lock
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (rest.endAt && !rest.finished) tickRest();
  if (wantAwake) keepAwake();
});

document.getElementById("rest-add").addEventListener("click", () => {
  rest.endAt = Math.max(Date.now(), rest.endAt) + 30000;
  runRest();
});
document.getElementById("rest-skip").addEventListener("click", hideRest);

/* ---------- history view: backup and one folder per day ---------- */

function buildBackupBar() {
  const note = el("p", { className: "week-note", textContent: backupStatus() });
  const exportBtn = el("button", { type: "button", className: "link", textContent: "Export backup" });
  const importBtn = el("button", { type: "button", className: "link", textContent: "Import backup" });
  const fileInput = el("input", { type: "file", accept: ".json,application/json", hidden: true });

  exportBtn.addEventListener("click", () => {
    exportBackup();
    note.textContent = backupStatus();
  });
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    if (!confirm("Importing replaces all history on this phone with the contents of the file. Continue?")) return;
    try {
      const count = importBackup(await file.text());
      state.logs = getLogs();
      state.dirty = true;
      renderHistory();
      document.querySelector("#view-history .week-note").textContent = `Imported ${plural(count, "set")}.`;
    } catch (err) {
      note.textContent = err.message;
    }
  });

  return el("div", { className: "backup-bar" }, exportBtn, importBtn, fileInput, note);
}

// A saved set in History, with an Edit button
function buildHistorySet(log, first, last) {
  const label = first === last ? `Set ${first}` : `Sets ${first}-${last}`;
  const editBtn = el("button", { type: "button", className: "link", textContent: "Edit" });
  const row = el(
    "div",
    { className: "set saved" },
    el("span", { className: "set-name", textContent: label }),
    el("span", { className: "set-text", textContent: setLabel(log) }),
    editBtn
  );
  editBtn.addEventListener("click", () => {
    row.replaceWith(buildEditor(log, label, () => renderHistory()));
  });
  return row;
}

function renderHistory() {
  const box = document.getElementById("view-history");
  box.replaceChildren();
  box.append(buildBackupBar());

  if (state.logs.length === 0) {
    box.append(
      el("p", {
        className: "empty",
        textContent: "No sessions logged yet. Save a set on the Today tab and it shows up here.",
      })
    );
    return;
  }

  // date -> exercise -> logs
  const byDate = new Map();
  for (const log of state.logs) {
    if (!byDate.has(log.logged_on)) byDate.set(log.logged_on, new Map());
    const exercises = byDate.get(log.logged_on);
    if (!exercises.has(log.exercise_id)) exercises.set(log.exercise_id, []);
    exercises.get(log.exercise_id).push(log);
  }

  for (const [date, exercises] of byDate) {
    // Exercises in the order they were trained
    const groups = [...exercises.values()]
      .map((logs) => [...logs].sort((a, b) => a.id - b.id))
      .sort((a, b) => a[0].id - b[0].id);

    const sheet = el("div", { className: "sheet" });
    let totalSets = 0;
    for (const ordered of groups) {
      const ex = ordered[0].exercise;
      totalSets += ordered.reduce((sum, l) => sum + setsOf(l), 0);

      const list = el("div", { className: "sets" });
      let run = 0;
      for (const log of ordered) {
        const first = run + 1;
        run += setsOf(log);
        list.append(buildHistorySet(log, first, run));
      }
      sheet.append(
        el("article", { className: `row cat-${ex.category}` }, el("h3", { textContent: ex.name }), list)
      );
    }

    const summary = el(
      "summary",
      {},
      el("span", { className: "folder-name", textContent: prettyDate(date) }),
      el("span", {
        className: "folder-meta",
        textContent: `${plural(groups.length, "exercise")} · ${plural(totalSets, "set")}`,
      })
    );
    const folder = el("details", { className: "folder" }, summary, sheet);
    folder.open = state.openDates.has(date);
    folder.addEventListener("toggle", () => {
      if (folder.open) state.openDates.add(date);
      else state.openDates.delete(date);
    });
    box.append(folder);
  }
}

/* ---------- tabs and startup ---------- */

function setView(view) {
  state.view = view;
  for (const name of ["today", "history", "week"]) {
    const section = document.getElementById(`view-${name}`);
    if (section) section.hidden = name !== view;
    const btn = document.getElementById(`tab-${name}`);
    if (btn) {
      if (name === view) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    }
  }
  if (view === "today" && state.dirty) {
    renderToday();
    state.dirty = false;
  }
  if (view === "history") renderHistory();
  if (view === "week" && typeof renderWeek === "function") renderWeek();
  renderHeader();
  window.scrollTo(0, 0);
}

document.getElementById("tab-today").addEventListener("click", () => setView("today"));
document.getElementById("tab-history").addEventListener("click", () => setView("history"));
const weekTab = document.getElementById("tab-week");
if (weekTab) weekTab.addEventListener("click", () => setView("week"));

function load() {
  document.getElementById("today-date").textContent = prettyDate(todayStr());
  initBelt();
  try {
    state.plan = getPlan();
    state.logs = getLogs();
    const days = Object.keys(state.plan);
    const suggested = suggestedDay();
    state.day = days.includes(suggested) ? suggested : days[0] || "1";
    renderDays();
    renderToday();
    renderHeader();
  } catch (err) {
    document.getElementById("sheet").replaceChildren(
      el("p", { className: "empty", textContent: `Could not load the app. (${err.message})` })
    );
  }
}

/* ---------- theme ---------- */

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#18202B" : "#1E4FA3");
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.textContent = theme === "dark" ? "☀ Light" : "☾ Dark";
  btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

const themeBtn = document.getElementById("theme-toggle");
if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("tt-theme", next); } catch { /* storage unavailable */ }
  });
}

applyTheme(currentTheme());

load();