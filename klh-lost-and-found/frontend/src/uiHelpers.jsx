import React from "react";
import {
  Headphones,
  CupSoda,
  Wallet,
  Calculator,
  KeyRound,
  Glasses,
  Package
} from "lucide-react";

const ROOM_REGEX = /\b(?:lab\s*(?:0?1|14|15|008|108|301|303)|00[3-8]|10[1235678]|20[12356]|30[123567]|40[1-7])\b/gi;

export function canonicalRoomToken(raw) {
  const c = String(raw || "").toLowerCase().replace(/\s+/g, "");
  if (c === "lab008" || c === "008") return "008";
  if (c === "lab108" || c === "108") return "108";
  if (c === "lab301" || c === "301") return "301";
  if (c === "lab303" || c === "303") return "303";
  if (c === "lab01" || c === "lab1") return "lab01";
  if (c === "lab14") return "lab14";
  if (c === "lab15") return "lab15";
  return c;
}

export function extractRoomSet(text) {
  const found = String(text || "").match(ROOM_REGEX) || [];
  return new Set(found.map(canonicalRoomToken));
}

export function KlhCrest({ className = "w-9 h-9" }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8 9C8 7.34315 9.34315 6 11 6H37C38.6569 6 40 7.34315 40 9V24.5C40 33.8 32.6 40.4 24 43.5C15.4 40.4 8 33.8 8 24.5V9Z"
        fill="#9B1B30"
      />
      <path
        d="M11.5 10.5H36.5V24.2C36.5 31.6 30.6 37.1 24 39.8C17.4 37.1 11.5 31.6 11.5 24.2V10.5Z"
        stroke="#F6E6D4"
        strokeWidth="1.5"
        strokeOpacity="0.85"
      />
      <path
        d="M16 17V27.5C19 26.2 21.8 26.5 24 28C26.2 26.5 29 26.2 32 27.5V17C29 15.8 26.2 16.1 24 17.6C21.8 16.1 19 15.8 16 17Z"
        fill="#FAF7F2"
      />
      <path d="M24 17.5V28" stroke="#9B1B30" strokeWidth="1.5" />
      <circle cx="24" cy="12.8" r="1.7" fill="#F6D58E" />
    </svg>
  );
}

function isFinderCell(r, c, top, left) {
  const dr = r - top;
  const dc = c - left;
  if (dr < 0 || dr > 6 || dc < 0 || dc > 6) return null;
  if (dr === 0 || dr === 6 || dc === 0 || dc === 6) return true;
  if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) return true;
  return false;
}

