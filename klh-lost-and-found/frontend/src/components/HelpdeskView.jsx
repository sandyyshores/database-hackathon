import React, { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  MapPin,
  Clock,
  QrCode
} from "lucide-react";
import { api } from "../api";
import { PickupQrSvg } from "../uiHelpers";

function getClaimBadge(status) {
  if (status === "approved_pickup") {
    return {
      label: "Pickup Ready",
      className: "bg-emerald-50 text-emerald-800 border-emerald-200"
    };
  }
  if (status === "reunited") {
    return {
      label: "Reunited",
      className: "bg-emerald-100 text-emerald-900 border-emerald-300"
    };
  }
  if (status === "declined") {
    return {
      label: "Declined",
      className: "bg-rose-50 text-rose-800 border-rose-200"
    };
  }
  return {
    label: "Pending",
    className: "bg-amber-50 text-amber-800 border-amber-200"
  };
}

export default function HelpdeskView({
  claims = [],
  onRefresh,
  onInspectItem
}) {
  const [busyId, setBusyId] = useState(null);
  const [passInput, setPassInput] = useState("");
  const [verifyingPass, setVerifyingPass] = useState(false);
  const [passVerifiedMsg, setPassVerifiedMsg] = useState("");
  const [error, setError] = useState("");

  const handleDecision = async (claim, decision) => {
    setBusyId(claim.id);
    setError("");
    setPassVerifiedMsg("");
    try {
      await api.verifyClaim(claim.id, {
        decision,
        reviewer_note: "",
        pickup_desk: claim.pickup_desk || claim.desk_location
      });
      if (onRefresh) await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handlePassCheck = async (e) => {
    e.preventDefault();
    if (!passInput.trim()) return;
    setVerifyingPass(true);
    setError("");
    setPassVerifiedMsg("");
    try {
      const res = await api.verifyPickupPass(passInput.trim());
      setPassInput("");
      setPassVerifiedMsg(
        `Handed over ${res.item_title} to ${res.claimant_name} (${res.claimant_roll}).`
      );
      if (onRefresh) await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifyingPass(false);
    }
  };

  const pending = claims.filter((c) => c.status === "pending_review");
  const approved = claims.filter((c) => c.status === "approved_pickup");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-campus-ink">Helpdesk Queue</h2>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            {pending.length} Pending
          </span>
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            {approved.length} Ready for Pickup
          </span>
        </div>
      </div>

      <form
        onSubmit={handlePassCheck}
        className="bg-white rounded-2xl border border-campus-border shadow-card p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-campus-ink shrink-0 px-1">
          <QrCode className="w-4 h-4 text-campus-crimson" />
          Quick Pass Check
        </div>
        <input
          type="text"
          value={passInput}
          onChange={(e) => setPassInput(e.target.value)}
          placeholder="Enter pickup pass code"
          className="flex-1 rounded-xl border border-campus-border bg-campus-cream/50 px-3.5 py-2 text-sm font-mono uppercase focus:outline-none focus:border-campus-crimson"
        />
        <button
          type="submit"
          disabled={verifyingPass || !passInput.trim()}
          className="px-4 py-2 rounded-xl bg-campus-crimson hover:bg-campus-crimsonDark text-white text-xs font-semibold transition disabled:opacity-50 shrink-0"
        >
          {verifyingPass ? "Checking..." : "Verify & Hand Over"}
        </button>
      </form>

      {passVerifiedMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          {passVerifiedMsg}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {error}
        </div>
      )}

      {claims.length === 0 ? (
        <div className="bg-white rounded-2xl border border-campus-border p-10 text-center text-sm text-campus-muted">
          <Clock className="w-6 h-6 text-campus-muted mx-auto mb-2" />
          No ownership claims in the queue right now.
        </div>
      ) : (
        <div className="space-y-3.5">
          {claims.map((clm) => {
            const badge = getClaimBadge(clm.status);
            return (
              <div
                key={clm.id}
                className="bg-white rounded-2xl border border-campus-border shadow-card p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3
                        onClick={() => onInspectItem(clm.item_id)}
                        className="text-base font-semibold text-campus-ink hover:text-campus-crimson cursor-pointer"
                      >
                        {clm.item_title}
                      </h3>
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-campus-muted flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-campus-crimson" />
                      {clm.pickup_desk || clm.desk_location}
                    </p>
                  </div>

                  <div className="text-right text-xs">
                    <div className="font-semibold text-campus-ink">{clm.claimant_name}</div>
                    <div className="text-campus-muted">{clm.claimant_roll}</div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-campus-cream border border-campus-border">
                    <div className="font-semibold text-campus-muted mb-1">Student Proof</div>
                    <p className="text-campus-ink text-sm">{clm.ownership_proof}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200/80">
                    <div className="font-semibold text-amber-900 mb-1">Finder Clue</div>
                    <p className="text-amber-950 text-sm">
                      {clm.finder_secret_clue ||
                        clm.verification_prompt ||
                        "Verify student ID at desk."}
                    </p>
                  </div>
                </div>

                {clm.status === "pending_review" && (
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busyId === clm.id}
                      onClick={() => handleDecision(clm, "decline")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={busyId === clm.id}
                      onClick={() => handleDecision(clm, "approve_pickup")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Approve Pickup
                    </button>
                    <button
                      type="button"
                      disabled={busyId === clm.id}
                      onClick={() => handleDecision(clm, "mark_reunited")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-campus-ink hover:opacity-90 text-white text-xs font-semibold transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Reunited
                    </button>
                  </div>
                )}

                {clm.status === "approved_pickup" && (
                  <div className="flex items-center justify-between pt-2 border-t border-campus-border gap-3">
                    <div className="flex items-center gap-2.5">
                      {clm.pickup_code && (
                        <PickupQrSvg
                          code={clm.pickup_code}
                          className="w-11 h-11 rounded-lg border border-emerald-300 shrink-0"
                        />
                      )}
                      <span className="text-xs font-mono font-bold text-emerald-800">
                        Pass: {clm.pickup_code}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === clm.id}
                      onClick={() => handleDecision(clm, "mark_reunited")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-campus-crimson hover:bg-campus-crimsonDark text-white text-xs font-semibold transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark Reunited
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
