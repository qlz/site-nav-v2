const ENV = window.ENV || {};
const SUPABASE_URL = ENV.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY || "";
const ROUTES_TABLE = "routes";
const TAXONOMY_TABLE = "taxonomy";
const CATEGORIES_TABLE = "categories";
const ROUTE_CATEGORIES_TABLE = "route_categories";
const UPLOAD_BUCKET = "uploads";
const DEV_PASSWORD = "devv";

const supabaseReady =
  SUPABASE_URL.includes("supabase.co") &&
  !SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  !SUPABASE_ANON_KEY.includes("YOUR_");
const sb = supabaseReady
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const devKey = "jenn:portfolio-dev-mode:v1";
const pendingKey = "jenn:portfolio-pending-review:v3";
const preferredKey = "jenn:portfolio-preferred-versions:v1";
/** Hash route shape used for GitHub Pages deep links: #/item/<id> */
const ITEM_HASH_RE = /^#\/item\/([^/?#]+)/i;

const state = {
  destinations: [],
  groups: [],
  filtered: [],
  activeFilter: "All",
  search: "",
  selectedId: null,
  selectedGroupId: null,
  pendingReview: [],
  draggedGroupId: null,
  tags: [],
  preferred: {},
  /** Avoid feedback loops when we update location.hash ourselves */
  syncingRoute: false,
};

const el = {
  body: document.body,
  siteGrid: document.getElementById("siteGrid"),
  routeCount: document.getElementById("routeCount"),
  searchInput: document.getElementById("searchInput"),
  filters: document.getElementById("filters"),
  emptyState: document.getElementById("emptyState"),
  banner: document.getElementById("statusBanner"),
  showcaseModeBtn: document.getElementById("showcaseModeBtn"),
  devModeBtn: document.getElementById("devModeBtn"),
  modeStatus: document.getElementById("modeStatus"),
  addForm: document.getElementById("addForm"),
  newTitle: document.getElementById("newTitle"),
  newUrl: document.getElementById("newUrl"),
  newCategory: document.getElementById("newCategory"),
  newDescription: document.getElementById("newDescription"),
  newStatus: document.getElementById("newStatus"),
  newImageUrl: document.getElementById("newImageUrl"),
  newImageFile: document.getElementById("newImageFile"),
  newTopic: document.getElementById("newTopic"),
  newSubtopic: document.getElementById("newSubtopic"),
  topbarUploadInput: document.getElementById("topbarUploadInput"),
  panelUploadInput: document.getElementById("panelUploadInput"),
  viewerTitle: document.getElementById("viewerTitle"),
  viewerAddress: document.getElementById("viewerAddress"),
  viewerFrame: document.getElementById("viewerFrame"),
  openOriginal: document.getElementById("openOriginal"),
  copyEntryLink: document.getElementById("copyEntryLink"),
  hideViewerChrome: document.getElementById("hideViewerChrome"),
  backToNavigator: document.getElementById("backToNavigator"),
  editModal: document.getElementById("editModal"),
  editForm: document.getElementById("editForm"),
  editName: document.getElementById("editName"),
  editUrl: document.getElementById("editUrl"),
  editStatus: document.getElementById("editStatus"),
  editDescription: document.getElementById("editDescription"),
  editCategories: document.getElementById("editCategories"),
  editTopic: document.getElementById("editTopic"),
  editSubtopic: document.getElementById("editSubtopic"),
  editImageUrl: document.getElementById("editImageUrl"),
  editImageFile: document.getElementById("editImageFile"),
  editType: document.getElementById("editType"),
  deleteEntryBtn: document.getElementById("deleteEntryBtn"),
  categoryModal: document.getElementById("categoryModal"),
  categoryForm: document.getElementById("categoryForm"),
  categoryNameInput: document.getElementById("categoryNameInput"),
  categoryList: document.getElementById("categoryList"),
  reviewModal: document.getElementById("reviewModal"),
  reviewList: document.getElementById("reviewList"),
  acceptSuggestionsBtn: document.getElementById("acceptSuggestionsBtn"),
  savePlacementsBtn: document.getElementById("savePlacementsBtn"),
  reviewLaterBtn: document.getElementById("reviewLaterBtn"),
  cardTemplate: document.getElementById("cardTemplate"),
};

init();

async function init() {
  bindEvents();
  setDevMode(localStorage.getItem(devKey) === "true", { silent: true });
  state.preferred = readJSON(preferredKey, {});
  await loadDestinations();
  await loadTags();
  loadPendingReview();
  rebuildGroups();
  applyFilters();
  await applyRouteFromLocation();
  if (!supabaseReady)
    showBanner(
      "Supabase is not connected yet. Run locally with config.js, or configure GitHub Pages secrets.",
    );
}

