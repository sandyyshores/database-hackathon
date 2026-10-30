import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Sparkles,
  Upload,
  ArrowRight
} from "lucide-react";
import { api } from "../api";
import { getCategoryVisual, getShortCategoryName } from "../uiHelpers";
import { KLH_ROOMS_BY_CODE } from "../campusRooms";

const QUICK_COLORS = [
  "Black",
  "Navy Blue",
  "White",
  "Sage Green",
  "Crimson Red",
  "Tan Brown",
  "Silver"
];

export default function ReportItemView({
  user,
  categories = [],
  locations = [],
  initialType = "lost",
  prefill = null,
  onRequireAuth,
  onReportCreated,
  onInspectItem,
  onBackToBrowse
}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [itemType, setItemType] = useState(initialType);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 1);
  const [locationId, setLocationId] = useState(locations[0]?.id || 1);
  const [specificSpot, setSpecificSpot] = useState("");
  const [eventDate, setEventDate] = useState(todayStr);
  const [color, setColor] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [custodyHolder, setCustodyHolder] = useState("");
  const [taggedRollNumber, setTaggedRollNumber] = useState("");
  const [verificationPrompt, setVerificationPrompt] = useState("");
  const [finderSecretClue, setFinderSecretClue] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdResult, setCreatedResult] = useState(null);

  useEffect(() => {
    setItemType(initialType);
  }, [initialType]);

  useEffect(() => {
    if (prefill) {
      if (prefill.itemType) setItemType(prefill.itemType);
      if (prefill.categoryId) setCategoryId(Number(prefill.categoryId));
      if (prefill.locationId) setLocationId(Number(prefill.locationId));
      if (prefill.specificSpot) setSpecificSpot(prefill.specificSpot);
    }
  }, [prefill]);

  useEffect(() => {
    if (categories.length > 0 && !categories.some((c) => Number(c.id) === Number(categoryId))) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  useEffect(() => {
    if (locations.length > 0 && !locations.some((l) => Number(l.id) === Number(locationId))) {
      setLocationId(locations[0].id);
    }
  }, [locations, locationId]);

  const selectedLoc = locations.find((l) => Number(l.id) === Number(locationId));
  const quickRooms = selectedLoc ? KLH_ROOMS_BY_CODE[selectedLoc.code] || [] : [];

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_800_000) {
      setError("Please choose an image smaller than 1.8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoDataUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await api.createItem({
        item_type: itemType,
        title: title.trim(),
        description: description.trim(),
        color: color.trim(),
        brand: brand.trim(),
        category_id: Number(categoryId),
        location_id: Number(locationId),
        specific_spot: specificSpot.trim(),
        event_date: eventDate,
        event_time_approx: "",
        custody_holder:
          itemType === "found"
            ? custodyHolder.trim() || selectedLoc?.desk_location || ""
            : "",
        verification_prompt: itemType === "found" ? verificationPrompt.trim() : "",
        tagged_roll_number: itemType === "found" ? taggedRollNumber.trim() : "",
        finder_secret_clue: itemType === "found" ? finderSecretClue.trim() : "",
        tags: [color, brand, specificSpot, taggedRollNumber]
          .map((s) => s.trim())
          .filter(Boolean),
        custom_attributes: brand.trim() ? { Brand: brand.trim() } : {},
        photo_data_url: photoDataUrl
      });
      if (onReportCreated) await onReportCreated(result);
      setCreatedResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (createdResult) {
    const matches = createdResult.instant_matches || [];
    return (
      <div className="max-w-xl mx-auto bg-white rounded-3xl border border-campus-border shadow-card p-6 space-y-5">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-campus-ink">Report Posted</h2>
            <p className="text-xs text-campus-muted">
              {createdResult.title} · {createdResult.specific_spot || createdResult.building_name}
            </p>
          </div>
        </div>

        {createdResult.tagged_roll_number && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-900 font-medium">
            Alert sent to Roll No {createdResult.tagged_roll_number}.
          </div>
        )}

        {matches.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-amber-900 font-semibold text-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              {matches.length} possible match{matches.length > 1 ? "es" : ""} spotted
            </div>
            {matches.map((m) => (
              <div
                key={m.counterpart_id}
                className="bg-white rounded-xl p-3 border border-amber-200/80 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-campus-ink truncate">
                    {m.title}
                  </div>
                  <div className="text-xs text-campus-muted">
                    {Math.round(m.similarity_score * 100)}% similar · {m.building_name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onInspectItem(m.counterpart_id)}
                  className="px-3 py-1.5 rounded-lg bg-campus-crimson text-white text-xs font-semibold hover:bg-campus-crimsonDark transition inline-flex items-center gap-1 shrink-0"
                >
                  Open <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => {
              setCreatedResult(null);
              setTitle("");
              setDescription("");
              setSpecificSpot("");
              setColor("");
              setBrand("");
              setCustodyHolder("");
              setTaggedRollNumber("");
              setVerificationPrompt("");
              setFinderSecretClue("");
              setPhotoDataUrl(null);
            }}
            className="text-xs font-medium text-campus-muted hover:text-campus-ink"
          >
            Post another
          </button>
          <button
            type="button"
            onClick={onBackToBrowse}
            className="px-4 py-2 rounded-xl bg-campus-ink text-white text-xs font-semibold hover:opacity-90 transition"
          >
            Back to Board
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-semibold text-campus-ink">Report an Item</h2>
        <div className="inline-flex rounded-xl p-1 bg-white border border-campus-border shadow-sm">
          <button
            type="button"
            onClick={() => setItemType("lost")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              itemType === "lost"
                ? "bg-campus-crimson text-white"
                : "text-campus-muted hover:text-campus-ink"
            }`}
          >
            I Lost It
          </button>
          <button
            type="button"
            onClick={() => setItemType("found")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              itemType === "found"
                ? "bg-teal-700 text-white"
                : "text-campus-muted hover:text-campus-ink"
            }`}
          >
            I Found It
          </button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-3xl border border-campus-border shadow-card p-6 space-y-5"
      >
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => {
            const vis = getCategoryVisual(cat.slug);
            const IconComp = vis.Icon;
            const selected = Number(categoryId) === Number(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition ${
                  selected
                    ? "border-campus-crimson bg-campus-crimsonSoft text-campus-crimson font-semibold"
                    : "border-campus-border hover:bg-campus-cream text-campus-ink"
                }`}
              >
                <IconComp className="w-3.5 h-3.5" />
                {getShortCategoryName(cat.slug, cat.display_name)}
              </button>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-campus-muted mb-1">
              Item Name *
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-campus-border px-3.5 py-2.5 text-sm focus:outline-none focus:border-campus-crimson"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-campus-muted mb-1">
              Area / Floor *
            </label>
            <select
              value={locationId}
              onChange={(e) => {
                setLocationId(Number(e.target.value));
                setSpecificSpot("");
              }}
              className="w-full rounded-xl border border-campus-border bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:border-campus-crimson"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.building_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-campus-muted mb-1">
              Room or Spot
            </label>
            <input
              type="text"
              value={specificSpot}
              onChange={(e) => setSpecificSpot(e.target.value)}
              className="w-full rounded-xl border border-campus-border px-3.5 py-2.5 text-sm focus:outline-none focus:border-campus-crimson"
            />
          </div>

          {quickRooms.length > 0 && (
            <div className="sm:col-span-2 flex flex-wrap gap-1.5">
              {quickRooms.map((rm) => (
                <button
                  key={rm}
                  type="button"
                  onClick={() => setSpecificSpot(rm)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                    specificSpot === rm
                      ? "bg-campus-crimson text-white border-campus-crimson"
                      : "bg-campus-cream text-campus-ink border-campus-border hover:bg-campus-sand"
                  }`}
                >
                  {rm.split("—")[0].trim()}
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-campus-muted mb-1">
              Color
            </label>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full rounded-xl border border-campus-border px-3.5 py-2 text-sm focus:outline-none focus:border-campus-crimson"
            />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {QUICK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`text-[11px] px-2 py-0.5 rounded-md border transition ${
                    color === c
                      ? "bg-campus-ink text-white border-campus-ink"
                      : "bg-campus-cream text-campus-muted border-campus-border hover:text-campus-ink"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-campus-muted mb-1">
              Date *
            </label>
            <input
              type="date"
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-xl border border-campus-border px-3.5 py-2 text-sm focus:outline-none focus:border-campus-crimson"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-campus-muted mb-1">
              Short Description *
            </label>
            <textarea
              required
              minLength={2}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-campus-border px-3.5 py-2 text-sm focus:outline-none focus:border-campus-crimson"
            />
          </div>
        </div>

        {itemType === "found" && (
          <div className="p-4 rounded-2xl bg-teal-50/50 border border-teal-200/80 grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-campus-ink mb-1">
                Turned In At
              </label>
              <input
                type="text"
                value={custodyHolder}
                onChange={(e) => setCustodyHolder(e.target.value)}
                className="w-full rounded-xl border border-campus-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-teal-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-campus-ink mb-1">
                Roll Number on Item (optional)
              </label>
              <input
                type="text"
                value={taggedRollNumber}
                onChange={(e) => setTaggedRollNumber(e.target.value)}
                className="w-full rounded-xl border border-campus-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-teal-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-campus-ink mb-1">
                Owner Check Question
              </label>
              <input
                type="text"
                value={verificationPrompt}
                onChange={(e) => setVerificationPrompt(e.target.value)}
                className="w-full rounded-xl border border-campus-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-teal-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-campus-ink mb-1">
                Private Answer (Helpdesk only)
              </label>
              <input
                type="text"
                value={finderSecretClue}
                onChange={(e) => setFinderSecretClue(e.target.value)}
                className="w-full rounded-xl border border-campus-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-campus-border">
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-campus-border bg-campus-cream hover:bg-campus-sand text-xs font-semibold text-campus-ink cursor-pointer transition">
              <Upload className="w-3.5 h-3.5 text-campus-crimson" />
              {photoDataUrl ? "Change Photo" : "Add Photo"}
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
            {photoDataUrl && (
              <img
                src={photoDataUrl}
                alt="Preview"
                className="w-9 h-9 rounded-lg object-cover border border-campus-border"
              />
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-campus-crimson hover:bg-campus-crimsonDark text-white text-sm font-semibold transition disabled:opacity-60"
          >
            {submitting ? "Posting..." : "Post Report"}
          </button>
        </div>
      </form>
    </div>
  );
}
