import React from "react";
import {
  Ticket,
  CheckCircle2,
  Clock,
  XCircle,
  MapPin,
  Sparkles,
  Tag,
  MessageSquare
} from "lucide-react";
import {
  PickupQrSvg,
  formatFriendlyDate,
  getShortSpot,
  getStatusMeta
} from "../uiHelpers";

const CLAIM_STEPS = ["Sent", "Desk Check", "Pickup", "Reunited"];

function getActiveStepIndex(status) {
  if (status === "pending_review") return 1;
  if (status === "approved_pickup") return 2;
  if (status === "reunited") return 3;
  return -1;
}

export default function MyActivityView({
  user,
  allItems = [],
  myItems = [],
  myClaims = [],
  onRequireAuth,
  onInspectItem,
  onGoReport
}) {
  if (!user) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-3xl border border-campus-border shadow-card p-8 text-center space-y-4">
        <Ticket className="w-7 h-7 text-campus-crimson mx-auto" />
        <h2 className="text-xl font-semibold text-campus-ink">Sign in to view your items</h2>
        <button
          type="button"
          onClick={onRequireAuth}
          className="px-5 py-2.5 rounded-xl bg-campus-crimson hover:bg-campus-crimsonDark text-white text-sm font-semibold transition"
        >
          Sign In
        </button>
      </div>
    );
  }

  const claimedItemIds = new Set(myClaims.map((c) => Number(c.item_id)));
  const taggedForMe = allItems.filter(
    (it) =>
      it.item_type === "found" &&
      it.status !== "reunited" &&
      it.tagged_roll_number &&
      it.tagged_roll_number.toUpperCase() === user.roll_number.toUpperCase() &&
      !claimedItemIds.has(Number(it.id))
  );

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-campus-ink">My Activity</h2>
          <p className="text-xs text-campus-muted mt-0.5">
            {user.full_name} · {user.roll_number}
          </p>
        </div>

        <button
          type="button"
          onClick={onGoReport}
          className="px-4 py-2 rounded-xl bg-campus-crimson hover:bg-campus-crimsonDark text-white text-xs font-semibold transition"
        >
          + New Report
        </button>
      </div>

      {taggedForMe.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            Found with Your Roll Number ({taggedForMe.length})
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {taggedForMe.map((it) => (
              <div
                key={it.id}
                onClick={() => onInspectItem(it.id)}
                className="bg-emerald-50/70 hover:bg-emerald-50 rounded-2xl border border-emerald-300 p-4 cursor-pointer flex items-center justify-between gap-3 transition"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-campus-ink truncate">
                    {it.title}
                  </div>
                  <div className="text-xs text-emerald-900 mt-0.5 truncate">
                    At {it.custody_holder || it.desk_location}
                  </div>
                </div>
                <span className="px-3 py-1 rounded-lg bg-emerald-700 text-white text-xs font-semibold shrink-0">
                  Claim
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-campus-muted">
          Claims ({myClaims.length})
        </h3>

        {myClaims.length === 0 ? (
          <div className="bg-white rounded-2xl border border-campus-border p-5 text-sm text-campus-muted">
            No claims yet.
          </div>
        ) : (
          <div className="grid gap-3.5">
            {myClaims.map((clm) => {
              const stepIdx = getActiveStepIndex(clm.status);
              return (
                <div
                  key={clm.id}
                  className="bg-white rounded-2xl border border-campus-border shadow-card p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4
                      onClick={() => onInspectItem(clm.item_id)}
                      className="text-base font-semibold text-campus-ink hover:text-campus-crimson cursor-pointer truncate"
                    >
                      {clm.item_title}
                    </h4>

                    {clm.status === "declined" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 shrink-0">
                        <XCircle className="w-3 h-3" /> Declined
                      </span>
                    ) : clm.status === "reunited" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-300 shrink-0">
                        <CheckCircle2 className="w-3 h-3" /> Reunited
                      </span>
                    ) : clm.status === "approved_pickup" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                        <CheckCircle2 className="w-3 h-3" /> Pickup Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                        <Clock className="w-3 h-3" /> In Review
                      </span>
                    )}
                  </div>

                  {clm.status !== "declined" && (
                    <div className="grid grid-cols-4 gap-2">
                      {CLAIM_STEPS.map((label, idx) => {
                        const completed = idx <= stepIdx;
                        return (
                          <div key={label} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full ${
                                completed ? "bg-campus-crimson" : "bg-campus-sand"
                              }`}
                            />
                            <div
                              className={`text-[11px] font-medium ${
                                completed ? "text-campus-ink" : "text-campus-muted"
                              }`}
                            >
                              {label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {clm.pickup_code &&
                    (clm.status === "approved_pickup" || clm.status === "reunited") && (
                      <div className="ticket-notch rounded-xl border border-dashed border-emerald-300 bg-emerald-50/70 px-5 py-3.5 flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-xs text-emerald-950 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            <span>
                              Collect at <strong>{clm.pickup_desk}</strong>
                            </span>
                          </div>
                          <div className="font-mono text-base font-bold text-campus-ink">
                            {clm.pickup_code}
                          </div>
                        </div>

                        <PickupQrSvg
                          code={clm.pickup_code}
                          className="w-16 h-16 rounded-xl border border-emerald-300 shadow-sm shrink-0"
                        />
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-campus-muted">
          Reported ({myItems.length})
        </h3>

        {myItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-campus-border p-5 text-sm text-campus-muted">
            No items reported yet.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3.5">
            {myItems.map((it) => {
              const st = getStatusMeta(it.status, it.item_type);
              return (
                <div
                  key={it.id}
                  onClick={() => onInspectItem(it.id)}
                  className="bg-white rounded-2xl border border-campus-border p-4 shadow-card hover:shadow-cardHover cursor-pointer transition flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-campus-ink truncate">{it.title}</h4>
                    <p className="text-xs text-campus-muted mt-0.5 truncate">
                      {getShortSpot(it.specific_spot, it.building_name)} ·{" "}
                      {formatFriendlyDate(it.event_date)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {Number(it.sighting_count) > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200"
                        title="Classmate sighting note"
                      >
                        <MessageSquare className="w-3 h-3 text-teal-700" />
                        {it.sighting_count}
                      </span>
                    )}
                    {Number(it.match_count) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        {it.match_count}
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${st.className}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