function bindEvents() {
  el.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      el.searchInput.focus();
    }
    if (event.key === "Escape") closeAllModals();
  });

  document.querySelectorAll("[data-jump]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.jump);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );

  document
    .querySelectorAll("[data-action]")
    .forEach((btn) =>
      btn.addEventListener("click", () => handleAction(btn.dataset.action)),
    );

  el.showcaseModeBtn.addEventListener("click", () => setDevMode(false));
  el.devModeBtn.addEventListener("click", () => {
    if (document.body.classList.contains("dev-mode")) return;
    const pw = prompt("Enter development password");
    if (pw === DEV_PASSWORD) setDevMode(true);
    else if (pw !== null) showBanner("Incorrect password.");
  });

  el.addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!sb) {
      showBanner(
        "Supabase is not configured. Add your Supabase URL and anon key before saving.",
      );
      return;
    }
    const title = el.newTitle.value.trim();
    const topic = el.newTopic.value.trim() || firstTopic() || "Portfolio";
    const subtopic = el.newSubtopic.value.trim() || "General";
    const tags = cleanTags([
      topic,
      subtopic,
      ...parseList(el.newCategory.value),
    ]);
    const imageFile = el.newImageFile.files && el.newImageFile.files[0];
    let imageUrl = el.newImageUrl.value.trim();
    let imagePath = "";
    if (imageFile) {
      const uploaded = await uploadPreviewImage(imageFile);
      imageUrl = uploaded.image_url || imageUrl;
      imagePath = uploaded.image_path || "";
    }
    const item = normalizeDestination({
      id: uid(),
      mode: "url",
      title,
      description: el.newDescription.value || "Saved website link.",
      address: el.newUrl.value,
      url: el.newUrl.value,
      type: "Live Links",
      topic,
      subtopic,
      group_label: title,
      group_id: slugify(title),
      classification_status: "preferred",
      manual_classification: true,
      website_status: el.newStatus.value || "working",
      image_url: imageUrl,
      image_path: imagePath,
      tags,
      uploaded_at: new Date().toISOString(),
      preview: imageUrl
        ? "image"
        : previewFromText(title + " " + topic + " " + subtopic),
    });
    state.destinations.push(item);
    state.preferred[item.group_id] = item.id;
    await persistAll();
    el.addForm.reset();
    rebuildGroups();
    applyFilters();
    showBanner("Saved.");
  });

  el.topbarUploadInput.addEventListener("change", (event) =>
    uploadHtmlFiles(event.target.files),
  );
  el.panelUploadInput.addEventListener("change", (event) =>
    uploadHtmlFiles(event.target.files),
  );
  el.backToNavigator.addEventListener("click", closeViewer);
  el.hideViewerChrome.addEventListener("click", hideViewerChrome);
  el.copyEntryLink.addEventListener("click", () => copySelectedEntryLink());
  el.openOriginal.addEventListener("click", async (event) => {
    event.preventDefault();
    const item = state.destinations.find((x) => x.id === state.selectedId);
    if (!item) return;
    await openRenderedOriginal(item);
  });
  window.addEventListener("hashchange", () => {
    if (state.syncingRoute) return;
    applyRouteFromLocation();
  });

  el.editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const group = getGroup(state.selectedGroupId);
    const item = state.destinations.find((x) => x.id === state.selectedId);
    if (!group || !item) return;

    const imageFile = el.editImageFile.files && el.editImageFile.files[0];
    if (imageFile) {
      const uploaded = await uploadPreviewImage(imageFile, item.id);
      if (uploaded.image_url) item.image_url = uploaded.image_url;
      if (uploaded.image_path) item.image_path = uploaded.image_path;
    }

    const title = el.editName.value.trim();
    const topic = el.editTopic.value.trim() || item.topic;
    const subtopic = el.editSubtopic.value.trim() || item.subtopic;
    const tags = cleanTags([
      topic,
      subtopic,
      ...parseList(el.editCategories.value),
    ]);
    const nextGroupId = slugify(title || item.group_label || item.title);
    const oldGroupId = item.group_id;

    group.versions.forEach((version) => {
      version.group_label = title || version.group_label;
      version.group_id = nextGroupId;
      version.topic = topic;
      version.subtopic = subtopic;
      version.tags = tags;
      version.category = tags[0] || topic;
      version.group_tags = tags;
      version.manual_classification = true;
      version.reviewed_at = new Date().toISOString();
    });

    item.title = title || item.title;
    item.url = el.editUrl.value.trim() || item.url;
    item.address = item.url;
    item.type = el.editType.value.trim() || item.type;
    item.description = el.editDescription.value.trim();
    item.website_status = el.editStatus.value || "working";
    item.image_url = el.editImageUrl.value.trim() || item.image_url || "";
    item.renamed_at = new Date().toISOString();

    delete state.preferred[oldGroupId];
    state.preferred[nextGroupId] = item.id;
    markPreferred(nextGroupId, item.id);
    await persistAll();
    closeAllModals();
    rebuildGroups();
    applyFilters();
    showBanner("Saved.");
  });

  el.deleteEntryBtn.addEventListener("click", deleteSelectedEntry);

  el.categoryForm.addEventListener("submit", (event) => event.preventDefault());
  document
    .querySelectorAll("[data-close-modal]")
    .forEach((btn) =>
      btn.addEventListener("click", () => closeModal(btn.dataset.closeModal)),
    );
  el.acceptSuggestionsBtn.addEventListener("click", acceptSuggestions);
  el.savePlacementsBtn.addEventListener("click", savePlacements);
  el.reviewLaterBtn.addEventListener("click", () => closeModal("reviewModal"));
}

async function loadDestinations() {
  state.destinations = [];

  if (!sb) {
    showBanner(
      "Supabase is not configured. Add your Supabase URL and anon key in config.js.",
    );
    return;
  }

  try {
    const { data, error } = await sb
      .from(ROUTES_TABLE)
      .select("*")
      .order("uploaded_at", { ascending: false });

    if (error) throw error;

    state.destinations = (data || []).map(normalizeDestination);
    await loadRouteTags();
  } catch (error) {
    console.error(error);
    showBanner("Unable to load projects from Supabase.");
    state.destinations = [];
  }
}

async function loadRouteTags() {
  if (!sb || !state.destinations.length) return;
  const ids = state.destinations.map((item) => item.id);
  const { data, error } = await sb
    .from(ROUTE_CATEGORIES_TABLE)
    .select("route_id, category")
    .in("route_id", ids);
  if (error) throw error;
  const byRoute = new Map();
  (data || []).forEach((row) => {
    if (!byRoute.has(row.route_id)) byRoute.set(row.route_id, []);
    byRoute.get(row.route_id).push(row.category);
  });
  state.destinations.forEach((item) => {
    const tags = byRoute.get(item.id);
    if (tags && tags.length) item.tags = cleanTags(tags);
  });
}

async function loadTags() {
  state.tags = cleanTags(
    state.destinations.flatMap(
      (item) => item.tags || [item.topic, item.subtopic, item.category],
    ),
  );
  if (sb) {
    try {
      const { data } = await sb
        .from(TAXONOMY_TABLE)
        .select("topic, subtopic")
        .order("topic", { ascending: true });
      if (data && data.length)
        state.tags = cleanTags([
          ...state.tags,
          ...data.flatMap((row) => [row.topic, row.subtopic]),
        ]);
    } catch (error) {
      console.warn(error);
    }
  }
  renderTagOptions();
}

function loadPendingReview() {
  state.pendingReview = readJSON(pendingKey, []);
}

function setDevMode(enabled, options = {}) {
  document.body.classList.toggle("dev-mode", enabled);
  el.showcaseModeBtn.classList.toggle("active", !enabled);
  el.devModeBtn.classList.toggle("active", enabled);
  el.modeStatus.textContent = enabled ? "Mode: Development" : "Mode: Showcase";
  localStorage.setItem(devKey, String(enabled));
  if (!options.silent)
    showBanner(
      enabled ? "Development mode enabled." : "Showcase mode enabled.",
    );
  if (state.groups.length) renderGrid();
}