export function PickupQrSvg({ code = "KLH-0000", className = "w-16 h-16" }) {
  const size = 21;
  const seedText = `KLH-PASS:${code}`;
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  const rects = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const f1 = isFinderCell(r, c, 0, 0);
      const f2 = isFinderCell(r, c, 0, size - 7);
      const f3 = isFinderCell(r, c, size - 7, 0);

      let dark = false;
      if (f1 !== null) {
        dark = f1;
      } else if (f2 !== null) {
        dark = f2;
      } else if (f3 !== null) {
        dark = f3;
      } else if (
        (r === 7 && (c < 8 || c >= size - 8)) ||
        (c === 7 && (r < 8 || r >= size - 8))
      ) {
        dark = false;
      } else if (r === 6 || c === 6) {
        dark = (r + c) % 2 === 0;
      } else {
        const mix = Math.imul(h ^ (r * 37 + c * 101), 2246822519);
        dark = ((mix >>> ((r + c) % 16)) & 1) === 1;
      }

      if (dark) {
        rects.push(
          <rect key={`${r}-${c}`} x={c + 2} y={r + 2} width="1" height="1" rx="0.18" />
        );
      }
    }
  }

  return (
    <svg
      viewBox="0 0 25 25"
      className={className}
      fill="#1E242B"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Pickup pass QR ${code}`}
    >
      <rect x="0" y="0" width="25" height="25" rx="3" fill="#FFFFFF" />
      {rects}
    </svg>
  );
}

export function getShortCategoryName(slug, fallback = "Item") {
  switch (slug) {
    case "electronics":
      return "Electronics";
    case "bottles-bags":
      return "Bottles & Bags";
    case "id-wallets":
      return "ID & Wallets";
    case "calculators-books":
      return "Books & Calc";
    case "keys-access":
      return "Keys";
    case "accessories":
      return "Personal";
    default:
      return fallback;
  }
}

export function getShortSpot(specificSpot, buildingName) {
  if (specificSpot) {
    return specificSpot.split("—")[0].trim();
  }
  if (!buildingName) return "Campus";
  return buildingName.split("(")[0].trim();
}

export function getCategoryVisual(slug) {
  switch (slug) {
    case "electronics":
      return {
        Icon: Headphones,
        bg: "bg-sky-50",
        ring: "border-sky-200/70",
        text: "text-sky-700"
      };
    case "bottles-bags":
      return {
        Icon: CupSoda,
        bg: "bg-teal-50",
        ring: "border-teal-200/70",
        text: "text-teal-700"
      };
    case "id-wallets":
      return {
        Icon: Wallet,
        bg: "bg-amber-50",
        ring: "border-amber-200/70",
        text: "text-amber-700"
      };
    case "calculators-books":
      return {
        Icon: Calculator,
        bg: "bg-indigo-50",
        ring: "border-indigo-200/70",
        text: "text-indigo-700"
      };
    case "keys-access":
      return {
        Icon: KeyRound,
        bg: "bg-rose-50",
        ring: "border-rose-200/70",
        text: "text-rose-700"
      };
    case "accessories":
      return {
        Icon: Glasses,
        bg: "bg-purple-50",
        ring: "border-purple-200/70",
        text: "text-purple-700"
      };
    default:
      return {
        Icon: Package,
        bg: "bg-stone-100",
        ring: "border-stone-200",
        text: "text-stone-700"
      };
  }
}

export function getColorSwatchHex(colorText = "") {
  const t = colorText.toLowerCase();
  if (t.includes("navy") || t.includes("dark blue")) return "#1E3A5F";
  if (t.includes("blue") || t.includes("cobalt")) return "#2563EB";
  if (t.includes("sage") || t.includes("olive")) return "#5F7A61";
  if (t.includes("green") || t.includes("forest")) return "#15803D";
  if (t.includes("crimson") || t.includes("maroon") || t.includes("red")) return "#9B1B30";
  if (t.includes("mustard") || t.includes("yellow")) return "#D99B26";
  if (t.includes("tan") || t.includes("brown") || t.includes("leather")) return "#9A6B43";
  if (t.includes("white") || t.includes("silver")) return "#E5E7EB";
  if (t.includes("black") || t.includes("graphite") || t.includes("charcoal")) return "#27272A";
  return "#A8A29E";
}

export function getStatusMeta(status, itemType) {
  switch (status) {
    case "matched":
      return {
        label: "Matched",
        className: "bg-amber-50 text-amber-800 border-amber-200"
      };
    case "claim_pending":
      return {
        label: "In Review",
        className: "bg-orange-50 text-orange-800 border-orange-200"
      };
    case "ready_for_pickup":
      return {
        label: "Pickup Ready",
        className: "bg-emerald-50 text-emerald-800 border-emerald-200"
      };
    case "reunited":
      return {
        label: "Reunited",
        className: "bg-emerald-100/80 text-emerald-900 border-emerald-300"
      };
    default:
      return itemType === "lost"
        ? {
            label: "Lost",
            className: "bg-rose-50 text-rose-800 border-rose-200"
          }
        : {
            label: "At Desk",
            className: "bg-teal-50 text-teal-800 border-teal-200"
          };
  }
}

export function formatFriendlyDate(dateStr) {
  if (!dateStr) return "";
  const parts = String(dateStr).slice(0, 10).split("-");
  if (parts.length !== 3) return dateStr;
  const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short"
  });
}
