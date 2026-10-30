import React, { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { FLOOR_ORDER, LAB_CHIPS, HANGOUT_SPACES } from "../campusRooms";
import { canonicalRoomToken, extractRoomSet } from "../uiHelpers";

export default function CampusMapCard({
  locations = [],
  items = [],
  selectedLocationId,
  activeRoomFilter = "",
  onSelectLocation,
  onSelectRoomFilter
}) {
  const byCode = {};
  locations.forEach((l) => {
    byCode[l.code] = l;
  });

  const labsLoc = byCode["LABS"];

  const { roomCounts, locCounts } = useMemo(() => {
    const rMap = {};
    const lMap = {};
    items.forEach((it) => {
      if (it.status === "reunited" || it.status === "archived") return;
      if (it.location_id) {
        lMap[it.location_id] = (lMap[it.location_id] || 0) + 1;
      }
      const rooms = extractRoomSet(
        `${it.specific_spot || ""} ${it.title || ""} ${it.description || ""} ${(it.tags || []).join(" ")}`
      );
      rooms.forEach((code) => {
        rMap[code] = (rMap[code] || 0) + 1;
      });
    });
    return { roomCounts: rMap, locCounts: lMap };
  }, [items]);

  const handleReset = () => {
    onSelectLocation(null);
    if (onSelectRoomFilter) onSelectRoomFilter("");
  };

  return (
    <div className="bg-white rounded-2xl border border-campus-border shadow-card p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-campus-muted">
          KLH Campus Spaces
        </span>
        {(selectedLocationId || activeRoomFilter) && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 text-xs font-semibold text-campus-crimson hover:underline"
          >
            <RotateCcw className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 space-y-2">
          <div className="text-xs font-medium text-campus-muted mb-1">Classrooms</div>
          {FLOOR_ORDER.map((fl) => {
            const loc = byCode[fl.code];
            const floorCount = loc ? locCounts[loc.id] || 0 : 0;
            const isFloorSelected =
              loc && Number(selectedLocationId) === Number(loc.id) && !activeRoomFilter;

            return (
              <div
                key={fl.code}
                className="flex flex-wrap items-center gap-1.5 py-1 border-b border-campus-border/50 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!loc) return;
                    if (isFloorSelected) {
                      onSelectLocation(null);
                    } else {
                      onSelectLocation(loc.id);
                      if (onSelectRoomFilter) onSelectRoomFilter("");
                    }
                  }}
                  className={`w-24 flex items-center justify-between text-xs font-semibold px-2 py-1 rounded-lg transition ${
                    isFloorSelected
                      ? "bg-campus-crimson text-white"
                      : "text-campus-muted hover:text-campus-ink"
                  }`}
                >
                  <span>{fl.floorLabel.replace(" Floor", "")}</span>
                  {floorCount > 0 && (
                    <span
                      className={`text-[10px] px-1.5 rounded-full ${
                        isFloorSelected
                          ? "bg-white/20 text-white"
                          : "bg-campus-sand text-campus-ink"
                      }`}
                    >
                      {floorCount}
                    </span>
                  )}
                </button>

                <div className="flex flex-wrap gap-1">
                  {fl.rooms.map((rm) => {
                    const roomActive = activeRoomFilter === rm;
                    const count = roomCounts[canonicalRoomToken(rm)] || 0;
                    return (
                      <button
                        key={rm}
                        type="button"
                        onClick={() => {
                          if (roomActive) {
                            if (onSelectRoomFilter) onSelectRoomFilter("");
                            onSelectLocation(null);
                          } else {
                            if (loc) onSelectLocation(loc.id);
                            if (onSelectRoomFilter) onSelectRoomFilter(rm);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition ${
                          roomActive
                            ? "bg-campus-crimson text-white border-campus-crimson"
                            : count > 0
                            ? "bg-amber-50/70 text-campus-ink border-amber-300 hover:border-campus-crimson"
                            : "bg-campus-cream/70 text-campus-ink border-campus-border hover:border-campus-crimson/50"
                        }`}
                      >
                        <span>{rm}</span>
                        {count > 0 && (
                          <span
                            className={`text-[10px] font-sans font-bold px-1 rounded-full ${
                              roomActive
                                ? "bg-white text-campus-crimson"
                                : "bg-campus-crimson text-white"
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-5 space-y-4 lg:border-l lg:border-campus-border lg:pl-5">
          <div>
            <div className="text-xs font-medium text-campus-muted mb-2">Labs</div>
            <div className="flex flex-wrap gap-1.5">
              {LAB_CHIPS.map((lb) => {
                const active = activeRoomFilter === lb.query;
                const count = roomCounts[canonicalRoomToken(lb.query)] || 0;
                return (
                  <button
                    key={lb.label}
                    type="button"
                    onClick={() => {
                      if (active) {
                        if (onSelectRoomFilter) onSelectRoomFilter("");
                        onSelectLocation(null);
                      } else {
                        if (labsLoc) onSelectLocation(labsLoc.id);
                        if (onSelectRoomFilter) onSelectRoomFilter(lb.query);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                      active
                        ? "bg-campus-crimson text-white border-campus-crimson"
                        : count > 0
                        ? "bg-amber-50/70 text-campus-ink border-amber-300 hover:border-campus-crimson"
                        : "bg-campus-cream/70 text-campus-ink border-campus-border hover:border-campus-crimson/50"
                    }`}
                  >
                    <span>{lb.label}</span>
                    {count > 0 && (
                      <span
                        className={`text-[10px] font-bold px-1.5 rounded-full ${
                          active
                            ? "bg-white text-campus-crimson"
                            : "bg-campus-crimson text-white"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-campus-muted mb-2">Common Spaces</div>
            <div className="flex flex-wrap gap-1.5">
              {HANGOUT_SPACES.map((sp) => {
                const loc = byCode[sp.code];
                if (!loc) return null;
                const count = locCounts[loc.id] || 0;
                const isSelected =
                  Number(selectedLocationId) === Number(loc.id) && !activeRoomFilter;
                return (
                  <button
                    key={sp.code}
                    type="button"
                    onClick={() => {
                      onSelectLocation(isSelected ? null : loc.id);
                      if (onSelectRoomFilter) onSelectRoomFilter("");
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                      isSelected
                        ? "bg-campus-crimson text-white border-campus-crimson"
                        : count > 0
                        ? "bg-white text-campus-ink border-campus-border hover:border-campus-crimson"
                        : "bg-white text-campus-muted border-campus-border hover:border-campus-crimson/50"
                    }`}
                  >
                    <span>{loc.building_name}</span>
                    {count > 0 && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                          isSelected
                            ? "bg-white text-campus-crimson"
                            : "bg-campus-sand text-campus-ink"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
