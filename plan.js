// Your training plan. To change it, edit this file and upload the site again.
// Day 1 = Monday (lower body), Day 2 = Tuesday (upper body), Day 3 = Wednesday (balance and stability)
// Each line is: [name, category, muscle group, sets, reps]
const PLAN = {
  "1": [
    ["Conventional deadlift", "power", "posterior chain", 3, "5"],
    ["Squat", "power", "legs", 3, "10"],
    ["Bulgarian split squat", "power", "legs", 2, "8 per leg"],
    ["Leg curl", "accessory", "hamstrings", 3, "12"],
    ["Standing calf raises", "accessory", "calves", 3, "15"],
    ["Dead bug", "functional", "core", 3, "10 per side"],
  ],
  "2": [
    ["Barbell bench press", "power", "chest", 3, "6-8"],
    ["Chest fly machine", "accessory", "chest", 2, "12"],
    ["Lat pulldown", "power", "back", 3, "8-12"],
    ["Single-arm landmine row", "power", "back", 3, "8 per side"],
    ["Dumbbell bicep curls", "accessory", "biceps", 3, "10-12"],
    ["Hammer curls", "accessory", "biceps", 2, "10-12"],
    ["Triceps pushdowns", "accessory", "triceps", 2, "10-12"],
  ],
  "3": [
    ["Single-leg Romanian deadlift", "functional", "hamstrings", 2, "8 per leg"],
    ["Step-ups", "functional", "legs", 2, "10 per leg"],
    ["Lateral lunges", "functional", "legs", 2, "8 per side"],
    ["Glute bridge", "accessory", "glutes", 2, "12"],
    ["Side plank", "functional", "core", 2, "30 s per side"],
    ["Bird dog", "functional", "core", 2, "10 per side"],
    ["Stationary bike (easy)", "functional", "conditioning", 1, "8-12 min"],
  ],
};

// A stable id made from the exercise name. Renaming an exercise starts a new history for it.
function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}