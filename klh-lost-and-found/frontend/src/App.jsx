import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Sparkles,
  Plus,
  Bell,
  MapPin,
  Layers,
  ShieldCheck,
  User,
  LogOut,
  X,
  Tag,
  MessageSquare
} from "lucide-react";
import {
  api,
  getStoredToken,
  isExplicitlySignedOut,
  setExplicitlySignedOut,
  setStoredToken
} from "./api";
import {
  KlhCrest,
  canonicalRoomToken,
  extractRoomSet,
  formatFriendlyDate,
  getCategoryVisual,
  getColorSwatchHex,
  getShortCategoryName,
  getShortSpot,
  getStatusMeta
} from "./uiHelpers";
import CampusMapCard from "./components/CampusMapCard";
import ItemDetailModal from "./components/ItemDetailModal";
import ReportItemView from "./components/ReportItemView";
import SmartMatchesView from "./components/SmartMatchesView";
import MyActivityView from "./components/MyActivityView";
import HelpdeskView from "./components/HelpdeskView";
import AuthModal from "./components/AuthModal";

export default function App() {
  const [activeTab, setActiveTab] = useState("browse");
  const [reportInitialType, setReportInitialType] = useState("lost");
  const [reportPrefill, setReportPrefill] = useState(null);

  const [user, setUser] = useState(null);
  const [demoAccounts, setDemoAccounts] = useState([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [searchedItems, setSearchedItems] = useState(null);
  const [matches, setMatches] = useState([]);
  const [claims, setClaims] = useState([]);
  const [myItems, setMyItems] = useState([]);
  const [notifications, setNotifications] = useState({ unreadCount: 0, items: [] });
  const [notifOpen, setNotifOpen] = useState(false);

  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [locationFilter, setLocationFilter] = useState(null);
  const [roomFilter, setRoomFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showCampusMap, setShowCampusMap] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [selectedItemId, setSelectedItemId] = useState(null);
  const notifContainerRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!notifOpen) return;
    const handlePointerDown = (e) => {
      if (notifContainerRef.current && !notifContainerRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setNotifOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [notifOpen]);

  const loadCoreData = useCallback(async () => {
    const [sumData, catData, locData, demoData, itemsList] = await Promise.all([
      api.getSummary(),
      api.getCategories(),
      api.getLocations(),
      api.getDemoAccounts(),
      api.listItems()
    ]);
    setSummary(sumData);
    setCategories(catData);
    setLocations(locData);
    setDemoAccounts(demoData);
    setAllItems(itemsList);
  }, []);

  const loadMatchesAndUserActivity = useCallback(async (activeUser) => {
    const allMatches = await api.listMatches(false).catch(() => []);
    setMatches(allMatches);

    if (activeUser) {
      const [claimRows, userReported, notifData] = await Promise.all([
        api.listClaims().catch(() => []),
        api.listItems({ mine: "true" }).catch(() => []),
        api.getNotifications(activeUser.id)
      ]);
      setClaims(claimRows);
      setMyItems(userReported);
      setNotifications(notifData);
    } else {
      setClaims([]);
      setMyItems([]);
      setNotifications({ unreadCount: 0, items: [] });
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadCoreData();
      } catch {
        await new Promise((r) => setTimeout(r, 1200));
        if (mounted) {
          await loadCoreData().catch(() => {});
        }
      } finally {
        if (mounted) setInitialLoading(false);
      }

      let currentUser = null;
      const existingToken = getStoredToken();
      if (existingToken) {
        currentUser = await api.me().catch(() => {
          setStoredToken("");
          return null;
        });
      }

      if (!currentUser && !isExplicitlySignedOut()) {
        const autoLogin = await api
          .login("2520030330", "klhstudent")
          .catch(() => null);
        if (autoLogin) {
          setStoredToken(autoLogin.access_token);
          currentUser = autoLogin.user;
        }
      }

      if (!mounted) return;
      setUser(currentUser);
      await loadMatchesAndUserActivity(currentUser);
    })();
    return () => {
      mounted = false;
    };
  }, [loadCoreData, loadMatchesAndUserActivity]);

  useEffect(() => {
    if (!debouncedQuery) {
      setSearchedItems(null);
      return;
    }
    let active = true;
    api
      .listItems({ q: debouncedQuery })
      .then((res) => {
        if (active) setSearchedItems(res);
      })
      .catch(() => {
        if (active) setSearchedItems(null);
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  const items = useMemo(() => {
    const base = debouncedQuery && searchedItems ? searchedItems : allItems;
    const targetRoomCode = roomFilter ? canonicalRoomToken(roomFilter) : "";

    return base.filter((it) => {
      if (typeFilter === "lost" && it.item_type !== "lost") return false;
      if (typeFilter === "found" && it.item_type !== "found") return false;
      if (typeFilter === "reunited" && it.status !== "reunited") return false;
      if (categoryFilter && Number(it.category_id) !== Number(categoryFilter)) return false;
      if (locationFilter && Number(it.location_id) !== Number(locationFilter)) return false;

      if (targetRoomCode) {
        const itemRooms = extractRoomSet(
          `${it.specific_spot || ""} ${it.title || ""} ${it.description || ""} ${(it.tags || []).join(" ")}`
        );
        if (!itemRooms.has(targetRoomCode)) return false;
      }

      if (!searchedItems && debouncedQuery) {
        const q = debouncedQuery.toLowerCase();
        const hay = `${it.title} ${it.description} ${it.specific_spot || ""} ${it.building_name || ""} ${it.color || ""} ${it.brand || ""} ${it.tagged_roll_number || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    allItems,
    searchedItems,
    debouncedQuery,
    typeFilter,
    categoryFilter,
    locationFilter,
    roomFilter
  ]);

  const refreshEverything = useCallback(
    async (overrideUser) => {
      const targetUser = overrideUser !== undefined ? overrideUser : user;
      await Promise.all([
        loadCoreData(),
        loadMatchesAndUserActivity(targetUser)
      ]);
    },
    [user, loadCoreData, loadMatchesAndUserActivity]
  );

  useEffect(() => {
    const syncIfVisible = () => {
      if (document.visibilityState === "visible") {
        refreshEverything().catch(() => {});
      }
    };
    const intervalId = setInterval(syncIfVisible, 5000);
    window.addEventListener("focus", syncIfVisible);
    document.addEventListener("visibilitychange", syncIfVisible);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", syncIfVisible);
      document.removeEventListener("visibilitychange", syncIfVisible);
    };
  }, [refreshEverything]);

  const handleSignOut = async () => {
    setExplicitlySignedOut(true);
    setStoredToken("");
    await api.logout();
    setUser(null);
    setClaims([]);
    setMyItems([]);
    setNotifications({ unreadCount: 0, items: [] });
    setNotifOpen(false);
    if (activeTab === "desk") setActiveTab("browse");
  };

  const handleOpenNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next && user && notifications.unreadCount > 0) {
      await api.markAllNotificationsRead(user.id);
      setNotifications((prev) => ({
        unreadCount: 0,
        items: prev.items.map((n) => ({ ...n, read: true }))
      }));
    }
  };

  const switchTab = (tabId) => {
    setNotifOpen(false);
    setActiveTab(tabId);
  };

  const myLostItems = useMemo(
    () => myItems.filter((i) => i.item_type === "lost" && i.status !== "reunited"),
    [myItems]
  );

  const selectedInitialItem = useMemo(() => {
    if (!selectedItemId) return null;
    const targetId = Number(selectedItemId);
    const direct =
      allItems.find((i) => Number(i.id) === targetId) ||
      myItems.find((i) => Number(i.id) === targetId);
    if (direct) return direct;

    for (const m of matches) {
      if (Number(m.lost_id) === targetId) {
        return {
          id: m.lost_id,
          reference_code: m.lost_ref,
          item_type: "lost",
          title: m.lost_title,
          description: m.lost_description,
          color: m.lost_color,
          event_date: m.lost_date,
          specific_spot: m.lost_spot,
          building_name: m.lost_building,
          status: m.lost_status,
          reporter_id: m.lost_reporter_id,
          reporter_name: m.lost_reporter_name,
          category_slug: m.category_slug,
          category_name: m.category_name
        };
      }
      if (Number(m.found_id) === targetId) {
        return {
          id: m.found_id,
          reference_code: m.found_ref,
          item_type: "found",
          title: m.found_title,
          description: m.found_description,
          color: m.found_color,
          event_date: m.found_date,
          specific_spot: m.found_spot,
          building_name: m.found_building,
          desk_location: m.found_desk,
          custody_holder: m.found_custody,
          verification_prompt: m.found_verification_prompt,
          tagged_roll_number: m.found_tagged_roll,
          status: m.found_status,
          reporter_id: m.found_reporter_id,
          category_slug: m.category_slug,
          category_name: m.category_name
        };
      }
    }
    return null;
  }, [selectedItemId, allItems, myItems, matches]);

  const preloadedMatchesForSelected = useMemo(() => {
    if (!selectedItemId) return [];
    const targetId = Number(selectedItemId);
    return matches
      .filter(
        (m) => Number(m.lost_id) === targetId || Number(m.found_id) === targetId
      )
      .map((m) => {
        const isLost = Number(m.lost_id) === targetId;
        return {
          match_id: m.match_id,
          similarity_score: m.similarity_score,
          match_reason: m.match_reason,
          counterpart_id: isLost ? m.found_id : m.lost_id,
          title: isLost ? m.found_title : m.lost_title,
          specific_spot: isLost ? m.found_spot : m.lost_spot,
          building_name: isLost ? m.found_building : m.lost_building
        };
      });
  }, [selectedItemId, matches]);

  const openReportWithType = (type, prefillObj = null) => {
    setReportInitialType(type);
    setReportPrefill(prefillObj);
    switchTab("report");
  };

  const selectedLocationObj = locations.find(
    (l) => Number(l.id) === Number(locationFilter)
  );

  return (
    <div className="min-h-screen flex flex-col bg-campus-cream text-campus-ink">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-campus-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => switchTab("browse")}
            className="flex items-center gap-2.5 text-left focus:outline-none"
          >
            <KlhCrest className="w-8 h-8 shrink-0" />
            <div className="flex items-baseline gap-2">
              <span className="font-editorial text-lg font-semibold text-campus-ink tracking-tight">
                KLH University
              </span>
              <span className="text-xs text-campus-muted hidden sm:inline">
                Lost &amp; Found
              </span>
            </div>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            <button
              type="button"
              onClick={() => switchTab("browse")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === "browse"
                  ? "bg-campus-sand text-campus-ink"
                  : "text-campus-muted hover:text-campus-ink"
              }`}
            >
              Board
            </button>
            <button
              type="button"
              onClick={() => switchTab("matches")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === "matches"
                  ? "bg-campus-sand text-campus-ink"
                  : "text-campus-muted hover:text-campus-ink"
              }`}
            >
              Matches
              {matches.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-900 font-bold">
                  {matches.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => switchTab("report")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === "report"
                  ? "bg-campus-sand text-campus-ink"
                  : "text-campus-muted hover:text-campus-ink"
              }`}
            >
              Report
            </button>
            <button
              type="button"
              onClick={() => switchTab("activity")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === "activity"
                  ? "bg-campus-sand text-campus-ink"
                  : "text-campus-muted hover:text-campus-ink"
              }`}
            >
              My Items
            </button>
            {user?.role === "staff" && (
              <button
                type="button"
                onClick={() => switchTab("desk")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                  activeTab === "desk"
                    ? "bg-campus-crimson text-white"
                    : "text-campus-crimson hover:bg-campus-crimsonSoft"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Desk
                {summary?.pending_claims > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white text-campus-crimson font-bold">
                    {summary.pending_claims}
                  </span>
                )}
              </button>
            )}
          </nav>

          <div className="flex items-center gap-2 relative">
            {user && (
              <div className="relative" ref={notifContainerRef}>
                <button
                  type="button"
                  onClick={handleOpenNotifications}
                  className="p-2 rounded-xl hover:bg-campus-sand text-campus-muted hover:text-campus-ink relative transition"
                >
                  <Bell className="w-4 h-4" />
                  {notifications.unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-campus-crimson" />
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-campus-border shadow-xl p-2.5 z-40">
                    <div className="max-h-64 overflow-y-auto divide-y divide-campus-border/60">
                      {notifications.items.length === 0 ? (
                        <div className="py-5 text-center text-xs text-campus-muted">
                          No alerts
                        </div>
                      ) : (
                        notifications.items.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              setNotifOpen(false);
                              if (n.linkTab) {
                                if (n.linkTab === "desk" && user.role !== "staff") {
                                  switchTab("activity");
                                } else {
                                  switchTab(n.linkTab);
                                }
                              }
                            }}
                            className="w-full text-left p-2.5 hover:bg-campus-cream rounded-xl transition"
                          >
                            <div className="text-xs font-semibold text-campus-ink">
                              {n.title}
                            </div>
                            <p className="text-[11px] text-campus-muted mt-0.5 line-clamp-2">
                              {n.body}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {user ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-campus-border bg-white hover:bg-campus-cream text-xs font-medium transition"
                >
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                      user.role === "staff"
                        ? "bg-campus-crimson text-white"
                        : "bg-campus-sand text-campus-ink"
                    }`}
                  >
                    {user.full_name.charAt(0)}
                  </span>
                  <span className="max-w-[95px] truncate font-semibold text-campus-ink">
                    {user.full_name.split(" ")[0]}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="p-1.5 rounded-xl text-campus-muted hover:text-campus-ink transition"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-campus-crimson hover:bg-campus-crimsonDark text-white text-xs font-semibold transition"
              >
                <User className="w-3.5 h-3.5" />
                Sign In
              </button>
            )}
          </div>
        </div>

        <div className="md:hidden flex items-center gap-1 overflow-x-auto px-4 py-2 border-t border-campus-border bg-campus-cream/70">
          {[
            { id: "browse", label: "Board" },
            { id: "matches", label: `Matches (${matches.length})` },
            { id: "report", label: "Report" },
            { id: "activity", label: "My Items" },
            ...(user?.role === "staff" ? [{ id: "desk", label: "Desk" }] : [])
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${
                activeTab === t.id
                  ? "bg-campus-crimson text-white"
                  : "text-campus-muted bg-white border border-campus-border"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-7">
        {activeTab === "browse" && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-campus-ink tracking-tight">
                  Campus Lost &amp; Found
                </h1>
                {summary && (
                  <div className="flex flex-wrap items-center gap-3 text-xs text-campus-muted mt-1.5">
                    <span>
                      <strong className="text-teal-800">{summary.active_found}</strong> at desks
                    </span>
                    <span>·</span>
                    <span>
                      <strong className="text-rose-800">{summary.active_lost}</strong> missing
                    </span>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => switchTab("matches")}
                      className="text-amber-800 hover:underline font-medium"
                    >
                      <strong>{matches.length}</strong> matches
                    </button>
                    <span>·</span>
                    <span>
                      <strong className="text-emerald-800">{summary.reunited_count}</strong> reunited
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openReportWithType("lost")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-campus-crimson hover:bg-campus-crimsonDark text-white text-xs font-semibold shadow-sm transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Lost Item
                </button>
                <button
                  type="button"
                  onClick={() => openReportWithType("found")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-campus-sand border border-campus-border text-campus-ink text-xs font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5 text-teal-700" />
                  Found Item
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-campus-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full rounded-xl border border-campus-border bg-white pl-10 pr-9 py-2.5 text-sm focus:outline-none focus:border-campus-crimson"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-campus-muted hover:text-campus-ink"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="inline-flex rounded-xl p-1 bg-white border border-campus-border">
                  {[
                    { key: "all", label: "All" },
                    { key: "lost", label: "Lost" },
                    { key: "found", label: "Found" },
                    { key: "reunited", label: "Reunited" }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTypeFilter(tab.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        typeFilter === tab.key
                          ? "bg-campus-ink text-white"
                          : "text-campus-muted hover:text-campus-ink"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowCampusMap((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition ${
                    showCampusMap || locationFilter || roomFilter
                      ? "bg-campus-crimson text-white border-campus-crimson"
                      : "bg-white text-campus-ink border-campus-border hover:bg-campus-sand"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Rooms
                </button>
              </div>
            </div>

            {showCampusMap && (
              <CampusMapCard
                locations={locations}
                items={allItems}
                selectedLocationId={locationFilter}
                activeRoomFilter={roomFilter}
                onSelectLocation={(id) => setLocationFilter(id)}
                onSelectRoomFilter={(rm) => setRoomFilter(rm)}
              />
            )}

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition ${
                  !categoryFilter
                    ? "bg-campus-ink text-white border-campus-ink"
                    : "bg-white text-campus-muted border-campus-border hover:text-campus-ink"
                }`}
              >
                All
              </button>
              {categories.map((cat) => {
                const active = Number(categoryFilter) === Number(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(active ? null : cat.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition ${
                      active
                        ? "bg-campus-ink text-white border-campus-ink"
                        : "bg-white text-campus-muted border-campus-border hover:text-campus-ink"
                    }`}
                  >
                    {getShortCategoryName(cat.slug, cat.display_name)}
                  </button>
                );
              })}

              {(roomFilter || selectedLocationObj) && (
                <button
                  type="button"
                  onClick={() => {
                    setRoomFilter("");
                    setLocationFilter(null);
                  }}
                  className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-campus-crimsonSoft text-campus-crimson text-xs font-semibold whitespace-nowrap"
                >
                  {roomFilter
                    ? /^[0-9]+$/.test(roomFilter) && !["008", "108", "301", "303"].includes(roomFilter)
                      ? `Room ${roomFilter}`
                      : ["008", "108", "301", "303"].includes(roomFilter)
                      ? `Lab ${roomFilter}`
                      : roomFilter
                    : selectedLocationObj.building_name}{" "}
                  ×
                </button>
              )}
            </div>

            {initialLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="h-44 rounded-2xl bg-white border border-campus-border animate-pulse"
                  />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="bg-white rounded-2xl border border-campus-border p-10 text-center space-y-2.5">
                <p className="text-sm font-medium text-campus-muted">No matching items found.</p>
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter("all");
                    setCategoryFilter(null);
                    setLocationFilter(null);
                    setRoomFilter("");
                    setSearchQuery("");
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-campus-sand text-campus-ink text-xs font-semibold hover:bg-campus-border transition"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => {
                  const vis = getCategoryVisual(item.category_slug);
                  const CatIcon = vis.Icon;
                  const st = getStatusMeta(item.status, item.item_type);
                  const isMyTaggedRoll = Boolean(
                    user &&
                      item.tagged_roll_number &&
                      item.tagged_roll_number.toUpperCase() === user.roll_number.toUpperCase()
                  );

                  return (
                    <article
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={`group bg-white rounded-2xl border p-4 shadow-card hover:shadow-cardHover hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between gap-3.5 ${
                        isMyTaggedRoll && item.status !== "reunited"
                          ? "border-emerald-400 ring-1 ring-emerald-200"
                          : "border-campus-border"
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div
                            className={`w-9 h-9 rounded-xl border ${vis.bg} ${vis.ring} flex items-center justify-center shrink-0`}
                          >
                            <CatIcon className={`w-4 h-4 ${vis.text}`} />
                          </div>

                          <div className="flex items-center gap-1.5">
                            {Number(item.sighting_count) > 0 && item.status !== "reunited" && (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200"
                                title="Classmate sighting note"
                              >
                                <MessageSquare className="w-3 h-3 text-teal-700" />
                                {item.sighting_count}
                              </span>
                            )}
                            {item.tagged_roll_number && item.status !== "reunited" && (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  isMyTaggedRoll
                                    ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                                    : "bg-indigo-50 text-indigo-800 border-indigo-200"
                                }`}
                                title={`Roll ${item.tagged_roll_number}`}
                              >
                                <Tag className="w-2.5 h-2.5" />
                                {isMyTaggedRoll ? "Your Roll" : item.tagged_roll_number}
                              </span>
                            )}
                            {Number(item.match_count) > 0 && item.status !== "reunited" && (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200"
                                title="Possible match found"
                              >
                                <Sparkles className="w-3 h-3 text-amber-600" />
                                {item.match_count}
                              </span>
                            )}
                            <span
                              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${st.className}`}
                            >
                              {st.label}
                            </span>
                          </div>
                        </div>

                        {item.photo_data_url && (
                          <div className="h-32 rounded-xl overflow-hidden bg-campus-cream border border-campus-border">
                            <img
                              src={item.photo_data_url}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}

                        <div>
                          <h3 className="text-[15px] font-semibold text-campus-ink group-hover:text-campus-crimson transition line-clamp-1">
                            {item.title}
                          </h3>
                          <p className="text-xs text-campus-muted mt-1 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-campus-border/60 flex items-center justify-between gap-2 text-xs text-campus-muted">
                        <span className="inline-flex items-center gap-1 font-medium text-campus-ink/90 truncate">
                          <MapPin className="w-3 h-3 text-campus-crimson shrink-0" />
                          <span className="truncate">
                            {getShortSpot(item.specific_spot, item.building_name)}
                          </span>
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.color && (
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-black/15"
                              style={{ backgroundColor: getColorSwatchHex(item.color) }}
                              title={item.color}
                            />
                          )}
                          <span>{formatFriendlyDate(item.event_date)}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "matches" && (
          <SmartMatchesView
            matches={matches}
            user={user}
            onInspectItem={(id) => setSelectedItemId(id)}
            onRequireAuth={() => setAuthModalOpen(true)}
            onDismissed={() => refreshEverything()}
          />
        )}

        {activeTab === "report" && (
          <ReportItemView
            user={user}
            categories={categories}
            locations={locations}
            initialType={reportInitialType}
            prefill={reportPrefill}
            onRequireAuth={() => setAuthModalOpen(true)}
            onReportCreated={async () => {
              setReportPrefill(null);
              await refreshEverything();
            }}
            onInspectItem={(id) => setSelectedItemId(id)}
            onBackToBrowse={() => switchTab("browse")}
          />
        )}

        {activeTab === "activity" && (
          <MyActivityView
            user={user}
            allItems={allItems}
            myItems={myItems}
            myClaims={claims}
            onRequireAuth={() => setAuthModalOpen(true)}
            onInspectItem={(id) => setSelectedItemId(id)}
            onGoReport={() => openReportWithType("lost")}
          />
        )}

        {activeTab === "desk" && user?.role === "staff" && (
          <HelpdeskView
            claims={claims}
            onRefresh={() => refreshEverything()}
            onInspectItem={(id) => setSelectedItemId(id)}
          />
        )}
      </main>

      <footer className="border-t border-campus-border/80 py-5 mt-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-campus-muted">
          <span>KLH University · Lost &amp; Found</span>
          <span>Ground Floor Reception Desk</span>
        </div>
      </footer>

      {selectedItemId && (
        <ItemDetailModal
          itemId={selectedItemId}
          initialItem={selectedInitialItem}
          preloadedMatches={preloadedMatchesForSelected}
          categories={categories}
          locations={locations}
          user={user}
          myLostItems={myLostItems}
          myClaims={claims}
          onClose={() => setSelectedItemId(null)}
          onRequireAuth={() => setAuthModalOpen(true)}
          onClaimSubmitted={() => refreshEverything()}
          onSelectAnotherItem={(otherId) => setSelectedItemId(otherId)}
          onReportFoundSimilar={(lostItem) => {
            setSelectedItemId(null);
            openReportWithType("found", {
              itemType: "found",
              categoryId: lostItem?.category_id,
              locationId: lostItem?.location_id,
              specificSpot: lostItem?.specific_spot || ""
            });
          }}
          onOpenDesk={() => {
            setSelectedItemId(null);
            switchTab("desk");
          }}
        />
      )}

      <AuthModal
        open={authModalOpen}
        demoAccounts={demoAccounts}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={async (loggedInUser) => {
          setUser(loggedInUser);
          await refreshEverything(loggedInUser);
          if (loggedInUser.role === "staff" && activeTab === "browse") {
            switchTab("desk");
          } else if (loggedInUser.role !== "staff" && activeTab === "desk") {
            switchTab("browse");
          }
        }}
      />
    </div>
  );
}
