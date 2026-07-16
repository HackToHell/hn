(function () {
  "use strict";

  var DEFAULT_HASH = "#/f/todayTop10";
  var STORAGE = {
    prefs: "premii:prefs",
    follows: "premii:follows",
    visited: "premii:visited",
    lastRoute: "premii:lastRoute"
  };
  var THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  var FEEDS = [
    ["frontpage", "Frontpage"],
    ["todayTop10", "Today's Best"],
    ["yesterdayTop10", "Yesterday's Best"],
    ["weekTop10", "Week's Best"],
    ["show", "Show"],
    ["shownew", "Show New"],
    ["ask", "Ask"],
    ["newest", "Newest"],
    ["noobstories", "NoobStories"],
    ["jobs", "Jobs"]
  ];

  var FEED_LABELS = FEEDS.reduce(function (labels, feed) {
    labels[feed[0]] = feed[1];
    return labels;
  }, {});

  var FONT_CHOICES = {
    source: '"Source Sans 3", "Source Sans Pro", system-ui, sans-serif',
    noto: '"Noto Sans JP", system-ui, sans-serif',
    slab: '"Roboto Slab", Georgia, serif',
    open: '"Open Sans", system-ui, sans-serif',
    default: "system-ui, sans-serif"
  };

  var ACCENTS = [
    "#ff6600", "#f4511e", "#e53935", "#d81b60", "#c2185b", "#ad1457",
    "#8e24aa", "#7b1fa2", "#6a1b9a", "#5e35b1", "#512da8", "#4527a0",
    "#3949ab", "#303f9f", "#283593", "#1e88e5", "#1976d2", "#1565c0",
    "#039be5", "#0288d1", "#0277bd", "#00acc1", "#0097a7", "#00838f",
    "#00a896", "#00897b", "#00796b", "#00695c", "#43a047", "#388e3c",
    "#2e7d32", "#558b2f", "#689f38", "#7cb342", "#9e9d24", "#afb42b",
    "#c0ca33", "#f9a825", "#f57f17", "#ffb300", "#ffa000", "#ff8f00",
    "#fb8c00", "#ef6c00", "#e65100", "#6d4c41", "#795548", "#8d6e63",
    "#546e7a", "#455a64", "#37474f", "#607d8b", "#263238", "#5d4037",
    "#7f5539", "#9c6644", "#bc6c25", "#b56576", "#6d597a", "#355070",
    "#118ab2", "#0a9396", "#2a9d8f", "#577590", "#4d908e", "#277da1",
    "#9b5de5", "#f15bb5"
  ];

  var defaultPrefs = {
    font: "source",
    fontSize: 15,
    theme: "light",
    accent: "#ff6600",
    layout: "fixed",
    animation: true,
    navigation: "top",
    splitView: true
  };

  var app = document.getElementById("app");
  var listPane = document.getElementById("list-pane");
  var detailPane = document.getElementById("detail-pane");
  var toast = document.getElementById("toast");
  var toastTimer;

  var state = {
    prefs: normalizePrefs(readJSON(STORAGE.prefs, {})),
    follows: normalizeFollows(readJSON(STORAGE.follows, [])),
    visited: pruneVisited(readJSON(STORAGE.visited, { comments: [], articles: [] })),
    route: null,
    feedToken: 0,
    detailToken: 0,
    feedHash: DEFAULT_HASH,
    currentFeed: null,
    searchQuery: "",
    listScrollTop: 0,
    popoverTrigger: null,
    focusOptionsTab: false
  };

  function readJSON(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      showToast("Preferences could not be saved.");
    }
  }

  function normalizePrefs(value) {
    var source = value && typeof value === "object" ? value : {};
    var prefs = Object.assign({}, defaultPrefs);
    if (Object.prototype.hasOwnProperty.call(FONT_CHOICES, source.font)) prefs.font = source.font;
    if ([13, 14, 15, 16, 17, 18, 19, 21, 23].indexOf(Number(source.fontSize)) !== -1) {
      prefs.fontSize = Number(source.fontSize);
    }
    if (["light", "dark", "auto", "system"].indexOf(source.theme) !== -1) prefs.theme = source.theme;
    if (typeof source.accent === "string" && /^#[0-9a-f]{6}$/i.test(source.accent)) {
      prefs.accent = source.accent;
    }
    if (["flexible", "fixed"].indexOf(source.layout) !== -1) prefs.layout = source.layout;
    if (typeof source.animation === "boolean") prefs.animation = source.animation;
    if (["top", "bottom"].indexOf(source.navigation) !== -1) prefs.navigation = source.navigation;
    if (typeof source.splitView === "boolean") prefs.splitView = source.splitView;
    return prefs;
  }

  function normalizeFollows(value) {
    if (!Array.isArray(value)) return [];
    var seen = new Set();
    return value.filter(function (user) {
      if (typeof user !== "string" || !/^[a-zA-Z0-9_-]+$/.test(user)) return false;
      var key = user.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 100);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  function icon(name, className) {
    return '<svg class="icon ' + (className || "") + '" aria-hidden="true">' +
      '<use href="#icon-' + name + '"></use></svg>';
  }

  function mixHex(first, second, secondWeight) {
    function rgb(hex) {
      var value = hex.replace("#", "");
      if (value.length === 3) {
        value = value.split("").map(function (char) { return char + char; }).join("");
      }
      return [
        parseInt(value.slice(0, 2), 16),
        parseInt(value.slice(2, 4), 16),
        parseInt(value.slice(4, 6), 16)
      ];
    }
    var a = rgb(first);
    var b = rgb(second);
    return "#" + a.map(function (channel, index) {
      var value = Math.round(channel * (1 - secondWeight) + b[index] * secondWeight);
      return value.toString(16).padStart(2, "0");
    }).join("");
  }

  function resolvedDarkTheme() {
    return state.prefs.theme === "dark" ||
      ((state.prefs.theme === "auto" || state.prefs.theme === "system") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function applyPrefs() {
    var root = document.documentElement;
    var dark = resolvedDarkTheme();
    root.classList.toggle("theme-dark", dark);
    root.classList.toggle("theme-light", !dark);
    root.classList.toggle("split-enabled", Boolean(state.prefs.splitView));
    root.classList.toggle("layout-fixed", state.prefs.layout === "fixed");
    root.classList.toggle("nav-bottom", state.prefs.navigation === "bottom");
    root.classList.toggle("no-motion", !state.prefs.animation);
    root.style.setProperty("--font-family", FONT_CHOICES[state.prefs.font] || FONT_CHOICES.source);
    root.style.setProperty("--font-size", Number(state.prefs.fontSize || 15) + "px");
    root.style.setProperty("--accent", state.prefs.accent);
    root.style.setProperty(
      "--accent-soft",
      mixHex(state.prefs.accent, dark ? "#000000" : "#ffffff", dark ? 0.78 : 0.9)
    );
    root.style.setProperty(
      "--accent-faint",
      mixHex(state.prefs.accent, dark ? "#000000" : "#ffffff", dark ? 0.93 : 0.98)
    );
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = state.prefs.accent;
  }

  function parseHash(hash) {
    var path = String(hash || "").replace(/^#/, "");
    path = path.replace(/^\/+|\/+$/g, "");
    if (!path) return { kind: "feed", feedId: "todayTop10" };

    var parts = path.split("/").map(safeDecode);
    if (parts[0] === "f") {
      if (parts[1] === "submitted" && parts[2]) {
        return { kind: "feed", feedId: "submitted", user: parts[2] };
      }
      if (parts[1] === "history" && (parts[2] === "comments" || parts[2] === "articles")) {
        return { kind: "feed", feedId: "history", historyType: parts[2] };
      }
      if (FEED_LABELS[parts[1]]) {
        return { kind: "feed", feedId: parts[1] };
      }
      return { kind: "invalid" };
    }
    if (parts[0] === "comments" && /^\d+$/.test(parts[1] || "")) {
      return { kind: "comments", id: Number(parts[1]) };
    }
    if (parts[0] === "profile" && parts[1]) {
      if (parts[2] === "comments") {
        return { kind: "profileComments", user: parts[1] };
      }
      return { kind: "profile", user: parts[1] };
    }
    if (parts[0] === "options") {
      var tab = parts[1] || "list";
      return {
        kind: "options",
        tab: ["list", "appearance", "about"].indexOf(tab) === -1 ? "list" : tab
      };
    }
    return { kind: "invalid" };
  }

  function routeKey(route) {
    return [
      route.kind,
      route.feedId || "",
      route.user || "",
      route.historyType || "",
      route.id || "",
      route.tab || ""
    ].join(":");
  }

  function feedLabel(route) {
    if (route.kind === "profileComments") return route.user + "'s comments";
    if (route.feedId === "submitted") {
      return route.user.toLowerCase() === "whoishiring"
        ? "Who is Hiring? Freelancer?"
        : route.user + "'s stories";
    }
    if (route.feedId === "history") {
      return route.historyType === "comments" ? "Visited Comments" : "Visited Articles";
    }
    return FEED_LABELS[route.feedId] || "Hacker News";
  }

  function feedMenu() {
    var links = FEEDS.map(function (feed) {
      return '<a href="#/f/' + feed[0] + '">' + escapeHtml(feed[1]) + "</a>";
    }).join("");
    return '<nav class="popover feed-menu" aria-label="Hacker News feeds" hidden>' +
      links +
      '<a href="#/f/submitted/whoishiring">Who is Hiring? Freelancer?</a>' +
      "</nav>";
  }

  function moreMenu() {
    return '<div class="popover more-menu" hidden>' +
      '<button type="button" data-action="share">' + icon("share") + "Share app</button>" +
      '<button type="button" data-action="reload">' + icon("refresh") + "Reload app</button>" +
      '<button type="button" data-action="fullscreen">' + icon("external") + "Fullscreen</button>" +
      '<button type="button" data-action="theme-toggle">' + icon("moon") + "Toggle night theme</button>" +
      "</div>";
  }

  function pageHeader(options) {
    var opts = options || {};
    var left = opts.back
      ? '<button class="header-button back-button" type="button" data-action="back" aria-label="Back">' +
          icon("back") + "</button>"
      : '<a class="header-button" href="#/options/" aria-label="Options">' + icon("menu") + "</a>";
    var titleTag = opts.feedMenu ? "button" : "div";
    var titleAttrs = opts.feedMenu
      ? ' type="button" data-action="feed-menu" aria-haspopup="true" aria-expanded="false"'
      : ' tabindex="-1" data-page-heading="true"';
    var actions = "";
    if (opts.search) {
      actions += '<button class="header-button" type="button" data-action="search-toggle" aria-label="Search">' +
        icon("search") + "</button>";
    }
    if (opts.refresh) {
      actions += '<button class="header-button" type="button" data-action="refresh" aria-label="Refresh">' +
        icon("refresh") + "</button>";
    }
    if (opts.more) {
      actions += '<button class="header-button" type="button" data-action="more-menu" aria-label="More options" aria-haspopup="true" aria-expanded="false">' +
        icon("more") + "</button>";
    }

    return '<header class="page-header">' +
      left +
      "<" + titleTag + ' class="header-title"' + titleAttrs + ">" +
        '<span class="header-title-main">' + escapeHtml(opts.title || "Hacker News") + "</span>" +
        '<span class="header-title-sub">' + escapeHtml(opts.subtitle || "") + "</span>" +
      "</" + titleTag + ">" +
      '<div class="header-actions">' + actions + "</div>" +
      (opts.feedMenu ? feedMenu() : "") +
      (opts.more ? moreMenu() : "") +
      "</header>";
  }

  function loadingPanel(label) {
    return '<div class="state-panel" role="status">' +
      '<div class="spinner" aria-hidden="true"></div>' +
      "<span>Loading " + escapeHtml(label || "") + "...</span>" +
      "</div>";
  }

  function errorPanel(error, target) {
    return '<div class="state-panel">' +
      "<h2>Could not load this page</h2>" +
      "<p>" + escapeHtml(error && error.message ? error.message : "The request failed.") + "</p>" +
      '<button class="retry-button" type="button" data-action="' + target + '">Retry</button>' +
      "</div>";
  }

  function placeholderPage() {
    return '<div class="pane-placeholder">' +
      icon("comment") +
      "<h2>Select a story</h2>" +
      "<p>Comments will open here.</p>" +
      "</div>";
  }

  function relativeTime(value) {
    if (!value) return "";
    var time = new Date(value).getTime();
    if (!Number.isFinite(time)) return "";
    var seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
    var units = [
      [31536000, "y"],
      [2592000, "mo"],
      [86400, "d"],
      [3600, "h"],
      [60, "m"]
    ];
    for (var index = 0; index < units.length; index += 1) {
      if (seconds >= units[index][0]) {
        return Math.floor(seconds / units[index][0]) + units[index][1] + " ago";
      }
    }
    return seconds + "s ago";
  }

  function safeExternalUrl(value) {
    if (!value) return null;
    try {
      var url = new URL(value, "https://news.ycombinator.com/");
      return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:"
        ? url.href
        : null;
    } catch (_) {
      return null;
    }
  }

  function domainFor(item) {
    if (item.url) {
      try {
        return new URL(item.url).hostname.replace(/^www\./, "");
      } catch (_) {
        return "link";
      }
    }
    if (item.type === "job") return "Job";
    if (item.tags && item.tags.indexOf("ask_hn") !== -1) return "Ask HN";
    if (item.tags && item.tags.indexOf("show_hn") !== -1) return "Show HN";
    return "news.ycombinator.com";
  }

  function pruneVisited(visited) {
    var source = visited && typeof visited === "object" ? visited : {};
    var cutoff = Date.now() - THIRTY_DAYS;
    function normalize(entry, type) {
      if (!entry || typeof entry !== "object") return null;
      var id = Number(entry.id);
      var ts = Number(entry.ts);
      if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(ts) || ts < cutoff) return null;
      var url = entry.url ? safeExternalUrl(entry.url) : null;
      if (type === "articles" && !url) return null;
      return {
        id: id,
        title: String(entry.title || "(untitled)"),
        url: url,
        author: typeof entry.author === "string" ? entry.author : null,
        points: Number(entry.points || 0),
        numComments: Number(entry.numComments || 0),
        createdAt: typeof entry.createdAt === "string" ? entry.createdAt : null,
        ts: ts
      };
    }
    return {
      comments: (Array.isArray(source.comments) ? source.comments : [])
        .map(function (item) { return normalize(item, "comments"); })
        .filter(Boolean)
        .slice(0, 200),
      articles: (Array.isArray(source.articles) ? source.articles : [])
        .map(function (item) { return normalize(item, "articles"); })
        .filter(Boolean)
        .slice(0, 200)
    };
  }

  function addVisited(type, entry) {
    var key = type === "articles" ? "articles" : "comments";
    var identifier = key === "articles" ? "url" : "id";
    var items = state.visited[key].filter(function (item) {
      return item[identifier] !== entry[identifier];
    });
    items.unshift(Object.assign({}, entry, { ts: Date.now() }));
    state.visited[key] = items.slice(0, 200);
    state.visited = pruneVisited(state.visited);
    writeJSON(STORAGE.visited, state.visited);
  }

  function isVisited(item) {
    return state.visited.comments.some(function (entry) { return entry.id === item.id; }) ||
      state.visited.articles.some(function (entry) {
        return entry.id === item.id || (item.url && entry.url === item.url);
      });
  }

  function renderStoryRow(item) {
    var id = Number(item.id);
    if (!Number.isInteger(id) || id <= 0) return "";
    var points = Number.isFinite(Number(item.points)) ? Number(item.points) : 0;
    var numComments = Number.isFinite(Number(item.numComments)) ? Number(item.numComments) : 0;
    var external = safeExternalUrl(item.url);
    var titleHref = external || "#/comments/" + id;
    var active = state.route && state.route.kind === "comments" && state.route.id === id;
    var articleData = external
      ? ' data-article="true" data-id="' + id + '" data-url="' + escapeHtml(external) +
        '" data-title="' + escapeHtml(item.title) + '" data-author="' + escapeHtml(item.author || "") +
        '" data-points="' + points + '" data-comments="' + numComments +
        '" data-created-at="' + escapeHtml(item.createdAt || "") + '"'
      : "";
    var author = item.author
      ? '<a href="#/profile/' + encodeURIComponent(item.author) + '">' + escapeHtml(item.author) + "</a>"
      : "<span>[deleted]</span>";
    return '<li class="story-row' +
      (isVisited(item) ? " is-visited" : "") +
      (active ? " is-active" : "") +
      '">' +
      '<div class="story-main">' +
        '<a class="story-title-link" href="' + escapeHtml(titleHref) + '"' +
          (external ? ' target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"' : "") +
          articleData + ">" +
          '<h3 class="story-title">' + escapeHtml(item.title) + "</h3>" +
        "</a>" +
        '<div class="story-meta">' +
          author +
          "<span>" + escapeHtml(relativeTime(item.createdAt)) + "</span>" +
          '<span class="story-domain">' + escapeHtml(domainFor(item)) + "</span>" +
        "</div>" +
      "</div>" +
      '<div class="story-rail">' +
        '<a class="comment-link" href="#/comments/' + id + '" aria-label="' +
          numComments + " comments\">" +
          icon("comment") + "<span>" + numComments + "</span>" +
        "</a>" +
        '<span class="story-score">' + (item.type === "job" ? "job" : points + " pts") + "</span>" +
      "</div>" +
      "</li>";
  }

  function sanitizeHtml(value) {
    if (!value) return "";
    var allowed = new Set([
      "P", "BR", "A", "I", "B", "STRONG", "EM", "CODE", "PRE", "BLOCKQUOTE",
      "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "HR",
      "SPAN", "DIV"
    ]);
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(String(value), "text/html");
    Array.from(documentNode.body.querySelectorAll("*")).forEach(function (element) {
      if (!allowed.has(element.tagName)) {
        if (element.tagName === "SCRIPT" || element.tagName === "STYLE" || element.tagName === "IFRAME") {
          element.remove();
        } else {
          element.replaceWith.apply(element, Array.from(element.childNodes));
        }
        return;
      }
      var href = element.tagName === "A" ? safeExternalUrl(element.getAttribute("href")) : null;
      Array.from(element.attributes).forEach(function (attribute) {
        element.removeAttribute(attribute.name);
      });
      if (element.tagName === "A" && href) {
        element.setAttribute("href", href);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
        element.setAttribute("referrerpolicy", "no-referrer");
      }
    });
    return documentNode.body.innerHTML;
  }

  function renderCommentFeedRow(item) {
    var author = item.author
      ? '<a href="#/profile/' + encodeURIComponent(item.author) + '">' + escapeHtml(item.author) + "</a>"
      : "[deleted]";
    return '<li class="comment-feed-row">' +
      '<h3><a href="#/comments/' + item.storyId + '">' + escapeHtml(item.storyTitle) + "</a></h3>" +
      '<div class="story-meta">' + author + "<span>" + escapeHtml(relativeTime(item.createdAt)) + "</span></div>" +
      '<div class="comment-excerpt prose">' + (sanitizeHtml(item.text) || "<em>[deleted]</em>") + "</div>" +
      '<a href="#/comments/' + item.storyId + '">Open discussion</a>' +
      "</li>";
  }

  function renderFeedBody(feed) {
    if (!feed || feed.status === "loading") return loadingPanel(feed ? feed.label : "stories");
    if (feed.status === "error") return errorPanel(feed.error, "retry-feed");
    if (!feed.items.length) {
      return '<div class="state-panel"><h2>Nothing here yet</h2><p>This feed has no matching items.</p></div>';
    }

    var isComments = feed.mode === "comments";
    var list = feed.items.map(isComments ? renderCommentFeedRow : renderStoryRow).join("");
    var footer = "";
    if (feed.appendError) {
      footer = '<div class="state-panel"><p>' + escapeHtml(feed.appendError.message) + '</p>' +
        '<button class="retry-button" type="button" data-action="load-more">Retry load more</button></div>';
    } else if (feed.hasMore) {
      footer = '<button class="load-more" type="button" data-action="load-more"' +
        (feed.loadingMore ? " disabled" : "") + ">" +
        (feed.loadingMore ? "Loading..." : "Load More") +
        "</button>";
    }
    return '<ul class="' + (isComments ? "comment-feed" : "story-list") + '" role="list">' +
      list + "</ul>" + footer;
  }

  function renderListPane(preserveScroll, restoreStoredScroll) {
    var currentBody = listPane.querySelector(".page-body");
    if (preserveScroll && !restoreStoredScroll && currentBody &&
        !app.classList.contains("route-detail") && !app.classList.contains("route-options")) {
      state.listScrollTop = currentBody.scrollTop;
      listPane.dataset.scrollTop = String(state.listScrollTop);
    }
    if (!preserveScroll) {
      state.listScrollTop = 0;
      listPane.dataset.scrollTop = "0";
    }
    var scrollTop = preserveScroll
      ? Number(listPane.dataset.scrollTop || state.listScrollTop || 0)
      : 0;
    var feed = state.currentFeed;
    var label = feed ? feed.label : "Today's Best";
    var searchOpen = Boolean(state.searchQuery);
    listPane.innerHTML = '<div class="page stories-page">' +
      pageHeader({
        title: "Hacker News",
        subtitle: label,
        feedMenu: true,
        search: true,
        refresh: true,
        more: true
      }) +
      '<form class="search-form" role="search"' + (searchOpen ? "" : " hidden") + ">" +
        icon("search") +
        '<label class="screen-reader-only" for="story-search">Search stories</label>' +
        '<input id="story-search" name="query" type="search" autocomplete="off" placeholder="Search" value="' +
          escapeHtml(state.searchQuery) + '">' +
        '<button class="search-clear" type="button" data-action="search-clear" aria-label="Clear search">' +
          icon("close") + "</button>" +
      "</form>" +
      '<div class="page-body">' +
        renderFeedBody(feed) +
        '<footer class="page-footer">' +
          escapeHtml(new Date().toLocaleString()) +
          '<a href="https://twitter.com/premii" target="_blank" rel="noopener noreferrer">@premii</a>' +
        "</footer>" +
      "</div>" +
      "</div>";
    if (preserveScroll) {
      var nextBody = listPane.querySelector(".page-body");
      if (nextBody) {
        nextBody.scrollTop = scrollTop;
        if (restoreStoredScroll) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              if (nextBody.isConnected) nextBody.scrollTop = scrollTop;
            });
          });
        }
      }
    }
  }

  function historyItems(type) {
    if (type === "comments") {
      return state.visited.comments.map(function (entry) {
        return {
          id: entry.id,
          type: "story",
          title: entry.title,
          url: entry.url || null,
          author: entry.author || null,
          points: entry.points || 0,
          numComments: entry.numComments || 0,
          createdAt: entry.createdAt || new Date(entry.ts).toISOString(),
          tags: []
        };
      });
    }
    return state.visited.articles.map(function (entry) {
      return {
        id: entry.id,
        type: "story",
        title: entry.title,
        url: entry.url,
        author: entry.author || null,
        points: entry.points || 0,
        numComments: entry.numComments || 0,
        createdAt: entry.createdAt || new Date(entry.ts).toISOString(),
        tags: []
      };
    });
  }

  async function requestFeed(route, page, forceRefresh) {
    if (state.searchQuery) {
      return HNApi.searchStories(state.searchQuery, {
        page: page,
        forceRefresh: forceRefresh
      });
    }
    if (route.kind === "profileComments") {
      return HNApi.fetchUserComments(route.user, { page: page, forceRefresh: forceRefresh });
    }
    if (route.feedId === "submitted") {
      if (route.user.toLowerCase() === "whoishiring") {
        return HNApi.fetchFeed("whoishiring", { page: page, forceRefresh: forceRefresh });
      }
      return HNApi.fetchSubmitted(route.user, { page: page, forceRefresh: forceRefresh });
    }
    if (route.feedId === "history") {
      return {
        hits: historyItems(route.historyType),
        page: 0,
        nbPages: 1,
        nbHits: historyItems(route.historyType).length,
        hasMore: false
      };
    }
    return HNApi.fetchFeed(route.feedId, { page: page, forceRefresh: forceRefresh });
  }

  async function loadFeed(route, options) {
    var opts = options || {};
    var token = ++state.feedToken;
    var append = Boolean(opts.append);
    var preserveScroll = append || Boolean(opts.preserveScroll);
    var page = append && state.currentFeed ? state.currentFeed.page + 1 : 0;
    var label = state.searchQuery ? 'Search: "' + state.searchQuery + '"' : feedLabel(route);

    if (append && state.currentFeed) {
      state.currentFeed.loadingMore = true;
      state.currentFeed.appendError = null;
    } else {
      state.currentFeed = {
        status: "loading",
        route: route,
        label: label,
        mode: route.kind === "profileComments" ? "comments" : "stories",
        items: [],
        page: 0,
        hasMore: false
      };
    }
    renderListPane(preserveScroll);
    app.setAttribute("aria-busy", "true");

    try {
      var result = await requestFeed(route, page, Boolean(opts.forceRefresh));
      if (token !== state.feedToken) return;
      var existing = append ? state.currentFeed.items : [];
      var seen = new Set(existing.map(function (item) { return item.id; }));
      var additions = result.hits.filter(function (item) {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      state.currentFeed = {
        status: "ready",
        route: route,
        label: label,
        mode: route.kind === "profileComments" ? "comments" : "stories",
        items: existing.concat(additions),
        page: result.page,
        hasMore: result.hasMore,
        nbHits: result.nbHits,
        loadingMore: false,
        appendError: null
      };
    } catch (error) {
      if (token !== state.feedToken) return;
      if (append && state.currentFeed && state.currentFeed.items.length) {
        state.currentFeed.loadingMore = false;
        state.currentFeed.appendError = error;
      } else {
        state.currentFeed = {
          status: "error",
          route: route,
          label: label,
          mode: route.kind === "profileComments" ? "comments" : "stories",
          items: [],
          page: 0,
          hasMore: false,
          error: error
        };
      }
    }
    renderListPane(preserveScroll);
    app.setAttribute("aria-busy", "false");
  }

  var descendantCounts = new WeakMap();

  function countDescendants(node) {
    if (descendantCounts.has(node)) return descendantCounts.get(node);
    var count = (node.children || []).reduce(function (total, child) {
      return total + 1 + countDescendants(child);
    }, 0);
    descendantCounts.set(node, count);
    return count;
  }

  function renderCommentNode(comment) {
    var count = countDescendants(comment);
    var author = comment.author
      ? '<a class="comment-author" href="#/profile/' + encodeURIComponent(comment.author) + '">' +
          escapeHtml(comment.author) + "</a>"
      : '<span class="comment-author">[deleted]</span>';
    var friend = comment.author && state.follows.some(function (user) {
      return user.toLowerCase() === comment.author.toLowerCase();
    }) ? '<span class="friend-badge">followed</span>' : "";
    var content = comment.text
      ? '<div class="comment-text prose">' + sanitizeHtml(comment.text) + "</div>"
      : '<div class="comment-text deleted-comment">[deleted]</div>';
    var children = comment.children && comment.children.length
      ? '<ul class="comment-children">' + comment.children.map(renderCommentNode).join("") + "</ul>"
      : "";
    return '<li class="comment" data-comment-id="' + comment.id + '">' +
      '<div class="comment-meta" role="button" tabindex="0" aria-expanded="true">' +
        author + friend +
        '<time datetime="' + escapeHtml(comment.createdAt || "") + '">' +
          escapeHtml(relativeTime(comment.createdAt)) + "</time>" +
        (count ? '<span class="collapsed-count">' + count + " hidden</span>" : "") +
      "</div>" +
      content +
      children +
      "</li>";
  }

  function commentsPage(item, error, loading) {
    var body;
    if (loading) {
      body = loadingPanel("comments");
    } else if (error) {
      body = errorPanel(error, "retry-detail");
    } else {
      var comments = item.children || [];
      var external = safeExternalUrl(item.url);
      var articleData = external
        ? ' data-article="true" data-id="' + item.id + '" data-url="' + escapeHtml(external) +
          '" data-title="' + escapeHtml(item.title) + '" data-author="' + escapeHtml(item.author || "") +
          '" data-points="' + Number(item.points || 0) + '" data-comments="' +
          countDescendants(item) + '" data-created-at="' + escapeHtml(item.createdAt || "") + '"'
        : "";
      var articleLink = external
        ? '<a class="article-url" href="' + escapeHtml(external) +
          '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"' + articleData + ">" +
          escapeHtml(external) + "</a>"
        : "";
      var author = item.author
        ? '<a href="#/profile/' + encodeURIComponent(item.author) + '">' + escapeHtml(item.author) + "</a>"
        : "[deleted]";
      body = '<div class="article-meta">' +
        "<h1>" + escapeHtml(item.title || "(untitled)") + "</h1>" +
        '<div class="article-meta-line">' +
          author +
          "<span>" + Number(item.points || 0) + " points</span>" +
          "<span>" + escapeHtml(relativeTime(item.createdAt)) + "</span>" +
          "<span>" + countDescendants(item) + " comments</span>" +
        "</div>" +
        articleLink +
        '<div class="article-actions">' +
          (external
            ? '<a class="article-action" href="' + escapeHtml(external) +
              '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"' +
              articleData + ">" + icon("external") + "Article</a>"
            : "") +
          '<a class="article-action" href="https://news.ycombinator.com/item?id=' + item.id +
            '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">' +
            icon("external") + "HN discussion</a>" +
        "</div>" +
      "</div>" +
      (item.text ? '<div class="self-text prose">' + sanitizeHtml(item.text) + "</div>" : "") +
      (comments.length
        ? '<p class="comments-help">Select a comment header to collapse its thread.</p>' +
          '<ul class="comment-tree">' + comments.map(renderCommentNode).join("") + "</ul>"
        : '<div class="state-panel"><h2>No comments yet</h2><p>This discussion is empty.</p></div>');
    }
    return '<div class="page comments-page">' +
      pageHeader({
        back: true,
        title: "Hacker News",
        subtitle: item && item.title ? item.title : "Comments",
        more: false
      }) +
      '<div class="page-body">' + body + "</div>" +
      "</div>";
  }

  async function loadComments(route) {
    var token = ++state.detailToken;
    detailPane.innerHTML = commentsPage(null, null, true);
    app.setAttribute("aria-busy", "true");
    try {
      var item = await HNApi.getItem(route.id);
      if (token !== state.detailToken || state.route.kind !== "comments" || state.route.id !== route.id) {
        return;
      }
      if (item.type !== "story" && item.type !== "job") {
        if (Number.isInteger(item.storyId) && item.storyId > 0) {
          location.replace("#/comments/" + item.storyId);
          return;
        }
        throw new HNApi.ApiError("NOT_FOUND", "This Hacker News story was not found.");
      }
      addVisited("comments", {
        id: item.id,
        title: item.title || "(untitled)",
        url: item.url,
        author: item.author,
        points: item.points,
        numComments: countDescendants(item),
        createdAt: item.createdAt
      });
      detailPane.innerHTML = commentsPage(item, null, false);
      renderListPane(true);
      focusPane(detailPane);
      document.title = (item.title || "Comments") + " - Premii";
    } catch (error) {
      if (token !== state.detailToken || state.route.kind !== "comments" || state.route.id !== route.id) {
        return;
      }
      detailPane.innerHTML = commentsPage(null, error, false);
      focusPane(detailPane);
    }
    app.setAttribute("aria-busy", "false");
  }

  function profilePage(profile, counts, error, loading) {
    var body;
    if (loading) {
      body = loadingPanel("profile");
    } else if (error) {
      body = errorPanel(error, "retry-detail");
    } else {
      var followed = state.follows.some(function (user) {
        return user.toLowerCase() === profile.username.toLowerCase();
      });
      body = '<article class="profile-card">' +
        "<h1>" + escapeHtml(profile.username) + "</h1>" +
        '<p class="profile-stat">Karma: <strong>' + Number(profile.karma || 0) + "</strong></p>" +
        '<p class="profile-stat"><strong>' + counts + "</strong> stories/comments!</p>" +
        '<div class="profile-about prose">' +
          (profile.about ? sanitizeHtml(profile.about) : "<p>No profile text.</p>") +
        "</div>" +
        '<nav class="profile-links" aria-label="User activity">' +
          '<a class="soft-button" href="#/f/submitted/' + encodeURIComponent(profile.username) +
            '">Submitted Stories</a>' +
          '<a class="soft-button" href="#/profile/' + encodeURIComponent(profile.username) +
            '/comments">Comments</a>' +
        "</nav>" +
        '<div class="profile-actions">' +
          '<button class="soft-button" type="button" data-action="' +
            (followed ? "unfollow" : "follow") + '" data-user="' + escapeHtml(profile.username) + '">' +
            icon("user") + (followed ? "Unfollow" : "Follow") +
          "</button>" +
        "</div>" +
      "</article>";
    }
    return '<div class="page profile-page">' +
      pageHeader({
        back: true,
        title: "Hacker News",
        subtitle: profile ? profile.username : "Profile"
      }) +
      '<div class="page-body">' + body + "</div>" +
      "</div>";
  }

  async function loadProfile(route) {
    var token = ++state.detailToken;
    detailPane.innerHTML = profilePage(null, 0, null, true);
    app.setAttribute("aria-busy", "true");
    try {
      var results = await Promise.all([
        HNApi.getUser(route.user),
        HNApi.fetchSubmitted(route.user, { page: 0 }).catch(function () { return { nbHits: 0 }; }),
        HNApi.fetchUserComments(route.user, { page: 0 }).catch(function () { return { nbHits: 0 }; })
      ]);
      if (token !== state.detailToken || state.route.kind !== "profile" || state.route.user !== route.user) {
        return;
      }
      var count = Number(results[1].nbHits || 0) + Number(results[2].nbHits || 0);
      detailPane.innerHTML = profilePage(results[0], count, null, false);
      focusPane(detailPane);
      document.title = results[0].username + " - Premii";
    } catch (error) {
      if (token !== state.detailToken || state.route.kind !== "profile" || state.route.user !== route.user) {
        return;
      }
      detailPane.innerHTML = profilePage(null, 0, error, false);
      focusPane(detailPane);
    }
    app.setAttribute("aria-busy", "false");
  }

  function selectedClass(value, current) {
    return String(value) === String(current) ? " is-selected" : "";
  }

  function prefChoice(label, name, value, current) {
    return '<button class="choice' + selectedClass(value, current) +
      '" type="button" data-pref="' + name + '" data-value="' + escapeHtml(value) + '">' +
      escapeHtml(label) + "</button>";
  }

  function optionsListTab() {
    var feedLinks = FEEDS.map(function (feed) {
      return '<li><a href="#/f/' + feed[0] + '"><span>' + escapeHtml(feed[1]) +
        "</span><span>Open</span></a></li>";
    }).join("");
    var follows = state.follows.length
      ? state.follows.map(function (user) {
          return '<li class="follow-item">' +
            '<a href="#/profile/' + encodeURIComponent(user) + '">' + escapeHtml(user) + "</a>" +
            '<a href="#/f/submitted/' + encodeURIComponent(user) + '" aria-label="' +
              escapeHtml(user) + ' submitted stories">S</a>' +
            '<a href="#/profile/' + encodeURIComponent(user) + '/comments" aria-label="' +
              escapeHtml(user) + ' comments">C</a>' +
            '<button type="button" data-action="remove-follow" data-user="' + escapeHtml(user) +
              '" aria-label="Unfollow ' + escapeHtml(user) + '">x</button>' +
          "</li>";
        }).join("")
      : '<li class="state-panel"><p>No followed users.</p></li>';
    return '<section class="options-section">' +
      "<h2>YC</h2>" +
      '<ul class="option-list">' + feedLinks +
        '<li><a href="#/f/submitted/whoishiring"><span>Who is Hiring? Freelancer?</span><span>Open</span></a></li>' +
      "</ul>" +
      "</section>" +
      '<section class="options-section">' +
        "<h2>History (Visited)</h2>" +
        '<ul class="option-list">' +
          '<li><a href="#/f/history/comments"><span>Comments</span><span>' +
            state.visited.comments.length + "</span></a></li>" +
          '<li><a href="#/f/history/articles"><span>Articles</span><span>' +
            state.visited.articles.length + "</span></a></li>" +
        "</ul>" +
      "</section>" +
      '<section class="options-section">' +
        "<h2>Following</h2>" +
        '<form class="follow-form">' +
          '<label class="screen-reader-only" for="follow-user">Enter HN username</label>' +
          '<input id="follow-user" name="username" autocomplete="off" placeholder="Enter HN username" ' +
            'pattern="[a-zA-Z0-9_-]+">' +
          '<button type="submit">Follow</button>' +
        "</form>" +
        '<ul class="follow-list">' + follows + "</ul>" +
      "</section>";
  }

  function optionsAppearanceTab() {
    var fontButtons = [
      ["Noto Sans JP", "noto"],
      ["Source Sans Pro", "source"],
      ["Roboto Slab", "slab"],
      ["Open Sans", "open"],
      ["Default", "default"]
    ].map(function (font) {
      return prefChoice(font[0], "font", font[1], state.prefs.font);
    }).join("");
    var sizes = [13, 14, 15, 16, 17, 18, 19, 21, 23].map(function (size) {
      return prefChoice(String(size), "fontSize", size, state.prefs.fontSize);
    }).join("");
    var themes = [
      ["Light", "light"],
      ["Dark", "dark"],
      ["Auto", "auto"],
      ["System", "system"]
    ].map(function (theme) {
      return prefChoice(theme[0], "theme", theme[1], state.prefs.theme);
    }).join("");
    var swatches = ACCENTS.map(function (color) {
      return '<button class="swatch' + selectedClass(color, state.prefs.accent) +
        '" type="button" data-pref="accent" data-value="' + color +
        '" style="--swatch:' + color + '" aria-label="Use accent ' + color + '"></button>';
    }).join("");
    return '<section class="options-section"><h2>Font Style</h2><div class="choice-grid">' +
      fontButtons + "</div></section>" +
      '<section class="options-section"><h2>Text Size</h2><div class="choice-grid">' +
        sizes + "</div></section>" +
      '<section class="options-section"><h2>Theme</h2><div class="choice-grid">' +
        themes + "</div></section>" +
      '<section class="options-section"><h2>Theme Color</h2><div class="swatch-grid">' +
        swatches + "</div></section>" +
      '<section class="options-section"><h2>Layout</h2><div class="choice-grid">' +
        prefChoice("Flexible", "layout", "flexible", state.prefs.layout) +
        prefChoice("Fixed", "layout", "fixed", state.prefs.layout) +
      "</div></section>" +
      '<section class="options-section"><h2>Animation</h2><div class="choice-grid">' +
        prefChoice("Enable", "animation", "true", state.prefs.animation) +
        prefChoice("Disable", "animation", "false", state.prefs.animation) +
      "</div></section>" +
      '<section class="options-section"><h2>Navigation</h2><div class="choice-grid">' +
        prefChoice("Top Navigation", "navigation", "top", state.prefs.navigation) +
        prefChoice("Bottom Navigation", "navigation", "bottom", state.prefs.navigation) +
      "</div></section>" +
      '<section class="options-section"><h2>Split View</h2><div class="choice-grid">' +
        prefChoice("Enable", "splitView", "true", state.prefs.splitView) +
        prefChoice("Disable", "splitView", "false", state.prefs.splitView) +
      "</div></section>";
  }

  function optionsAboutTab() {
    return '<article class="about-copy">' +
      "<h1>Premii</h1>" +
      "<p>A focused, read-only Hacker News reader inspired by the original Premii interface.</p>" +
      "<ul>" +
        "<li>Frontpage, best-of-day, Show, Ask, Newest, Jobs, and user feeds.</li>" +
        "<li>Nested discussions, local history, followed users, themes, and split view.</li>" +
        "<li>Live data comes directly from the public HN Algolia API.</li>" +
      "</ul>" +
      "<p>No login, voting, replies, Pocket, Readability, or article extraction is included.</p>" +
      '<p><a href="https://twitter.com/premii" target="_blank" rel="noopener noreferrer">@premii</a></p>' +
      "</article>";
  }

  function renderOptions(route) {
    var labels = { list: "YC", appearance: "Appearance", about: "About" };
    var content = route.tab === "appearance"
      ? optionsAppearanceTab()
      : route.tab === "about"
        ? optionsAboutTab()
        : optionsListTab();
    detailPane.innerHTML = '<div class="page options-page">' +
      pageHeader({
        back: true,
        title: "Hacker News",
        subtitle: "Options - " + labels[route.tab]
      }) +
      '<div class="page-body">' +
        '<nav class="options-tabs" role="tablist" aria-label="Options">' +
          '<a id="options-tab-list" class="options-tab" role="tab" aria-selected="' +
            (route.tab === "list") + '" aria-controls="options-panel" tabindex="' +
            (route.tab === "list" ? "0" : "-1") + '" href="#/options/list">YC</a>' +
          '<a id="options-tab-appearance" class="options-tab" role="tab" aria-selected="' +
            (route.tab === "appearance") + '" aria-controls="options-panel" tabindex="' +
            (route.tab === "appearance" ? "0" : "-1") + '" href="#/options/appearance">Appearance</a>' +
          '<a id="options-tab-about" class="options-tab" role="tab" aria-selected="' +
            (route.tab === "about") + '" aria-controls="options-panel" tabindex="' +
            (route.tab === "about" ? "0" : "-1") + '" href="#/options/about">About</a>' +
        "</nav>" +
        '<div id="options-panel" class="options-content" role="tabpanel" aria-labelledby="options-tab-' +
          route.tab + '">' + content + "</div>" +
      "</div>" +
      "</div>";
    document.title = labels[route.tab] + " - Premii";
    if (state.focusOptionsTab) {
      state.focusOptionsTab = false;
      requestAnimationFrame(function () {
        var selected = detailPane.querySelector('.options-tab[aria-selected="true"]');
        if (selected) selected.focus();
      });
    } else {
      focusPane(detailPane);
    }
  }

  function ensureLeftFeed() {
    if (state.currentFeed) {
      renderListPane(true);
      return;
    }
    loadFeed({ kind: "feed", feedId: "todayTop10" });
  }

  function setRouteClass(kind) {
    app.classList.remove("route-feed", "route-detail", "route-options");
    app.classList.add(kind);
  }

  async function renderRoute(route) {
    var previousKind = state.route && state.route.kind;
    if ((route.kind === "comments" || route.kind === "profile" || route.kind === "options") &&
        (previousKind === "feed" || previousKind === "profileComments")) {
      var currentListBody = listPane.querySelector(".page-body");
      if (currentListBody) {
        state.listScrollTop = currentListBody.scrollTop;
        listPane.dataset.scrollTop = String(state.listScrollTop);
      }
    }
    state.route = route;
    app.setAttribute("aria-busy", "true");

    if (route.kind === "invalid") {
      showToast("Unknown route.");
      location.replace(DEFAULT_HASH);
      return;
    }

    if (route.kind === "feed" || route.kind === "profileComments") {
      state.detailToken += 1;
      var nextKey = routeKey(route);
      var sameFeed = state.currentFeed && routeKey(state.currentFeed.route) === nextKey;
      if (!sameFeed) state.searchQuery = "";
      state.feedHash = location.hash || DEFAULT_HASH;
      writeJSON(STORAGE.lastRoute, state.feedHash);
      setRouteClass("route-feed");
      detailPane.innerHTML = placeholderPage();
      document.title = feedLabel(route) + " - Premii";
      if (sameFeed && state.currentFeed.status === "ready") {
        renderListPane(
          true,
          previousKind === "comments" || previousKind === "profile" || previousKind === "options"
        );
        app.setAttribute("aria-busy", "false");
      } else {
        await loadFeed(route);
      }
      if (previousKind === "comments" || previousKind === "profile" || previousKind === "options") {
        focusPane(listPane);
      }
      return;
    }

    if (route.kind === "comments") {
      writeJSON(STORAGE.lastRoute, location.hash);
      setRouteClass("route-detail");
      ensureLeftFeed();
      await loadComments(route);
      return;
    }

    if (route.kind === "profile") {
      writeJSON(STORAGE.lastRoute, location.hash);
      setRouteClass("route-detail");
      ensureLeftFeed();
      await loadProfile(route);
      return;
    }

    if (route.kind === "options") {
      state.feedToken += 1;
      state.detailToken += 1;
      writeJSON(STORAGE.lastRoute, location.hash);
      setRouteClass("route-options");
      renderOptions(route);
      app.setAttribute("aria-busy", "false");
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(function () {
      toast.hidden = true;
    }, 2600);
  }

  function focusPane(pane) {
    requestAnimationFrame(function () {
      var heading = pane.querySelector("[data-page-heading], .header-title");
      if (heading) heading.focus({ preventScroll: true });
    });
  }

  function followUser(username) {
    var user = String(username || "").trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(user)) {
      showToast("Enter a valid Hacker News username.");
      return false;
    }
    if (state.follows.length >= 100) {
      showToast("Follow list is full.");
      return false;
    }
    if (!state.follows.some(function (entry) { return entry.toLowerCase() === user.toLowerCase(); })) {
      state.follows.push(user);
      state.follows.sort(function (a, b) { return a.localeCompare(b); });
      writeJSON(STORAGE.follows, state.follows);
      showToast("Following " + user + ".");
    }
    return true;
  }

  function unfollowUser(username) {
    state.follows = state.follows.filter(function (entry) {
      return entry.toLowerCase() !== String(username).toLowerCase();
    });
    writeJSON(STORAGE.follows, state.follows);
    showToast("Unfollowed " + username + ".");
  }

  function updatePreference(name, rawValue) {
    var value = rawValue;
    if (name === "fontSize") value = Number(rawValue);
    if (name === "animation" || name === "splitView") value = rawValue === "true";
    state.prefs[name] = value;
    writeJSON(STORAGE.prefs, state.prefs);
    applyPrefs();
    if (state.route.kind === "options") renderOptions(state.route);
  }

  function closePopovers(except, restoreFocus) {
    document.querySelectorAll(".popover").forEach(function (popover) {
      if (popover !== except) popover.hidden = true;
    });
    document.querySelectorAll('[aria-expanded="true"]').forEach(function (button) {
      if (!except || !button.parentElement.contains(except)) {
        button.setAttribute("aria-expanded", "false");
      }
    });
    if (!except && restoreFocus && state.popoverTrigger && state.popoverTrigger.isConnected) {
      state.popoverTrigger.focus();
    }
    if (!except) state.popoverTrigger = null;
  }

  async function shareApp() {
    var data = { title: document.title, url: location.href };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(location.href);
        showToast("Link copied.");
      }
    } catch (_) {
      return;
    }
  }

  document.addEventListener("click", function (event) {
    var actionTarget = event.target.closest("[data-action]");
    var article = event.target.closest("[data-article]");

    if (article) {
      addVisited("articles", {
        id: Number(article.dataset.id),
        url: article.dataset.url,
        title: article.dataset.title,
        author: article.dataset.author || null,
        points: Number(article.dataset.points || 0),
        numComments: Number(article.dataset.comments || 0),
        createdAt: article.dataset.createdAt || null
      });
      if (state.currentFeed) renderListPane(true);
    }

    if (!actionTarget) {
      if (!event.target.closest(".popover") && !event.target.closest(".header-title")) {
        closePopovers();
      }
      return;
    }

    var action = actionTarget.dataset.action;
    if (action === "feed-menu" || action === "more-menu") {
      var menu = action === "feed-menu"
        ? actionTarget.closest(".page-header").querySelector(".feed-menu")
        : actionTarget.closest(".page-header").querySelector(".more-menu");
      var willOpen = menu.hidden;
      closePopovers(menu, false);
      menu.hidden = !willOpen;
      actionTarget.setAttribute("aria-expanded", String(willOpen));
      state.popoverTrigger = willOpen ? actionTarget : null;
      if (willOpen) {
        requestAnimationFrame(function () {
          var firstItem = menu.querySelector("a, button");
          if (firstItem) firstItem.focus();
        });
      }
      return;
    }

    if (action === "search-toggle") {
      var form = actionTarget.closest(".page").querySelector(".search-form");
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector("input").focus();
      return;
    }

    if (action === "search-clear") {
      state.searchQuery = "";
      if (state.currentFeed) loadFeed(state.currentFeed.route);
      return;
    }

    if (action === "refresh") {
      if (state.currentFeed) {
        HNApi.clearCache();
        loadFeed(state.currentFeed.route, { forceRefresh: true });
      }
      return;
    }

    if (action === "load-more") {
      if (state.currentFeed && !state.currentFeed.loadingMore) {
        loadFeed(state.currentFeed.route, { append: true });
      }
      return;
    }

    if (action === "retry-feed") {
      loadFeed(state.currentFeed.route, { forceRefresh: true });
      return;
    }

    if (action === "retry-detail") {
      if (state.route.kind === "comments") loadComments(state.route);
      if (state.route.kind === "profile") loadProfile(state.route);
      return;
    }

    if (action === "back") {
      location.hash = state.feedHash || DEFAULT_HASH;
      return;
    }

    if (action === "follow") {
      if (followUser(actionTarget.dataset.user) && state.route.kind === "profile") {
        loadProfile(state.route);
      }
      return;
    }

    if (action === "unfollow" || action === "remove-follow") {
      unfollowUser(actionTarget.dataset.user);
      if (state.route.kind === "profile") loadProfile(state.route);
      if (state.route.kind === "options") renderOptions(state.route);
      return;
    }

    if (action === "theme-toggle") {
      state.prefs.theme = resolvedDarkTheme() ? "light" : "dark";
      writeJSON(STORAGE.prefs, state.prefs);
      applyPrefs();
      closePopovers();
      return;
    }

    if (action === "reload") {
      location.reload();
      return;
    }

    if (action === "fullscreen") {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(function () {
          showToast("Fullscreen is not available.");
        });
      } else {
        showToast("Fullscreen is not available.");
      }
      return;
    }

    if (action === "share") {
      shareApp();
      return;
    }
  });

  document.addEventListener("click", function (event) {
    var meta = event.target.closest(".comment-meta");
    if (!meta || event.target.closest("a")) return;
    var comment = meta.closest(".comment");
    var collapsed = comment.classList.toggle("is-collapsed");
    meta.setAttribute("aria-expanded", String(!collapsed));
  });

  document.addEventListener("submit", function (event) {
    if (event.target.matches(".search-form")) {
      event.preventDefault();
      var query = new FormData(event.target).get("query").trim();
      state.searchQuery = query;
      loadFeed(state.currentFeed.route);
      return;
    }
    if (event.target.matches(".follow-form")) {
      event.preventDefault();
      var username = new FormData(event.target).get("username");
      if (followUser(username)) {
        event.target.reset();
        renderOptions(state.route);
      }
    }
  });

  document.addEventListener("click", function (event) {
    var pref = event.target.closest("[data-pref]");
    if (!pref) return;
    updatePreference(pref.dataset.pref, pref.dataset.value);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closePopovers(null, true);
      var form = document.querySelector(".search-form:not([hidden])");
      if (form && document.activeElement !== form.querySelector("input")) form.hidden = true;
      return;
    }
    if (document.activeElement && document.activeElement.classList.contains("options-tab") &&
        ["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) !== -1) {
      event.preventDefault();
      var tabs = Array.from(document.querySelectorAll(".options-tab"));
      var current = tabs.indexOf(document.activeElement);
      var next = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      state.focusOptionsTab = true;
      location.hash = tabs[next].getAttribute("href");
      return;
    }
    if (event.key === "/" && !event.metaKey && !event.ctrlKey &&
        !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      event.preventDefault();
      var searchButton = document.querySelector('[data-action="search-toggle"]');
      if (searchButton) searchButton.click();
    }
    if ((event.key === "Enter" || event.key === " ") &&
        document.activeElement.classList.contains("comment-meta")) {
      event.preventDefault();
      document.activeElement.click();
    }
  });

  window.addEventListener("hashchange", function () {
    renderRoute(parseHash(location.hash));
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    if (state.prefs.theme === "auto" || state.prefs.theme === "system") applyPrefs();
  });

  applyPrefs();
  writeJSON(STORAGE.visited, state.visited);

  var storedHash = readJSON(STORAGE.lastRoute, DEFAULT_HASH);
  var initialHash = typeof storedHash === "string" && /^#\//.test(storedHash)
    ? storedHash
    : DEFAULT_HASH;
  if (!location.hash) history.replaceState(null, "", initialHash);
  renderRoute(parseHash(location.hash));
})();