function rebuildGroups() {
  const byGroup = new Map();
  state.destinations.forEach((item) => {
    item = normalizeDestination(item);
    if (!byGroup.has(item.group_id)) byGroup.set(item.group_id, []);
    byGroup.get(item.group_id).push(item);
  });
  state.groups = [...byGroup.entries()]
    .map(([groupId, versions]) => {
      versions.sort(
        (a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0),
      );
      const preferredId =
        state.preferred[groupId] ||
        versions.find((v) => v.classification_status === "preferred")?.id;
      const active = versions.find((v) => v.id === preferredId) || versions[0];
      return { id: groupId, versions, active, latest: versions[0] };
    })
    .sort(
      (a, b) =>
        new Date(b.active.uploaded_at || 0) -
        new Date(a.active.uploaded_at || 0),
    );
  state.destinations = state.destinations.map(normalizeDestination);
}

function buildFilters() {
  const counts = new Map();
  state.groups.forEach((group) => {
    const topic = group.active.topic || "Portfolio";
    counts.set(topic, (counts.get(topic) || 0) + 1);
  });
  const topics = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([topic]) => topic);
  const filters = ["All", ...topics].slice(0, 5);
  if (!filters.includes(state.activeFilter)) state.activeFilter = "All";
  el.filters.innerHTML = "";
  filters.forEach((filter) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (state.activeFilter === filter ? " active" : "");
    btn.textContent = filter;
    btn.addEventListener("click", () => {
      state.activeFilter = filter;
      applyFilters();
    });
    el.filters.appendChild(btn);
  });
}

function applyFilters() {
  rebuildGroups();
  buildFilters();
  const query = state.search;
  state.filtered = state.groups
    .filter((group) => {
      const item = group.active;
      const matchesFilter =
        state.activeFilter === "All" || item.topic === state.activeFilter;
      const haystack = [
        item.title,
        item.group_label,
        item.topic,
        item.subtopic,
        ...(item.tags || []),
        item.address,
        item.url,
        item.description,
        statusLabel(item.website_status),
        ...group.versions.map((v) => v.source_name || v.title),
      ]
        .join(" ")
        .toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    })
    .sort(
      (a, b) =>
        new Date(b.active.uploaded_at || 0) -
        new Date(a.active.uploaded_at || 0),
    );
  renderGrid();
}

function renderGrid() {
  el.routeCount.textContent = state.groups.length;
  el.siteGrid.innerHTML = "";
  el.emptyState.classList.toggle("visible", state.filtered.length === 0);

  state.filtered.forEach((group) => {
    const item = group.active;
    const node = el.cardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.dataset.groupId = group.id;
    node.draggable = document.body.classList.contains("dev-mode");
    node.style.cursor = "pointer";

    const previewEl = node.querySelector(".preview");
    previewEl.className =
      "preview " + (item.image_url ? "has-image" : item.preview || "portfolio");
    if (item.image_url)
      previewEl.style.setProperty(
        "--image-url",
        `url('${cssUrl(item.image_url)}')`,
      );

    node.querySelector(".preview h3").textContent =
      item.group_label || item.title;
    node.querySelector(".preview p").textContent = item.description || item.url;
    const meta = node.querySelector(".meta");
    meta.textContent = item.topic || item.type || "Project";
    meta.classList.toggle("web", /web|design/i.test(item.topic || ""));
    meta.classList.toggle(
      "personal",
      /personal|ai|learning/i.test(item.topic || ""),
    );
    meta.classList.toggle("ui", /ui|tool/i.test(item.topic || ""));

    const statusEl = node.querySelector(".status-dot");
    statusEl.dataset.status = item.website_status || "working";
    statusEl.title = statusLabel(item.website_status);
    node.querySelector(".card-title").textContent =
      item.group_label || item.title;
    node.querySelector(".card-desc").textContent = item.description || item.url;
    renderTags(
      node.querySelector(".tag-row"),
      cleanTags([item.topic, item.subtopic, ...(item.tags || [])]),
    );

    const versionBadge = document.createElement("span");
    versionBadge.className = "tag-pill";
    versionBadge.textContent = `${group.versions.length} version${group.versions.length === 1 ? "" : "s"}`;
    node.querySelector(".tag-row").appendChild(versionBadge);

    node.addEventListener("click", (event) => {
      if (event.target.closest("button, a, input, select, textarea")) return;
      openViewer(item.id);
    });
    node.querySelector(".card-title").addEventListener("click", (event) => {
      event.stopPropagation();
      openViewer(item.id);
    });
    node.querySelector(".icon-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      openRenderedOriginal(item);
    });
    node.querySelector(".more").addEventListener("click", (event) => {
      event.stopPropagation();
      openEdit(group.id);
    });

    node.addEventListener("dragstart", (event) => {
      if (!document.body.classList.contains("dev-mode")) {
        event.preventDefault();
        return;
      }
      state.draggedGroupId = group.id;
      node.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
    });
    node.addEventListener("dragend", () => node.classList.remove("dragging"));
    node.addEventListener("dragover", (event) => {
      if (!document.body.classList.contains("dev-mode")) return;
      event.preventDefault();
      node.classList.add("drop-hint");
    });
    node.addEventListener("dragleave", () =>
      node.classList.remove("drop-hint"),
    );
    node.addEventListener("drop", async (event) => {
      event.preventDefault();
      node.classList.remove("drop-hint");
      if (!document.body.classList.contains("dev-mode")) return;
      await reclassifyByDrop(state.draggedGroupId, group.id);
    });
    el.siteGrid.appendChild(node);
  });
}

async function reclassifyByDrop(sourceGroupId, targetGroupId) {
  if (!sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId)
    return;
  const source = getGroup(sourceGroupId);
  const target = getGroup(targetGroupId);
  if (!source || !target) return;
  const targetItem = target.active;
  source.versions.forEach((version) => {
    version.topic = targetItem.topic;
    version.subtopic = targetItem.subtopic;
    version.tags = cleanTags([
      targetItem.topic,
      targetItem.subtopic,
      ...(targetItem.tags || []),
    ]);
    version.category = version.tags[0] || targetItem.topic;
    version.manual_classification = true;
    version.reviewed_at = new Date().toISOString();
  });
  await persistAll();
  applyFilters();
}

