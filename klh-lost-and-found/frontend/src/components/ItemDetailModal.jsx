import React, { useEffect, useState } from "react";
import {
  X,
  MapPin,
  Calendar,
  Sparkles,
  CheckCircle2,
  Building2,
  ArrowRight,
  User,
  Clock,
  ShieldCheck,
  Pencil,
  Trash2,
  Send,
  Tag,
  MessageSquare
} from "lucide-react";
import { api } from "../api";
import {
  PickupQrSvg,
  formatFriendlyDate,
  getCategoryVisual,
  getColorSwatchHex,
  getShortCategoryName,
  getStatusMeta
} from "../uiHelpers";

export default function ItemDetailModal({
  itemId,
  initialItem = null,
  preloadedMatches = [],
  categories = [],
  locations = [],
  user,
  myLostItems = [],
  myClaims = [],
  onClose,
  onRequireAuth,
  onClaimSubmitted,
  onSelectAnotherItem,
  onReportFoundSimilar,
  onOpenDesk
}) {
  const [item, setItem] = useState(initialItem);
  const [loading, setLoading] = useState(!initialItem);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [ownershipProof, setOwnershipProof] = useState("");
  const [preferredContact, setPreferredContact] = useState(user?.phone || "");
  const [linkedLostId, setLinkedLostId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [claimSuccess, setClaimSuccess] = useState(null);

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editLocationId, setEditLocationId] = useState(1);
  const [editCategoryId, setEditCategoryId] = useState(1);
  const [editSpot, setEditSpot] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTaggedRoll, setEditTaggedRoll] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [sightingNote, setSightingNote] = useState("");
  const [sendingSighting, setSendingSighting] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setError("");
    setShowClaimForm(false);
    setClaimSuccess(null);
    setOwnershipProof("");
    setLinkedLostId("");
    setEditing(false);
    setConfirmDelete(false);
    setSightingNote("");

    if (initialItem) {
      setItem(initialItem);
      setLoading(false);
    } else {
      setLoading(true);
    }

    api
      .getItem(itemId)
      .then((data) => {
        if (!active) return;
        setItem(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        if (!initialItem) {
          setError(err.message || "Could not load item details.");
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [itemId]);

  useEffect(() => {
    setPreferredContact(user?.phone || "");
  }, [user?.id]);

  if (!itemId) return null;

  const isOwnReport = Boolean(
    user && item && Number(item.reporter_id) === Number(user.id)
  );
  const canManage = Boolean(user && item && (isOwnReport || user.role === "staff"));

  const startEditing = () => {
    if (!item) return;
    setEditTitle(item.title || "");
    setEditCategoryId(item.category_id || categories[0]?.id || 1);
    setEditLocationId(item.location_id || locations[0]?.id || 1);
    setEditSpot(item.specific_spot || "");
    setEditColor(item.color || "");
    setEditDate((item.event_date || "").slice(0, 10));
    setEditTaggedRoll(item.tagged_roll_number || "");
    setEditDesc(item.description || "");
    setEditing(true);
    setConfirmDelete(false);
    setError("");
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const updated = await api.updateItem(item.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        color: editColor.trim(),
        brand: item.brand || "",
        category_id: Number(editCategoryId),
        location_id: Number(editLocationId),
        specific_spot: editSpot.trim(),
        event_date: editDate,
        custody_holder: item.custody_holder || "",
        verification_prompt: item.verification_prompt || "",
        tagged_roll_number: item.item_type === "found" ? editTaggedRoll.trim() : ""
      });
      setItem(updated);
      setEditing(false);
      if (onClaimSubmitted) await onClaimSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = async () => {
    setSubmitting(true);
    setError("");
    try {
      await api.deleteItem(item.id);
      if (onClaimSubmitted) await onClaimSubmitted();
      onClose();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const handleAddSighting = async (e) => {
    e.preventDefault();
    if (!sightingNote.trim()) return;
    if (!user) {
      onRequireAuth();
      return;
    }
    setSendingSighting(true);
    setError("");
    try {
      const createdSighting = await api.addSighting(item.id, sightingNote.trim());
      setSightingNote("");
      setItem((prev) =>
        prev
          ? {
              ...prev,
              sightings: [...(prev.sightings || []), createdSighting]
            }
          : prev
      );
      if (onClaimSubmitted) await onClaimSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingSighting(false);
    }
  };

  const existingUserClaim =
    user && item
      ? myClaims.find(
          (c) =>
            Number(c.item_id) === Number(item.id) &&
            Number(c.claimant_id) === Number(user.id) &&
            (c.status === "pending_review" || c.status === "approved_pickup")
        )
      : null;

  const pendingStaffClaim =
    user?.role === "staff" && item
      ? myClaims.find(
          (c) =>
            Number(c.item_id) === Number(item.id) &&
            (c.status === "pending_review" || c.status === "approved_pickup")
        )
      : null;

  const handleOpenClaim = () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setShowClaimForm(true);
  };

  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const created = await api.submitClaim({
        item_id: item.id,
        linked_lost_item_id: linkedLostId ? Number(linkedLostId) : null,
        ownership_proof: ownershipProof,
        identifying_marks: "",
        preferred_contact: preferredContact
      });
      setClaimSuccess(created);
      setShowClaimForm(false);
      const refreshed = await api.getItem(item.id).catch(() => null);
      if (refreshed) setItem(refreshed);
      if (onClaimSubmitted) await onClaimSubmitted(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkReunited = async () => {
    setSubmitting(true);
    setError("");
    try {
      await api.updateItemStatus(item.id, "reunited", "Marked reunited");
      setItem((prev) => (prev ? { ...prev, status: "reunited" } : prev));
      if (onClaimSubmitted) await onClaimSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const displayMatches =
    item?.matches && item.matches.length > 0 ? item.matches : preloadedMatches;

  const visual = getCategoryVisual(item?.category_slug);
  const CategoryIcon = visual.Icon;
  const statusMeta = item ? getStatusMeta(item.status, item.item_type) : null;
  const matchesMyRoll = Boolean(
    user &&
      item?.tagged_roll_number &&
      user.roll_number.toUpperCase() === item.tagged_roll_number.toUpperCase()
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-campus-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-3xl border border-campus-border shadow-2xl overflow-hidden my-auto max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-campus-border flex items-center justify-between gap-2">
          {item ? (
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusMeta?.className}`}
              >
                {statusMeta?.label}
              </span>
              <span className="text-xs text-campus-muted">
                {getShortCategoryName(item.category_slug, item.category_name)}
              </span>
            </div>
          ) : (
            <span className="text-xs text-campus-muted">Item Details</span>
          )}

          <div className="flex items-center gap-1">
            {canManage && !editing && (
              <>
                <button
                  type="button"
                  onClick={startEditing}
                  title="Edit post"
                  className="p-1.5 rounded-full text-campus-muted hover:text-campus-ink hover:bg-campus-sand transition"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete((v) => !v)}
                  title="Delete post"
                  className="p-1.5 rounded-full text-campus-muted hover:text-rose-700 hover:bg-rose-50 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-campus-muted hover:text-campus-ink hover:bg-campus-sand transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {loading && !item ? (
            <div className="py-10 text-center text-campus-muted text-sm">
              Opening item...
            </div>
          ) : !item && error ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-rose-700">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl bg-campus-sand text-xs font-semibold text-campus-ink"
              >
                Close
              </button>
            </div>
          ) : editing && item ? (
            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-campus-muted mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-campus-muted mb-1">
                    Category
                  </label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(Number(e.target.value))}
                    className="w-full rounded-xl border border-campus-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {getShortCategoryName(c.slug, c.display_name)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-campus-muted mb-1">
                    Area / Floor
                  </label>
                  <select
                    value={editLocationId}
                    onChange={(e) => setEditLocationId(Number(e.target.value))}
                    className="w-full rounded-xl border border-campus-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.building_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-campus-muted mb-1">
                    Room or Spot
                  </label>
                  <input
                    type="text"
                    value={editSpot}
                    onChange={(e) => setEditSpot(e.target.value)}
                    className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-campus-muted mb-1">
                    Color
                  </label>
                  <input
                    type="text"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-campus-muted mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                  />
                </div>
                {item.item_type === "found" && (
                  <div>
                    <label className="block text-xs font-semibold text-campus-muted mb-1">
                      Roll No on Item
                    </label>
                    <input
                      type="text"
                      value={editTaggedRoll}
                      onChange={(e) => setEditTaggedRoll(e.target.value)}
                      className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-campus-muted mb-1">
                  Description
                </label>
                <textarea
                  required
                  minLength={2}
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                />
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-campus-muted hover:text-campus-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-campus-crimson hover:bg-campus-crimsonDark text-white text-xs font-semibold transition"
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          ) : (
            item && (
              <>
                {confirmDelete && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-rose-900">
                      Delete this post permanently?
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-2.5 py-1 text-xs font-medium text-campus-muted hover:text-campus-ink"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleDeleteItem}
                        className="px-3 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-12 h-12 rounded-2xl border ${visual.bg} ${visual.ring} flex items-center justify-center shrink-0`}
                  >
                    <CategoryIcon className={`w-6 h-6 ${visual.text}`} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-campus-ink leading-snug">
                      {item.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-campus-muted mt-1">
                      <span className="inline-flex items-center gap-1 text-campus-ink font-medium">
                        <MapPin className="w-3.5 h-3.5 text-campus-crimson" />
                        {item.specific_spot || item.building_name}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatFriendlyDate(item.event_date)}
                        {item.event_time_approx ? ` · ${item.event_time_approx}` : ""}
                      </span>
                    </div>
                  </div>
                </div>

                {item.photo_data_url && (
                  <div className="rounded-2xl overflow-hidden border border-campus-border bg-campus-cream max-h-56 flex items-center justify-center">
                    <img
                      src={item.photo_data_url}
                      alt={item.title}
                      className="max-h-56 w-auto object-contain"
                    />
                  </div>
                )}

                <p className="text-sm text-campus-ink/90 leading-relaxed">
                  {item.description}
                </p>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {item.color && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-campus-cream border border-campus-border text-campus-ink">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-black/15"
                        style={{ backgroundColor: getColorSwatchHex(item.color) }}
                      />
                      {item.color}
                    </span>
                  )}
                  {item.brand && (
                    <span className="px-3 py-1 rounded-full bg-campus-cream border border-campus-border text-campus-ink">
                      {item.brand}
                    </span>
                  )}
                  {item.tagged_roll_number && (
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border font-semibold ${
                        matchesMyRoll
                          ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                          : "bg-indigo-50 border-indigo-200 text-indigo-900"
                      }`}
                    >
                      <Tag className="w-3 h-3" />
                      {matchesMyRoll
                        ? `Your Roll (${item.tagged_roll_number})`
                        : `Roll ${item.tagged_roll_number}`}
                    </span>
                  )}
                  {item.item_type === "found" ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-900 font-medium">
                      <Building2 className="w-3 h-3" />
                      {item.custody_holder || item.desk_location}
                    </span>
                  ) : (
                    item.reporter_name && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-campus-cream border border-campus-border text-campus-muted">
                        <User className="w-3 h-3" />
                        Posted by {item.reporter_name}
                      </span>
                    )
                  )}
                </div>

                {claimSuccess && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2.5 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>
                      Claim <strong>{claimSuccess.claim_code}</strong> sent to{" "}
                      {claimSuccess.pickup_desk}.
                    </span>
                  </div>
                )}

                {!claimSuccess && existingUserClaim && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 font-semibold">
                        <Clock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        {existingUserClaim.status === "approved_pickup"
                          ? `Ready at ${existingUserClaim.pickup_desk}`
                          : `Claim ${existingUserClaim.claim_code} under desk review`}
                      </div>
                      {existingUserClaim.pickup_code && (
                        <div className="font-mono text-sm font-bold text-campus-ink">
                          Pass: {existingUserClaim.pickup_code}
                        </div>
                      )}
                    </div>
                    {existingUserClaim.pickup_code && (
                      <PickupQrSvg
                        code={existingUserClaim.pickup_code}
                        className="w-14 h-14 rounded-lg border border-emerald-300 shrink-0"
                      />
                    )}
                  </div>
                )}

                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                    {error}
                  </div>
                )}

                {item.item_type === "found" &&
                  item.status !== "reunited" &&
                  !claimSuccess &&
                  !existingUserClaim && (
                    <div>
                      {user?.role === "staff" ? (
                        <div className="flex gap-2">
                          {pendingStaffClaim && onOpenDesk && (
                            <button
                              type="button"
                              onClick={onOpenDesk}
                              className="flex-1 py-2.5 rounded-xl bg-campus-crimson hover:bg-campus-crimsonDark text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Review Claim in Desk
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={handleMarkReunited}
                            className="flex-1 py-2.5 rounded-xl border border-campus-border hover:border-campus-crimson text-xs font-semibold text-campus-ink transition"
                          >
                            Mark as Reunited
                          </button>
                        </div>
                      ) : isOwnReport ? (
                        <div className="p-3 rounded-xl bg-campus-cream border border-campus-border text-xs text-campus-muted text-center">
                          You posted this found item report.
                        </div>
                      ) : !showClaimForm ? (
                        <button
                          type="button"
                          onClick={handleOpenClaim}
                          className="w-full py-2.5 rounded-xl bg-campus-crimson hover:bg-campus-crimsonDark text-white text-sm font-semibold transition"
                        >
                          This Is Mine — Claim Item
                        </button>
                      ) : (
                        <form
                          onSubmit={handleClaimSubmit}
                          className="p-4 rounded-2xl bg-campus-cream border border-campus-border space-y-3"
                        >
                          {item.verification_prompt && (
                            <div className="text-xs text-campus-ink font-medium">
                              {item.verification_prompt}
                            </div>
                          )}

                          <textarea
                            required
                            minLength={2}
                            rows={2}
                            value={ownershipProof}
                            onChange={(e) => setOwnershipProof(e.target.value)}
                            placeholder="Proof of ownership"
                            className="w-full rounded-xl border border-campus-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                          />

                          <div className="grid sm:grid-cols-2 gap-2.5">
                            <input
                              type="text"
                              value={preferredContact}
                              onChange={(e) => setPreferredContact(e.target.value)}
                              placeholder="Phone number"
                              className="w-full rounded-xl border border-campus-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                            />
                            {myLostItems.length > 0 && (
                              <select
                                value={linkedLostId}
                                onChange={(e) => setLinkedLostId(e.target.value)}
                                className="w-full rounded-xl border border-campus-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                              >
                                <option value="">Link lost post (optional)</option>
                                {myLostItems.map((li) => (
                                  <option key={li.id} value={li.id}>
                                    {li.title}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>

                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setShowClaimForm(false)}
                              className="px-3 py-1.5 text-xs font-medium text-campus-muted hover:text-campus-ink"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={submitting}
                              className="px-4 py-2 rounded-xl bg-campus-crimson text-white text-xs font-semibold hover:bg-campus-crimsonDark transition disabled:opacity-60"
                            >
                              {submitting ? "Sending..." : "Submit Claim"}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}

                {item.item_type === "lost" && item.status !== "reunited" && (
                  <div className="space-y-3">
                    {isOwnReport || user?.role === "staff" ? (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleMarkReunited}
                        className="w-full py-2.5 rounded-xl border border-campus-border hover:border-campus-crimson text-xs font-semibold text-campus-ink transition"
                      >
                        I Found It — Close Report
                      </button>
                    ) : (
                      onReportFoundSimilar && (
                        <button
                          type="button"
                          onClick={() => onReportFoundSimilar(item)}
                          className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition"
                        >
                          I Found Something Like This
                        </button>
                      )
                    )}

                    <div className="pt-2 border-t border-campus-border space-y-2.5">
                      <div className="text-xs font-semibold text-campus-muted flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
                        Spotted / Handed Over Notes
                      </div>

                      {item.sightings && item.sightings.length > 0 && (
                        <div className="space-y-1.5">
                          {item.sightings.map((sg) => (
                            <div
                              key={sg.id}
                              className="p-2.5 rounded-xl bg-campus-cream border border-campus-border text-xs"
                            >
                              <span className="font-semibold text-campus-ink">
                                {sg.author_name.split(" ")[0]}:
                              </span>{" "}
                              <span className="text-campus-ink/90">{sg.note}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {!isOwnReport && (
                        <form onSubmit={handleAddSighting} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={sightingNote}
                            onChange={(e) => setSightingNote(e.target.value)}
                            placeholder="Leave a quick sighting note"
                            className="flex-1 rounded-xl border border-campus-border bg-white px-3 py-2 text-xs focus:outline-none focus:border-campus-crimson"
                          />
                          <button
                            type="submit"
                            disabled={sendingSighting || !sightingNote.trim()}
                            className="px-3 py-2 rounded-xl bg-campus-ink text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50 transition"
                          >
                            <Send className="w-3 h-3" />
                            Send
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                )}

                {displayMatches && displayMatches.length > 0 && (
                  <div className="pt-2 border-t border-campus-border space-y-2">
                    <div className="text-xs font-semibold text-campus-muted flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      Possible Match
                    </div>
                    {displayMatches.map((m) => (
                      <button
                        key={m.match_id || m.counterpart_id}
                        type="button"
                        onClick={() => onSelectAnotherItem(m.counterpart_id)}
                        className="w-full text-left p-3 rounded-xl bg-amber-50/60 hover:bg-amber-50 border border-amber-200/80 flex items-center justify-between gap-3 transition"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-campus-ink truncate">
                            {m.title}
                          </div>
                          <div className="text-xs text-campus-muted truncate">
                            {Math.round(m.similarity_score * 100)}% similar ·{" "}
                            {m.specific_spot || m.building_name}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-campus-crimson shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
