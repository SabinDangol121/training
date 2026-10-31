// Your training plan. To change it, edit this file and upload the site again.
// Day 1 = Sunday (heavy), Day 2 = Tuesday (light), Day 3 = Wednesday (hinge and pull)
// Each line is: [name, category, muscle group, sets, reps]
const PLAN = {
  "1": [
    ["Box jumps", "explosive", "legs", 3, "4"],
    ["Med ball slams", "explosive", "full body", 3, "6"],
    ["Back squat", "power", "legs", 3, "3-5"],
    ["Weighted pull-up", "power", "back", 3, "4-6"],
    ["Overhead press", "power", "shoulders", 3, "4-6"],
    ["Bulgarian split squat", "power", "legs", 3, "6-8 per leg"],
    ["Sled push", "functional", "legs", 3, "20-30 m"],
    ["Hanging leg raises", "accessory", "core", 3, "8-12"],
  ],
  "2": [
    ["Broad jumps", "explosive", "legs", 3, "4"],
    ["Med ball rotational throw", "explosive", "core", 3, "5 per side"],
    ["Turkish get-up", "functional", "full body", 3, "3 per side"],
    ["Sandbag carry", "functional", "full body", 3, "30 m"],
    ["Landmine rotations", "accessory", "core", 3, "10 per side"],
  ],
  "3": [
    ["Kettlebell swings", "explosive", "hips", 3, "8"],
    ["Barbell deadlift", "power", "back", 3, "3-5"],
    ["Barbell row", "power", "back", 3, "5-6"],
    ["Pallof press", "functional", "core", 3, "10 per side"],
    ["Face pulls", "accessory", "shoulders", 3, "12-15"],
    ["Neck work", "accessory", "neck", 3, "15"],
  ],
};

// A stable id made from the exercise name. Renaming an exercise starts a new history for it.
function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}