async function handleAction(action) {
  switch (action) {
    case "backTop":
      window.scrollTo({ top: 0, behavior: "smooth" });
      break;
    case "focusSearch":
      el.searchInput.focus();
      break;
    case "focusAdd":
      el.newTitle.focus();
      break;
    case "upload":
      el.topbarUploadInput.click();
      break;
    case "openSelected":
      openViewer(state.selectedId || state.filtered[0]?.active?.id);
      break;
    case "renameSelected":
    case "editSelected":
      openEdit(state.selectedGroupId || state.filtered[0]?.id);
      break;
    case "manageCategories":
      openTopicIndex();
      break;
    case "review":
      openReviewModal();
      break;
    case "sync":
      await syncSupabase();
      break;
    case "clearState":
      await clearState();
      break;
  }
}

/**
 * Opens an entry in the embedded viewer and updates the shareable hash URL.
 * @param {string} id Destination id
 * @param {{ fromRoute?: boolean, openExternalLiveLink?: boolean }} [options]
 */
async function openViewer(id, options = {}) {
  const item = state.destinations.find((x) => x.id === id);
  if (!item) {
    showBanner("Select a project first.");
    return;
  }

  const group = getGroup(item.group_id);
  state.selectedId = item.id;
  state.selectedGroupId = item.group_id;
  el.viewerTitle.textContent = item.group_label || item.title;
  el.viewerAddress.textContent = [item.topic, item.subtopic, versionLabel(item)]
    .filter(Boolean)
    .join(" · ");
  el.openOriginal.href = item.url || "#";
  setItemRoute(item.id);
  // Always restore the top bar when opening an entry.
  document.body.classList.remove("viewer-chrome-hidden");

  // Live links: keep a unique in-app URL, and optionally open the destination.
  if (!isHtmlLike(item)) {
    const shouldOpenExternal =
      options.openExternalLiveLink !== false && !options.fromRoute;
    if (shouldOpenExternal) {
      window.open(item.url, "_blank", "noopener");
    }
    el.viewerFrame.src = "about:blank";
    el.viewerFrame.srcdoc = liveLinkInterstitial(item);
    item.last_accessed_at = new Date().toISOString();
    renderViewerVersionPicker(group, item.id);
    persistAll({ skipRemoteLocalOnly: true });
    document.body.classList.add("viewer-open");
    return;
  }

  await loadViewerContent(item);
  item.last_accessed_at = new Date().toISOString();
  renderViewerVersionPicker(group, item.id);
  persistAll({ skipRemoteLocalOnly: true });
  document.body.classList.add("viewer-open");
}

function renderViewerVersionPicker(group, activeId) {
  const actions = document.querySelector(".viewer-actions");
  actions
    .querySelectorAll(".version-select, .version-note")
    .forEach((x) => x.remove());
  if (!group || group.versions.length < 2) return;
  const select = document.createElement("select");
  select.className = "version-select";
  select.setAttribute("aria-label", "Project version");
  group.versions.forEach((version) => {
    const option = document.createElement("option");
    option.value = version.id;
    option.textContent = versionLabel(version);
    option.selected = version.id === activeId;
    select.appendChild(option);
  });
  select.addEventListener("change", async () => {
    const next = state.destinations.find((x) => x.id === select.value);
    if (!next) return;
    state.preferred[group.id] = next.id;
    markPreferred(group.id, next.id);
    await persistAll();
    openViewer(next.id);
    applyFilters();
  });
  actions.prepend(select);
}

/**
 * Leaves viewer mode and clears the item hash route.
 */
function closeViewer() {
  document.body.classList.remove("viewer-open", "viewer-chrome-hidden");
  el.viewerFrame.src = "about:blank";
  el.viewerFrame.srcdoc = "";
  clearItemRoute();
}

/**
 * Returns the shareable GitHub Pages URL for an entry.
 * @param {string} id
 * @returns {string}
 */
function entryPermalink(id) {
  const url = new URL(window.location.href);
  url.hash = `#/item/${encodeURIComponent(id)}`;
  return url.toString();
}

/**
 * Writes `#/item/<id>` without triggering a recursive hashchange handler.
 * @param {string} id
 */
function setItemRoute(id) {
  const nextHash = `#/item/${encodeURIComponent(id)}`;
  if (location.hash === nextHash) return;
  state.syncingRoute = true;
  location.hash = nextHash;
  queueMicrotask(() => {
    state.syncingRoute = false;
  });
}

/**
 * Clears the item hash when returning to the navigator.
 */
function clearItemRoute() {
  if (!ITEM_HASH_RE.test(location.hash || "")) return;
  state.syncingRoute = true;
  const { pathname, search } = window.location;
  history.pushState("", document.title, `${pathname}${search}`);
  queueMicrotask(() => {
    state.syncingRoute = false;
  });
}

/**
 * Reads the current hash and opens the matching entry if present.
 */
async function applyRouteFromLocation() {
  const match = (location.hash || "").match(ITEM_HASH_RE);
  if (!match) {
    if (document.body.classList.contains("viewer-open")) {
      document.body.classList.remove("viewer-open");
      el.viewerFrame.src = "about:blank";
      el.viewerFrame.srcdoc = "";
    }
    return;
  }

  const id = decodeURIComponent(match[1]);
  const item = state.destinations.find((x) => x.id === id);
  if (!item) {
    showBanner("That shareable link does not match a saved entry.");
    clearItemRoute();
    return;
  }

  await openViewer(item.id, { fromRoute: true, openExternalLiveLink: false });
}

/**
 * Copies the selected entry's permalink to the clipboard.
 */
async function copySelectedEntryLink() {
  if (!state.selectedId) {
    showBanner("Open an entry first to copy its link.");
    return;
  }
  const permalink = entryPermalink(state.selectedId);
  try {
    await navigator.clipboard.writeText(permalink);
    showBanner("Shareable link copied.");
  } catch (error) {
    console.warn(error);
    window.prompt("Copy this shareable link:", permalink);
  }
}

/**
 * Dismisses the viewer top bar for a full-bleed preview.
 * The bar comes back the next time an entry is opened.
 */
function hideViewerChrome() {
  document.body.classList.add("viewer-chrome-hidden");
}

/**
 * Builds a readable landing page for live links opened via a unique URL.
 * @param {object} item
 * @returns {string}
 */
