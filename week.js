/* Weekly performance analysis.
   Loaded after app.js and uses its helpers: state, el, plural, setsOf, setLabel,
   modeFor, prettyDate and CATEGORY_LABEL. */

const week = { offset: 0 }; // 0 = this week, -1 = last week, ...
const CATEGORIES = ["power", "explosive", "functional", "accessory"];

/* ---------- dates ---------- */

function isoOf(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// Weeks run Sunday to Saturday
function weekRange(offset) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() + offset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: isoOf(start), end: isoOf(end) };
}

/* ---------- calculations ---------- */

function plannedItems() {
  return Object.keys(state.plan).sort().flatMap((day) => state.plan[day]);
}

function summarizeWeek(offset) {
  const { start, end } = weekRange(offset);
  const logs = state.logs.filter((l) => l.logged_on >= start && l.logged_on <= end);

  const byExercise = new Map();
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const days = new Set();
  let sets = 0;
  let volume = 0;

  for (const log of logs) {
    const n = setsOf(log);
    days.add(log.logged_on);
    sets += n;
    if (log.exercise.category in byCategory) byCategory[log.exercise.category] += n;
    if (log.weight_kg != null && log.reps != null) volume += log.weight_kg * log.reps * n;

    if (!byExercise.has(log.exercise_id)) {
      byExercise.set(log.exercise_id, { exercise: log.exercise, logs: [], sets: 0 });
    }
    const entry = byExercise.get(log.exercise_id);
    entry.logs.push(log);
    entry.sets += n;
  }
  return { start, end, logs, days, sets, volume, byExercise, byCategory };
}

// Planned sets versus sets actually done
function adherence(summary) {
  const byCategoryPlanned = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const missing = [];
  let planned = 0;
  let done = 0;

  for (const item of plannedItems()) {
    const got = summary.byExercise.get(item.exercise.id);
    const sets = got ? got.sets : 0;
    planned += item.sets;
    done += Math.min(sets, item.sets);
    if (item.exercise.category in byCategoryPlanned) byCategoryPlanned[item.exercise.category] += item.sets;
    if (sets === 0) missing.push(item.exercise.name);
  }
  return { planned, done, missing, byCategoryPlanned };
}

// One number per set, used to compare weeks
function setScore(log, mode) {
  const w = log.weight_kg;
  const r = log.reps;
  if (mode === "time") return log.duration_seconds ?? null;
  if (mode === "distance") return w != null && w > 0 ? w : log.distance_m ?? null;
  if (w != null && w > 0 && r != null) return w * (1 + r / 30); // estimated one-rep max
  return r ?? null;
}

function bestOf(logs, mode) {
  let best = null;
  for (const log of logs) {
    const score = setScore(log, mode);
    if (score != null && (best === null || score > best.score)) best = { score, log };
  }
  return best;
}

function liftRows(current, previous, beforePrevious) {
  const order = plannedItems().map((i) => i.exercise.id);
  const rank = (id) => {
    const index = order.indexOf(id);
    return index === -1 ? order.length : index;
  };
  const ids = [...current.byExercise.keys()].sort((a, b) => rank(a) - rank(b));

  return ids.map((id) => {
    const entry = current.byExercise.get(id);
    const mode = modeFor(entry.exercise.name);
    const best = bestOf(entry.logs, mode);
    const prevEntry = previous.byExercise.get(id);
    const prevBest = prevEntry ? bestOf(prevEntry.logs, mode) : null;
    const prev2Entry = beforePrevious.byExercise.get(id);
    const prev2Best = prev2Entry ? bestOf(prev2Entry.logs, mode) : null;

    let status = "new";
    let change = 0;
    if (best && prevBest && prevBest.score > 0) {
      change = (best.score - prevBest.score) / prevBest.score;
      status = change > 0.005 ? "up" : change < -0.005 ? "down" : "same";
    }

    const earlier = state.logs
      .filter((l) => l.exercise_id === id && l.logged_on < current.start)
      .map((l) => setScore(l, mode))
      .filter((s) => s != null);
    const isBest = Boolean(best) && earlier.length > 0 && best.score > Math.max(...earlier);
    const stalled =
      Boolean(best && prevBest && prev2Best) &&
      best.score <= prevBest.score * 1.005 &&
      prevBest.score <= prev2Best.score * 1.005;

    return { exercise: entry.exercise, sets: entry.sets, best, status, change, isBest, stalled };
  });
}

function verdictText(adh, rows) {
  const pct = adh.planned ? adh.done / adh.planned : 0;
  const up = rows.filter((r) => r.status === "up").length;
  const down = rows.filter((r) => r.status === "down").length;
  const compared = rows.filter((r) => r.status !== "new").length;

  if (pct < 0.7) {
    return "You completed under 70% of the planned sets. Check whether the schedule fits your week before adding anything.";
  }
  if (compared === 0) {
    return "There is no earlier week to compare with yet. From next week, this summary will show what went up or down.";
  }
  if (down >= 3 || (down >= 2 && down > up)) {
    return `${down} lifts went down compared with last week. That often points to recovery (sleep, food, hard rolling), so consider a lighter week before pushing harder.`;
  }
  if (up >= 2 && up >= down) {
    return `Solid week: ${up} lifts improved. Add weight only when every rep is clean and fast.`;
  }
  return "A steady week. Nothing dropped much and nothing jumped. Keep the same weights, and add a rep or a small jump on the lifts that felt easy.";
}

/* ---------- display ---------- */

