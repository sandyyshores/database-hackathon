export const KLH_ROOMS_BY_CODE = {
  GROUND_FLOOR: [
    "Classroom 003",
    "Classroom 004",
    "Classroom 005",
    "Classroom 006",
    "Classroom 007"
  ],
  FIRST_FLOOR: [
    "Classroom 101",
    "Classroom 102",
    "Classroom 103",
    "Classroom 105",
    "Classroom 106",
    "Classroom 107"
  ],
  SECOND_FLOOR: [
    "Classroom 201",
    "Classroom 202",
    "Classroom 203",
    "Classroom 205",
    "Classroom 206"
  ],
  THIRD_FLOOR: [
    "Classroom 302",
    "Classroom 305",
    "Classroom 306",
    "Classroom 307"
  ],
  FOURTH_FLOOR: [
    "Classroom 401",
    "Classroom 402",
    "Classroom 403",
    "Classroom 404",
    "Classroom 405",
    "Classroom 406",
    "Classroom 407"
  ],
  LABS: [
    "Lab 008",
    "Lab 108",
    "Lab 301",
    "Lab 303",
    "Lab 01",
    "Lab 14",
    "Lab 15"
  ],
  SAC_ROOM: [
    "SAC Room — Hangout Area",
    "SAC Room — Activity Table",
    "SAC Room — Near Wall Socket"
  ],
  BOYS_COMMON: [
    "Boys Common Room — Seating Area",
    "Boys Common Room — Corner Bench"
  ],
  GIRLS_COMMON: [
    "Girls Common Room — Seating Area",
    "Girls Common Room — Side Table"
  ],
  CANTEEN: [
    "Canteen — Lunch Tables",
    "Canteen — Snack Counter",
    "Canteen — Billing Counter"
  ],
  INDOOR_SPORTS: [
    "Indoor Sports Room — Table Tennis",
    "Indoor Sports Room — Carrom & Chess",
    "Indoor Sports Room — Bench Area"
  ]
};

export const FLOOR_ORDER = [
  { code: "FOURTH_FLOOR", floorLabel: "4th Floor", rooms: ["401", "402", "403", "404", "405", "406", "407"] },
  { code: "THIRD_FLOOR", floorLabel: "3rd Floor", rooms: ["302", "305", "306", "307"] },
  { code: "SECOND_FLOOR", floorLabel: "2nd Floor", rooms: ["201", "202", "203", "205", "206"] },
  { code: "FIRST_FLOOR", floorLabel: "1st Floor", rooms: ["101", "102", "103", "105", "106", "107"] },
  { code: "GROUND_FLOOR", floorLabel: "Ground Floor", rooms: ["003", "004", "005", "006", "007"] }
];

export const LAB_CHIPS = [
  { label: "008", query: "008" },
  { label: "108", query: "108" },
  { label: "301", query: "301" },
  { label: "303", query: "303" },
  { label: "Lab 01", query: "Lab 01" },
  { label: "Lab 14", query: "Lab 14" },
  { label: "Lab 15", query: "Lab 15" }
];

export const HANGOUT_SPACES = [
  { code: "CANTEEN", subtitle: "Lunch tables & snack counter" },
  { code: "SAC_ROOM", subtitle: "Student hangout & activity room" },
  { code: "BOYS_COMMON", subtitle: "Seating & lounge area" },
  { code: "GIRLS_COMMON", subtitle: "Lounge & seating area" },
  { code: "INDOOR_SPORTS", subtitle: "TT, carrom & indoor games" }
];