function liveLinkInterstitial(item) {
  const title = escapeHTML(item.group_label || item.title || "Untitled");
  const description = escapeHTML(item.description || "Live website link");
  const url = escapeAttr(item.url || "#");
  const urlText = escapeHTML(item.url || "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: Georgia, 'Times New Roman', serif;
      color: #171513;
      background: linear-gradient(135deg, #fbfaf8 0%, #f5f1eb 100%);
      padding: 24px;
    }
    .card {
      width: min(560px, 100%);
      background: rgba(255,255,255,.9);
      border: 1px solid rgba(28,24,20,.12);
      border-radius: 20px;
      padding: 28px;
      box-shadow: 0 18px 50px rgba(40,34,28,.08);
    }
    h1 { margin: 0 0 10px; font-size: 34px; letter-spacing: -.04em; }
    p { margin: 0 0 18px; color: #756f68; line-height: 1.55; font-family: system-ui, sans-serif; }
    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 42px;
      padding: 0 16px;
      border-radius: 999px;
      background: #171513;
      color: #fffefd;
      text-decoration: none;
      font-family: system-ui, sans-serif;
      font-weight: 700;
    }
    .url { word-break: break-all; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${description}</p>
    <p class="url">${urlText}</p>
    <a href="${url}" target="_blank" rel="noopener">Open website</a>
  </div>
</body>
</html>`;
}

async function loadViewerContent(item) {
  el.viewerFrame.src = "about:blank";
  el.viewerFrame.srcdoc = "";

  if (!isHtmlLike(item)) {
    el.viewerFrame.src = item.url;
    return;
  }

  try {
    const html = await fetchHtmlDocument(item.url);
    el.viewerFrame.srcdoc = html;
  } catch (error) {
    console.warn(error);
    el.viewerFrame.src = item.url;
  }
}

/**
 * Opens an HTML upload as a rendered page in a new tab (no viewer chrome).
 * Storage URLs often serve HTML as text/plain, so we re-open via a text/html blob.
 * @param {object} item Destination item to open.
 */
async function openRenderedOriginal(item) {
  if (!item?.url) return;

  if (!isHtmlLike(item)) {
    window.open(item.url, "_blank", "noopener");
    return;
  }

  try {
    const html = await fetchHtmlDocument(item.url);
    const blobUrl = URL.createObjectURL(
      new Blob([html], { type: "text/html" }),
    );
    window.open(blobUrl, "_blank", "noopener");
    // Keep the blob alive long enough for the new tab to load.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (error) {
    console.warn(error);
    showBanner("Could not open the original HTML page.");
  }
}

/**
 * Fetches HTML text from a URL and rejects empty responses.
 * @param {string} url Public URL of the HTML document.
 * @returns {Promise<string>}
 */
async function fetchHtmlDocument(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Failed to fetch HTML (${response.status})`);
  const html = await response.text();
  if (!html.trim()) throw new Error("Empty HTML response");
  return html;
}

function openEdit(groupId) {
  if (!document.body.classList.contains("dev-mode")) {
    showBanner("Turn on development mode to edit.");
    return;
  }
  const group = getGroup(groupId);
  if (!group) {
    showBanner("Select a project first.");
    return;
  }
  const item = group.active;
  state.selectedGroupId = group.id;
  state.selectedId = item.id;

  el.editName.value = item.group_label || item.title || "";
  el.editUrl.value = item.url || "";
  el.editStatus.value = item.website_status || "working";
  el.editDescription.value = item.description || "";
  el.editCategories.value = cleanTags(
    item.tags || [item.topic, item.subtopic],
  ).join(", ");
  el.editTopic.value = item.topic || "";
  el.editSubtopic.value = item.subtopic || "";
  el.editImageUrl.value = item.image_url || "";
  el.editImageFile.value = "";
  el.editType.value = item.type || "";
  ensureEditVersionPicker(group, item.id);
  openModal("editModal");
  setTimeout(() => el.editName.focus(), 60);
}

function ensureEditVersionPicker(group, activeId) {
  let wrapper = document.getElementById("editVersionWrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.id = "editVersionWrapper";
    wrapper.className = "field";
    wrapper.style.marginTop = "12px";
    wrapper.innerHTML =
      '<label for="editVersionSelect">Route version</label><select id="editVersionSelect" class="version-select" style="border-radius:10px;max-width:none;width:100%;"></select>';
    el.editForm.insertBefore(
      wrapper,
      el.editForm.querySelector(".modal-actions"),
    );
  }
  const select = document.getElementById("editVersionSelect");
  select.innerHTML = "";
  group.versions.forEach((version) => {
    const option = document.createElement("option");
    option.value = version.id;
    option.textContent = versionLabel(version);
    option.selected = version.id === activeId;
    select.appendChild(option);
  });
  select.onchange = () => {
    const next = state.destinations.find((x) => x.id === select.value);
    if (!next) return;
    state.selectedId = next.id;
    el.editUrl.value = next.url || "";
    el.editStatus.value = next.website_status || "working";
    el.editDescription.value = next.description || "";
    el.editImageUrl.value = next.image_url || "";
    el.editType.value = next.type || "";
  };
}

function openTopicIndex() {
  renderTopicIndex();
  openModal("categoryModal");
}

function renderTopicIndex() {
  el.categoryList.innerHTML = "";
  const topics = cleanTags(
    state.groups.map((group) => group.active.topic),
  ).slice(0, 5);
  topics.forEach((topic) => {
    const token = document.createElement("span");
    token.className = "category-token";
    token.innerHTML = `<span>${escapeHTML(topic)}</span>`;
    el.categoryList.appendChild(token);
  });
  if (!el.categoryList.children.length)
    el.categoryList.textContent = "No topics yet.";
}

async function uploadHtmlFiles(fileList) {
  if (!document.body.classList.contains("dev-mode")) {
    showBanner("Turn on development mode to upload HTML.");
    return;
  }
  const files = [...fileList].filter((file) => /\.html?$/i.test(file.name));
  if (!files.length) {
    showBanner("Choose one or more .html files.");
    return;
  }
  if (!sb) {
    showBanner(
      "Supabase is not configured. Add your Supabase URL and anon key before uploading.",
    );
    return;
  }

  const created = [];
  for (const file of files) {
    const suggestion = suggestClassification(file.name);
    const id = uid();
    const groupId = projectGroupId(file.name);
    const filePath = `${groupId}/${id}-${file.name.replace(/[^a-z0-9._-]/gi, "-")}`;
    let publicUrl = "";
    try {
      const { error: uploadError } = await sb.storage
        .from(UPLOAD_BUCKET)
        .upload(filePath, file, {
          contentType: "text/html",
          metadata: { mimetype: "text/html", source_name: file.name },
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { data: publicData } = sb.storage
        .from(UPLOAD_BUCKET)
        .getPublicUrl(filePath);
      publicUrl = publicData.publicUrl;
    } catch (error) {
      console.warn(error);
      showBanner(
        `Could not upload ${file.name} to Supabase Storage. No local fallback was saved.`,
      );
      continue;
    }

    const existingGroup = state.destinations.find(
      (x) => x.group_id === groupId,
    );
    const groupLabel =
      existingGroup?.group_label || cleanProjectName(file.name);
    const item = normalizeDestination({
      id,
      mode: "upload",
      type: "HTML Files",
      title: cleanName(file.name),
      description: existingGroup?.description || "Uploaded HTML project.",
      website_status: "under_construction",
      address: publicUrl,
      url: publicUrl,
      source_name: file.name,
      file_path: filePath,
      topic: existingGroup?.topic || suggestion.topic,
      subtopic: existingGroup?.subtopic || suggestion.subtopic,
      group_label: groupLabel,
      group_id: groupId,
      tags: existingGroup?.tags || [suggestion.topic, suggestion.subtopic],
      category: suggestion.topic,
      classification_status: "version",
      manual_classification: false,
      uploaded_at: new Date().toISOString(),
      preview: suggestion.preview,
      local_only: false,
      original_name: file.name,
    });
    state.destinations.push(item);
    state.pendingReview.push(item);
    created.push(item);
  }

  writeJSON(pendingKey, state.pendingReview);
  await persistAll({ skipRemoteLocalOnly: true });
  rebuildGroups();
  applyFilters();
  el.topbarUploadInput.value = "";
  el.panelUploadInput.value = "";
  if (created.length) openReviewModal();
  showBanner(
    `${created.length} upload${created.length === 1 ? "" : "s"} added.`,
  );
}

function suggestClassification(fileName) {
  const name = fileName.toLowerCase();
  if (name.includes("matcha"))
    return { topic: "Matcha", subtopic: "Tracker", preview: "matcha" };
  if (
    name.includes("ai") ||
    name.includes("llm") ||
    name.includes("genai") ||
    name.includes("chatbot")
  )
    return { topic: "AI Learning", subtopic: "Experiment", preview: "dark" };
  if (name.includes("japanese") || name.includes("flash"))
    return { topic: "Learning", subtopic: "Japanese", preview: "flash" };
  if (name.includes("workout") || name.includes("fitness"))
    return { topic: "Fitness", subtopic: "Workout", preview: "workout" };
  if (name.includes("smoothie"))
    return { topic: "Food", subtopic: "Smoothie", preview: "smoothie" };
  if (name.includes("navigator") || name.includes("library"))
    return { topic: "Tools", subtopic: "Navigator", preview: "dark" };
  if (name.includes("travel"))
    return { topic: "Travel", subtopic: "Guide", preview: "travel" };
  if (name.includes("check"))
    return {
      topic: "Productivity",
      subtopic: "Checklist",
      preview: "checklist",
    };
  return {
    topic: firstTopic() || "Portfolio",
    subtopic: "General",
    preview: "portfolio",
  };
}

function openReviewModal() {
  if (!document.body.classList.contains("dev-mode")) {
    showBanner("Turn on development mode to organize uploads.");
    return;
  }
  renderReviewList();
  openModal("reviewModal");
}

function renderReviewList() {
  el.reviewList.innerHTML = "";
  if (!state.pendingReview.length) {
    el.reviewList.innerHTML = "<p>No uploads are waiting for review.</p>";
    return;
  }
  state.pendingReview.forEach((item) => {
    const row = document.createElement("div");
    row.className = "review-item";
    row.dataset.id = item.id;
    row.innerHTML = `
          <strong>${escapeHTML(item.title)}</strong>
          <div class="review-grid">
            <label class="field"><span>Topic</span><input data-review-field="topic" value="${escapeAttr(item.topic)}"></label>
            <label class="field"><span>Subtopic</span><input data-review-field="subtopic" value="${escapeAttr(item.subtopic)}"></label>
            <label class="field"><span>Tags</span><input data-review-field="tags" value="${escapeAttr(cleanTags(item.tags || [item.topic, item.subtopic]).join(", "))}"></label>
          </div>
        `;
    el.reviewList.appendChild(row);
  });
}

function acceptSuggestions() {
  state.pendingReview.forEach((item) => {
    const suggestion = suggestClassification(item.original_name || item.title);
    item.topic = suggestion.topic;
    item.subtopic = suggestion.subtopic;
    item.tags = cleanTags([suggestion.topic, suggestion.subtopic]);
    item.preview = suggestion.preview;
  });
  renderReviewList();
}

async function savePlacements() {
  [...el.reviewList.querySelectorAll(".review-item")].forEach((row) => {
    const item = state.destinations.find((x) => x.id === row.dataset.id);
    if (!item) return;
    const topic =
      row.querySelector('[data-review-field="topic"]').value.trim() ||
      item.topic;
    const subtopic =
      row.querySelector('[data-review-field="subtopic"]').value.trim() ||
      item.subtopic;
    const tags = parseList(
      row.querySelector('[data-review-field="tags"]').value,
    );
    item.topic = topic;
    item.subtopic = subtopic;
    item.tags = cleanTags([topic, subtopic, ...tags]);
    item.category = item.tags[0] || topic;
    item.manual_classification = true;
    item.classification_status = "reviewed";
    item.reviewed_at = new Date().toISOString();
  });
  state.pendingReview = [];
  writeJSON(pendingKey, state.pendingReview);
  await persistAll({ skipRemoteLocalOnly: true });
  closeModal("reviewModal");
  rebuildGroups();
  applyFilters();
  showBanner("Saved.");
}

async function deleteSelectedEntry() {
  if (!document.body.classList.contains("dev-mode")) {
    showBanner("Turn on development mode to delete.");
    return;
  }

  const item = state.destinations.find((x) => x.id === state.selectedId);
  if (!item) {
    showBanner("Select a project first.");
    return;
  }

  const label = item.group_label || item.title || "this entry";
  const ok = confirm(
    `Delete ${label}? This removes this entry from Supabase and from the page.`,
  );
  if (!ok) return;

  try {
    if (sb && !item.local_only && item.id) {
      await sb.from(ROUTE_CATEGORIES_TABLE).delete().eq("route_id", item.id);
      const { error } = await sb.from(ROUTES_TABLE).delete().eq("id", item.id);
      if (error) throw error;

      if (item.file_path) {
        const { error: storageError } = await sb.storage
          .from(UPLOAD_BUCKET)
          .remove([item.file_path]);
        if (storageError) console.warn(storageError);
      }
      if (item.image_path) {
        const { error: imageStorageError } = await sb.storage
          .from(UPLOAD_BUCKET)
          .remove([item.image_path]);
        if (imageStorageError) console.warn(imageStorageError);
      }
    }

    state.destinations = state.destinations.filter((x) => x.id !== item.id);
    state.pendingReview = state.pendingReview.filter((x) => x.id !== item.id);
    if (state.preferred[item.group_id] === item.id)
      delete state.preferred[item.group_id];

    writeJSON(pendingKey, state.pendingReview);
    writeJSON(preferredKey, state.preferred);

    closeAllModals();
    rebuildGroups();
    applyFilters();
    showBanner("Deleted.");
  } catch (error) {
    console.error(error);
    showBanner(
      "Could not delete this entry from Supabase. Check table policies.",
    );
  }
}

async function persistAll(options = {}) {
  state.tags = cleanTags(
    state.destinations.flatMap(
      (item) => item.tags || [item.topic, item.subtopic],
    ),
  );
  writeJSON(preferredKey, state.preferred);
  renderTagOptions();
  if (!sb) return;
  const rows = options.skipRemoteLocalOnly
    ? state.destinations.filter(
        (x) => !x.local_only && !(x.url || "").startsWith("blob:"),
      )
    : state.destinations;
  try {
    const routeRows = rows.map(toRouteRow);
    if (routeRows.length) {
      const { error } = await sb
        .from(ROUTES_TABLE)
        .upsert(routeRows, { onConflict: "id" });
      if (error) throw error;
    }
    await upsertTaxonomy(routeRows);
    await upsertTags(rows);
  } catch (error) {
    console.warn(error);
    showBanner("Saved locally. Supabase sync needs storage/table policies.");
  }
}

async function syncSupabase() {
  if (!sb) {
    showBanner("Add Supabase URL and anon key before syncing.");
    return;
  }
  await persistAll({ skipRemoteLocalOnly: true });
  showBanner("Synced.");
}

async function clearState() {
  const ok = confirm(
    "Clear localStorage, sessionStorage, and available IndexedDB databases, then reload?",
  );
  if (!ok) return;
  window.dispatchEvent(new CustomEvent("navigator:clear-state"));
  localStorage.clear();
  sessionStorage.clear();
  if (indexedDB.databases) {
    try {
      const dbs = await indexedDB.databases();
      await Promise.all(
        dbs
          .filter((db) => db.name)
          .map(
            (db) =>
              new Promise((resolve) => {
                const req = indexedDB.deleteDatabase(db.name);
                req.onsuccess = req.onerror = req.onblocked = resolve;
              }),
          ),
      );
    } catch (error) {
      console.warn(error);
    }
  }
  location.reload();
}

function normalizeDestination(raw) {
  const url = raw.url || raw.address || "#";
  const groupLabel =
    raw.group_label ||
    raw.project_title ||
    raw.title ||
    raw.source_name ||
    "Untitled";
  const groupId = raw.group_id || projectGroupId(groupLabel);
  const topic = raw.topic || raw.category || "Portfolio";
  const subtopic = raw.subtopic || "";
  const tags = cleanTags(
    raw.tags ||
      raw.categories || [topic, subtopic, raw.category, raw.group_label],
  );
  return {
    id: raw.id || uid(),
    mode: raw.mode || (raw.file_path ? "upload" : "url"),
    title: (
      raw.title ||
      raw.name ||
      raw.source_name ||
      groupLabel ||
      "Untitled"
    ).trim(),
    description: raw.description || "",
    address: raw.address || url,
    url,
    type: raw.type || (raw.mode === "upload" ? "HTML Files" : "Live Links"),
    topic,
    subtopic,
    category: raw.category || tags[0] || topic,
    tags,
    group_label: groupLabel,
    group_id: groupId,
    classification_status: raw.classification_status || "",
    manual_classification: Boolean(raw.manual_classification),
    website_status: raw.website_status || raw.status || "working",
    image_url: raw.image_url || raw.preview_image_url || "",
    image_path: raw.image_path || raw.preview_image_path || "",
    source_name: raw.source_name || raw.original_name || raw.originalName || "",
    file_path: raw.file_path || "",
    preview:
      raw.preview ||
      previewFromText([raw.title, topic, subtopic, raw.source_name].join(" ")),
    original_name:
      raw.original_name || raw.originalName || raw.source_name || "",
    local_only: Boolean(raw.local_only),
    uploaded_at: raw.uploaded_at || raw.created_at || new Date().toISOString(),
    last_accessed_at: raw.last_accessed_at || null,
    renamed_at: raw.renamed_at || null,
    reviewed_at: raw.reviewed_at || null,
  };
}

function toRouteRow(item) {
  return {
    id: item.id,
    mode: item.mode || (item.file_path || item.source_name ? "upload" : "url"),
    type: item.type || null,
    title: item.title || null,
    description: item.description || null,
    address: item.address || item.url || null,
    url: item.url || item.address || null,
    source_name: item.source_name || item.original_name || null,
    file_path: item.file_path || null,
    topic: item.topic || null,
    subtopic: item.subtopic || null,
    group_label: item.group_label || item.title || null,
    group_id:
      item.group_id ||
      projectGroupId(item.group_label || item.title || item.source_name || ""),
    classification_status: item.classification_status || null,
    manual_classification: Boolean(item.manual_classification),
    uploaded_at: item.uploaded_at || new Date().toISOString(),
    last_accessed_at: item.last_accessed_at || null,
    renamed_at: item.renamed_at || null,
    reviewed_at: item.reviewed_at || null,
    website_status: item.website_status || "working",
    image_url: item.image_url || null,
    image_path: item.image_path || null,
  };
}

async function upsertTaxonomy(routeRows) {
  if (!sb) return;
  const taxonomyRows = unique(
    routeRows
      .filter((row) => row.topic && row.subtopic)
      .map((row) => `${row.topic}|||${row.subtopic}`),
  ).map((value) => {
    const [topic, subtopic] = value.split("|||");
    return { topic, subtopic };
  });
  if (!taxonomyRows.length) return;
  const { error } = await sb
    .from(TAXONOMY_TABLE)
    .upsert(taxonomyRows, { onConflict: "topic,subtopic" });
  if (error) throw error;
}

async function upsertTags(items) {
  if (!sb) return;
  const allTags = cleanTags(
    items.flatMap((item) => item.tags || [item.topic, item.subtopic]),
  );
  const categoryRows = allTags.map((name) => ({
    name,
    slug: slugify(name),
    created_at: new Date().toISOString(),
  }));
  if (categoryRows.length) {
    const { error: catError } = await sb
      .from(CATEGORIES_TABLE)
      .upsert(categoryRows, { onConflict: "slug" });
    if (catError) console.warn(catError);
  }
  const linkRows = items.flatMap((item) =>
    cleanTags(item.tags || [item.topic, item.subtopic]).map((category) => ({
      route_id: item.id,
      category,
      created_at: new Date().toISOString(),
    })),
  );
  if (!linkRows.length) return;
  const routeIds = unique(items.map((item) => item.id));
  await sb.from(ROUTE_CATEGORIES_TABLE).delete().in("route_id", routeIds);
  const { error } = await sb
    .from(ROUTE_CATEGORIES_TABLE)
    .upsert(linkRows, { onConflict: "route_id,category" });
  if (error) throw error;
}

async function uploadPreviewImage(file, ownerId = uid()) {
  if (!sb) return { image_url: "", image_path: "" };
  const ext = (file.name.split(".").pop() || "png")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  const path = `previews/${ownerId}-${Date.now()}.${ext}`;
  try {
    const { error } = await sb.storage.from(UPLOAD_BUCKET).upload(path, file, {
      contentType: file.type || "image/png",
      metadata: { mimetype: file.type || "image/png", source_name: file.name },
      upsert: true,
    });
    if (error) throw error;
    const { data } = sb.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
    return { image_url: data.publicUrl, image_path: path };
  } catch (error) {
    console.warn(error);
    showBanner(
      "Could not upload preview image to Supabase. No local preview was saved.",
    );
    return { image_url: "", image_path: "" };
  }
}

function markPreferred(groupId, itemId) {
  state.destinations.forEach((item) => {
    if (item.group_id === groupId)
      item.classification_status = item.id === itemId ? "preferred" : "version";
  });
}

function getGroup(groupId) {
  rebuildGroups();
  return state.groups.find((group) => group.id === groupId);
}

function renderTags(container, tags) {
  container.innerHTML = "";
  cleanTags(tags)
    .slice(0, 3)
    .forEach((tag) => {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag;
      container.appendChild(pill);
    });
}

function renderTagOptions() {
  const options = document.getElementById("categoryOptions");
  if (!options) return;
  options.innerHTML = cleanTags(state.tags)
    .slice(0, 50)
    .map((tag) => `<option value="${escapeAttr(tag)}"></option>`)
    .join("");
}

function versionLabel(version) {
  const date = version.uploaded_at ? new Date(version.uploaded_at) : null;
  const dateLabel =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Unknown date";
  return `${dateLabel} · ${version.source_name || version.title}`;
}

function statusLabel(status) {
  return (
    {
      working: "Working",
      under_construction: "Under construction",
      broken: "Broken",
    }[status] || "Working"
  );
}

function firstTopic() {
  const groupTopic = state.groups.find((group) => group.active.topic)?.active
    .topic;
  return groupTopic || "Portfolio";
}

function projectGroupId(fileName) {
  return slugify(cleanProjectName(fileName));
}

function cleanProjectName(fileName) {
  return (
    cleanName(fileName)
      .replace(/\s*\(?\d+\)?\s*$/i, "")
      .replace(/\s+(copy|final|latest|updated|new)$/i, "")
      .replace(/\s+v\d+$/i, "")
      .trim() || cleanName(fileName)
  );
}

function previewFromText(text) {
  text = String(text || "").toLowerCase();
  if (text.includes("matcha")) return "matcha";
  if (text.includes("japanese") || text.includes("flash")) return "flash";
  if (text.includes("workout") || text.includes("fitness")) return "workout";
  if (text.includes("smoothie")) return "smoothie";
  if (
    text.includes("navigator") ||
    text.includes("library") ||
    text.includes("ai")
  )
    return "dark";
  if (text.includes("travel")) return "travel";
  if (text.includes("check")) return "checklist";
  if (text.includes("collection")) return "collection";
  return "portfolio";
}

function isHtmlLike(item) {
  const value =
    `${item?.url || ""} ${item?.source_name || ""} ${item?.file_path || ""}`.toLowerCase();
  return (
    item?.mode === "upload" ||
    item?.type === "HTML Files" ||
    /\.html?(?:$|[?#])/.test(value)
  );
}

function cssUrl(value) {
  return String(value || "").replace(/[\'"()]/g, encodeURIComponent);
}
function parseList(value) {
  return Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((x) => x.trim());
}
function cleanTags(list) {
  return unique(
    parseList(list)
      .flatMap((x) => (Array.isArray(x) ? x : [x]))
      .map((x) => String(x || "").trim())
      .filter(Boolean),
  );
}
function unique(list) {
  return [
    ...new Set(
      list
        .filter(Boolean)
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ];
}
function slugify(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "portfolio"
  );
}
function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}
function openModal(id) {
  document.getElementById(id).classList.add("visible");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("visible");
}
function closeAllModals() {
  document
    .querySelectorAll(".modal-backdrop")
    .forEach((x) => x.classList.remove("visible"));
}
function showBanner(message) {
  el.banner.textContent = message;
  el.banner.classList.add("visible");
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(
    () => el.banner.classList.remove("visible"),
    4200,
  );
}
function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Math.random().toString(16).slice(2) + Date.now();
}
function cleanName(fileName) {
  return String(fileName || "")
    .replace(/\.html?$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function escapeHTML(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
}
function escapeAttr(value) {
  return escapeHTML(value).replace(/`/g, "&#96;");
}