function stat(label, value, note) {
  const box = el(
    "div",
    { className: "stat" },
    el("p", { className: "stat-label", textContent: label }),
    el("p", { className: "stat-value", textContent: value })
  );
  if (note) box.append(el("p", { className: "stat-note", textContent: note }));
  return box;
}

function percentText(change) {
  return `${change > 0 ? "+" : ""}${(change * 100).toFixed(1)}%`;
}

function badgesFor(row) {
  const box = el("div", { className: "badges" });
  if (row.status === "up") box.append(el("span", { className: "badge up", textContent: `▲ ${percentText(row.change)}` }));
  else if (row.status === "down") box.append(el("span", { className: "badge down", textContent: `▼ ${percentText(row.change)}` }));
  else if (row.status === "same") box.append(el("span", { className: "badge flat", textContent: "= same as last week" }));
  else box.append(el("span", { className: "badge flat", textContent: "no data last week" }));
  if (row.isBest) box.append(el("span", { className: "badge best", textContent: "New best" }));
  if (row.stalled) box.append(el("span", { className: "badge warn", textContent: "Stalled 3 weeks" }));
  return box;
}

function renderWeek() {
  const box = document.getElementById("view-week");
  if (!box) return;
  box.replaceChildren();

  const current = summarizeWeek(week.offset);
  const previous = summarizeWeek(week.offset - 1);
  const beforePrevious = summarizeWeek(week.offset - 2);
  const adh = adherence(current);

  // Week navigation
  const prevBtn = el("button", { type: "button", className: "link", textContent: "‹ Earlier" });
  const nextBtn = el("button", { type: "button", className: "link", textContent: "Later ›" });
  nextBtn.disabled = week.offset >= 0;
  prevBtn.addEventListener("click", () => { week.offset -= 1; renderWeek(); });
  nextBtn.addEventListener("click", () => { week.offset += 1; renderWeek(); });
  const label = `${prettyDate(current.start)} – ${prettyDate(current.end)}${week.offset === 0 ? " (this week)" : ""}`;
  box.append(
    el("div", { className: "week-nav" }, prevBtn, el("span", { className: "week-label", textContent: label }), nextBtn)
  );

  if (current.sets === 0) {
    box.append(el("p", { className: "empty", textContent: "No sets logged in this week." }));
    return;
  }

  // Summary numbers
  const pct = adh.planned ? Math.round((adh.done / adh.planned) * 100) : 0;
  const extra = current.sets - adh.done;
  const volumeChange = previous.volume > 0 ? (current.volume - previous.volume) / previous.volume : null;
  const volumeNote = volumeChange === null ? "no data last week" : `${percentText(volumeChange)} vs last week`;

  box.append(
    el(
      "div",
      { className: "stats" },
      stat("Training days", `${current.days.size} of ${SCHEDULE.length}`, "days with logged sets"),
      stat("Planned sets done", `${adh.done} of ${adh.planned}`, `${pct}% of the plan`),
      stat("Volume", `${Math.round(current.volume).toLocaleString()} kg`, volumeNote),
      stat("Total sets", String(current.sets), extra > 0 ? `${extra} extra or off-plan` : "all within the plan")
    )
  );

  const rows = liftRows(current, previous, beforePrevious);
  box.append(el("p", { className: "verdict", textContent: verdictText(adh, rows) }));

  // Category balance
  box.append(el("h2", { className: "week-h", textContent: "Training balance" }));
  const bars = el("div", { className: "bars" });
  for (const category of CATEGORIES) {
    const planned = adh.byCategoryPlanned[category];
    const done = current.byCategory[category];
    const width = planned ? Math.min(100, Math.round((done / planned) * 100)) : done > 0 ? 100 : 0;
    const fill = el("div", { className: "bar-fill" });
    fill.style.width = `${width}%`;
    bars.append(
      el(
        "div",
        { className: `bar-row cat-${category}` },
        el(
          "div",
          { className: "bar-head" },
          el("span", { textContent: CATEGORY_LABEL[category] }),
          el("span", { textContent: `${done} / ${planned} sets` })
        ),
        el("div", { className: "bar-track" }, fill)
      )
    );
  }
  box.append(bars);

  // Lifts
  box.append(el("h2", { className: "week-h", textContent: "Your lifts" }));
  const list = el("div", { className: "sheet" });
  for (const row of rows) {
    const detail = row.best
      ? `${plural(row.sets, "set")} · best ${setLabel(row.best.log)}`
      : plural(row.sets, "set");
    list.append(
      el(
        "article",
        { className: `row cat-${row.exercise.category}` },
        el(
          "div",
          { className: "row-head" },
          el(
            "div",
            {},
            el("h3", { textContent: row.exercise.name }),
            el("p", { className: "cat", textContent: detail })
          ),
          badgesFor(row)
        )
      )
    );
  }
  box.append(list);

  // Notes
  const stalled = rows.filter((r) => r.stalled).map((r) => r.exercise.name);
  if (stalled.length > 0) {
    box.append(
      el("p", {
        className: "week-note",
        textContent: `Stalled for three weeks: ${stalled.join(", ")}. If you feel recovered, add one set or the smallest weight jump. If you feel tired, keep the weight and rest more.`,
      })
    );
  }
  if (adh.missing.length > 0) {
    box.append(el("p", { className: "week-note", textContent: `Not logged this week: ${adh.missing.join(", ")}.` }));
  }
  box.append(
    el("p", {
      className: "week-note",
      textContent:
        "Progress compares your best set each week (an estimated one-rep max for weighted lifts). Volume is weight × reps and leaves out bodyweight work.",
    })
  );
}