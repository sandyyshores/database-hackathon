const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const DATA_DIR = path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "notifications_store.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore() {
  if (!fs.existsSync(STORE_FILE)) {
    const initial = {
      notifications: [
        {
          id: "ntf_100",
          userId: 1,
          kind: "approved",
          title: "Pickup Pass Ready: KLH-4920",
          body: "Your CSE DBMS Practical Record Book (Roll 2520030330) is ready at Lab Assistant Counter.",
          linkTab: "activity",
          read: false,
          createdAt: "2026-10-29T11:30:00.000Z"
        },
        {
          id: "ntf_101",
          userId: 1,
          kind: "match",
          title: "Classmate spotted your Logitech mouse",
          body: "Pranav Chowdary noted it was handed to the Lab 108 assistant after the 4 PM batch.",
          linkTab: "activity",
          read: false,
          createdAt: "2026-10-29T10:30:00.000Z"
        },
        {
          id: "ntf_102",
          userId: 2,
          kind: "claim",
          title: "Your claim CLM-2041 is with the SAC Desk",
          body: "Campus Helpdesk is reviewing your ownership details for the earbuds case found in SAC Room.",
          linkTab: "activity",
          read: false,
          createdAt: "2026-10-28T13:15:00.000Z"
        },
        {
          id: "ntf_103",
          userId: 5,
          kind: "desk",
          title: "1 ownership claim awaiting desk check",
          body: "Ganesh Guntu submitted identifying details for KLH-F104 at SAC Room.",
          linkTab: "desk",
          read: false,
          createdAt: "2026-10-28T13:16:00.000Z"
        }
      ],
      pickupPasses: {
        "KLH-8814": {
          pickupCode: "KLH-8814",
          claimCode: "CLM-1988",
          itemTitle: "Slim Tan Leather Cardholder Wallet",
          pickupDesk: "Indoor Sports Desk",
          status: "reunited",
          issuedAt: "2026-10-27T10:00:00.000Z"
        }
      },
      activityFeed: [
        {
          id: "act_1",
          summary: "Tan Leather Cardholder reunited at Indoor Sports Desk",
          place: "Indoor Sports Room",
          when: "2 days ago"
        },
        {
          id: "act_2",
          summary: "Casio ClassWiz Calculator matched with Classroom 203 report",
          place: "Classroom 203",
          when: "Yesterday"
        },
        {
          id: "act_3",
          summary: "Navy Steel Water Flask turned in safely after lunch hour",
          place: "Canteen",
          when: "Yesterday"
        }
      ]
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch (err) {
    return { notifications: [], pickupPasses: {}, activityFeed: [] };
  }
}

function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function pushNotification(store, userId, kind, title, body, linkTab) {
  if (!userId) return;
  store.notifications.unshift({
    id: `ntf_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`,
    userId: Number(userId),
    kind,
    title,
    body,
    linkTab: linkTab || "browse",
    read: false,
    createdAt: new Date().toISOString()
  });
  store.notifications = store.notifications.slice(0, 120);
}

app.get("/notify-api/health", (_req, res) => {
  res.json({ status: "ok", service: "klh-campus-updates" });
});

app.get("/notify-api/notifications", (req, res) => {
  const userId = Number(req.query.userId || 0);
  const store = loadStore();
  const list = userId
    ? store.notifications.filter((n) => Number(n.userId) === userId)
    : [];
  res.json({
    unreadCount: list.filter((n) => !n.read).length,
    items: list.slice(0, 25)
  });
});

app.post("/notify-api/notifications/read-all", (req, res) => {
  const userId = Number(req.body.userId || 0);
  const store = loadStore();
  store.notifications.forEach((n) => {
    if (Number(n.userId) === userId) {
      n.read = true;
    }
  });
  saveStore(store);
  res.json({ updated: true });
});

app.get("/notify-api/feed", (_req, res) => {
  const store = loadStore();
  res.json(store.activityFeed.slice(0, 8));
});

app.get("/notify-api/pickup-pass/:code", (req, res) => {
  const store = loadStore();
  const pass = store.pickupPasses[req.params.code];
  if (!pass) {
    return res.status(404).json({ detail: "Pickup pass not found." });
  }
  return res.json(pass);
});

app.post("/internal/events", (req, res) => {
  const envelope = req.body || {};
  const topic = envelope.topic || "";
  const payload = envelope.payload || {};
  const store = loadStore();

  if (topic === "campus.item.reported") {
    const verb = payload.item_type === "found" ? "turned in" : "reported missing";
    store.activityFeed.unshift({
      id: `act_${Date.now()}`,
      summary: `${payload.title} ${verb}`,
      place: payload.building_name || "KLH Campus",
      when: "Just now"
    });
    store.activityFeed = store.activityFeed.slice(0, 20);
    pushNotification(
      store,
      payload.reporter_id,
      "report",
      `Logged ${payload.reference_code}: ${payload.title}`,
      payload.matches_found > 0
        ? `Good news — we spotted ${payload.matches_found} similar item report(s) on campus!`
        : "Your report is live on the KLH Campus board. We will alert you when a match appears.",
      payload.matches_found > 0 ? "matches" : "activity"
    );
  } else if (topic === "campus.item.roll_tagged") {
    pushNotification(
      store,
      payload.tagged_user_id,
      "roll_tag",
      `Found with your Roll No (${payload.tagged_roll_number})`,
      `${payload.title} was turned in at ${payload.pickup_desk}.`,
      "activity"
    );
  } else if (topic === "campus.item.sighted") {
    pushNotification(
      store,
      payload.reporter_id,
      "sighting",
      `Classmate note on ${payload.item_title}`,
      `${payload.author_name}: "${payload.note}"`,
      "activity"
    );
  } else if (topic === "campus.match.discovered") {
    pushNotification(
      store,
      payload.counterpart_reporter_id,
      "match",
      `${payload.similarity_pct}% match spotted: ${payload.new_item_title}`,
      payload.reason || "A newly posted campus report closely matches yours.",
      "matches"
    );
  } else if (topic === "campus.claim.submitted") {
    pushNotification(
      store,
      payload.claimant_id,
      "claim",
      `Claim ${payload.claim_code} received`,
      `Campus Desk at ${payload.pickup_desk} will review your ownership note shortly.`,
      "activity"
    );
    pushNotification(
      store,
      5,
      "desk",
      `New ownership claim ${payload.claim_code}`,
      `${payload.claimant_name} submitted verification details for ${payload.item_title}.`,
      "desk"
    );
  } else if (topic === "campus.claim.approved") {
    if (payload.pickup_code) {
      store.pickupPasses[payload.pickup_code] = {
        pickupCode: payload.pickup_code,
        claimCode: payload.claim_code,
        itemTitle: payload.item_title,
        pickupDesk: payload.pickup_desk,
        status: "approved_pickup",
        issuedAt: new Date().toISOString()
      };
    }
    pushNotification(
      store,
      payload.claimant_id,
      "approved",
      `Ready for pickup! Code: ${payload.pickup_code}`,
      `Bring your KLH ID card to ${payload.pickup_desk} to collect ${payload.item_title}.`,
      "activity"
    );
  } else if (topic === "campus.item.reunited") {
    if (payload.pickup_code && store.pickupPasses[payload.pickup_code]) {
      store.pickupPasses[payload.pickup_code].status = "reunited";
    }
    store.activityFeed.unshift({
      id: `act_${Date.now()}`,
      summary: `${payload.item_title} reunited with its owner!`,
      place: payload.pickup_desk || "KLH Campus Desk",
      when: "Just now"
    });
    pushNotification(
      store,
      payload.claimant_id,
      "reunited",
      `Glad it's back with you: ${payload.item_title}`,
      "Marked as Reunited by KLH Campus Desk.",
      "activity"
    );
  }

  saveStore(store);
  res.status(202).json({ accepted: true });
});

const PORT = Number(process.env.PORT || 8002);
app.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`KLH Express Notification Service listening on ${PORT}\n`);
});
