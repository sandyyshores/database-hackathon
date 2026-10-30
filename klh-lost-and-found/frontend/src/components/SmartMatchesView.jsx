import React, { useState } from "react";
import { Sparkles, MapPin, ArrowLeftRight, X } from "lucide-react";
import { api } from "../api";
import { formatFriendlyDate, getShortSpot } from "../uiHelpers";

export default function SmartMatchesView({
  matches = [],
  user,
  onInspectItem,
  onRequireAuth,
  onDismissed
}) {
  const [onlyMine, setOnlyMine] = useState(false);
  const [dismissingId, setDismissingId] = useState(null);

  const visibleMatches =
    onlyMine && user
      ? matches.filter(
          (m) =>
            Number(m.lost_reporter_id) === Number(user.id) ||
            Number(m.found_reporter_id) === Number(user.id)
        )
      : matches;

  const handleDismiss = async (matchId) => {
    if (!user) {
      if (onRequireAuth) onRequireAuth();
      return;
    }
    setDismissingId(matchId);
    try {
      await api.dismissMatch(matchId);
      if (onDismissed) await onDismissed();
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-campus-ink">Possible Matches</h2>

        {user && (
          <div className="inline-flex rounded-xl p-1 bg-white border border-campus-border">
            <button
              type="button"
              onClick={() => setOnlyMine(false)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                !onlyMine ? "bg-campus-ink text-white" : "text-campus-muted"
              }`}
            >
              All ({matches.length})
            </button>
            <button
              type="button"
              onClick={() => setOnlyMine(true)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                onlyMine ? "bg-campus-ink text-white" : "text-campus-muted"
              }`}
            >
              Mine
            </button>
          </div>
        )}
      </div>

      {visibleMatches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-campus-border p-10 text-center text-sm text-campus-muted">
          No paired reports right now.
        </div>
      ) : (
        <div className="space-y-3.5">
          {visibleMatches.map((m) => {
            const pct = Math.round(Number(m.similarity_score || 0) * 100);
            const inProgress =
              m.found_status === "claim_pending" ||
              m.found_status === "ready_for_pickup" ||
              m.found_status === "reunited";

            return (
              <div
                key={m.match_id}
                className="bg-white rounded-2xl border border-campus-border shadow-card p-4 sm:p-5 space-y-2.5"
              >
                <div className="grid md:grid-cols-11 gap-3 items-center">
                  <div
                    onClick={() => onInspectItem(m.lost_id)}
                    className="md:col-span-5 p-3.5 rounded-xl bg-campus-cream/60 hover:bg-campus-cream border border-campus-border/80 cursor-pointer transition"
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold text-rose-700">Lost</span>
                      <span className="text-campus-muted">{formatFriendlyDate(m.lost_date)}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-campus-ink truncate">
                      {m.lost_title}
                    </h3>
                    <div className="text-xs text-campus-muted mt-1.5 flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 text-rose-600 shrink-0" />
                      {getShortSpot(m.lost_spot, m.lost_building)}
                    </div>
                  </div>

                  <div className="md:col-span-1 flex flex-col items-center justify-center gap-1 py-1">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                      <Sparkles className="w-3 h-3 text-amber-700" />
                      {pct}%
                    </span>
                    <ArrowLeftRight className="w-3.5 h-3.5 text-campus-muted hidden md:block" />
                  </div>

                  <div
                    onClick={() => onInspectItem(m.found_id)}
                    className="md:col-span-5 p-3.5 rounded-xl bg-teal-50/35 hover:bg-teal-50/60 border border-teal-200/70 flex items-center justify-between gap-3 cursor-pointer transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] mb-1">
                        <span className="font-semibold text-teal-800">Found</span>
                        <span className="text-campus-muted">
                          · {formatFriendlyDate(m.found_date)}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-campus-ink truncate">
                        {m.found_title}
                      </h3>
                      <div className="text-xs text-campus-muted mt-1.5 flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-teal-700 shrink-0" />
                        {getShortSpot(m.found_spot, m.found_building)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspectItem(m.found_id);
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                          inProgress
                            ? "bg-white border border-campus-border text-campus-ink hover:bg-campus-sand"
                            : "bg-campus-crimson hover:bg-campus-crimsonDark text-white"
                        }`}
                      >
                        {inProgress ? "View" : "Claim"}
                      </button>

                      {!inProgress && (
                        <button
                          type="button"
                          disabled={dismissingId === m.match_id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismiss(m.match_id);
                          }}
                          title="Not mine — dismiss match"
                          className="p-2 rounded-xl text-campus-muted hover:text-rose-700 hover:bg-rose-50 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
