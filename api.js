(function (global) {
  "use strict";

  var BASE = "https://hn.algolia.com/api/v1";
  var HITS_PER_PAGE = 30;
  var responseCache = new Map();

  function ApiError(code, message, details) {
    Error.call(this, message);
    this.name = "ApiError";
    this.message = message;
    this.code = code;
    this.status = details && details.status;
    this.url = details && details.url;
  }

  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function localDayRange(period) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var start;
    var end;

    if (period === "today") {
      start = today;
      end = tomorrow;
    } else if (period === "yesterday") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      end = today;
    } else if (period === "week") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      end = tomorrow;
    } else {
      throw new ApiError("INVALID_FEED", "Unknown date range: " + period);
    }

    return {
      start: Math.floor(start.getTime() / 1000),
      end: Math.floor(end.getTime() / 1000)
    };
  }

  function recentCutoff(days) {
    var now = new Date();
    return Math.floor(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).getTime() / 1000
    );
  }

  var FEEDS = {
    frontpage: { endpoint: "search", tags: "front_page", label: "Frontpage" },
    todayTop10: { endpoint: "search", tags: "story", range: "today", label: "Today's Best" },
    yesterdayTop10: {
      endpoint: "search",
      tags: "story",
      range: "yesterday",
      label: "Yesterday's Best"
    },
    weekTop10: { endpoint: "search", tags: "story", range: "week", label: "Week's Best" },
    show: { endpoint: "search", tags: "show_hn", label: "Show" },
    shownew: { endpoint: "search_by_date", tags: "show_hn", label: "Show New" },
    ask: { endpoint: "search", tags: "ask_hn", label: "Ask" },
    newest: { endpoint: "search_by_date", tags: "story", label: "Newest" },
    jobs: { endpoint: "search_by_date", tags: "job", label: "Jobs" },
    noobstories: {
      endpoint: "search_by_date",
      tags: "story",
      label: "NoobStories",
      numericFilters: function () {
        return ["points<=3", "created_at_i>=" + recentCutoff(3)];
      }
    },
    whoishiring: {
      endpoint: "search_by_date",
      tags: "story,author_whoishiring",
      label: "Who is Hiring? Freelancer?"
    }
  };

  function buildSearchUrl(spec, page) {
    var params = new URLSearchParams();
    var filters = [];

    if (spec.query) params.set("query", spec.query);
    if (spec.tags) params.set("tags", spec.tags);

    if (spec.range) {
      var range = localDayRange(spec.range);
      filters.push("created_at_i>=" + range.start, "created_at_i<" + range.end);
    }

    if (spec.numericFilters) {
      filters = filters.concat(
        typeof spec.numericFilters === "function"
          ? spec.numericFilters()
          : spec.numericFilters
      );
    }

    if (filters.length) params.set("numericFilters", filters.join(","));
    if (spec.restrictSearchableAttributes) {
      params.set("restrictSearchableAttributes", spec.restrictSearchableAttributes.join(","));
    }
    params.set("hitsPerPage", String(spec.hitsPerPage || HITS_PER_PAGE));
    params.set("page", String(page || 0));

    return BASE + "/" + (spec.endpoint || "search") + "?" + params.toString();
  }

  async function fetchJson(url, options) {
    var forceRefresh = options && options.forceRefresh;
    if (!forceRefresh && responseCache.has(url)) return responseCache.get(url);

    var response;
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeout = controller
      ? setTimeout(function () { controller.abort(); }, 15000)
      : null;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: forceRefresh ? "reload" : "default",
        signal: controller ? controller.signal : undefined
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new ApiError("TIMEOUT", "Hacker News took too long to respond.", { url: url });
      }
      throw new ApiError("NETWORK", "Could not reach Hacker News.", { url: url });
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    if (!response.ok) {
      var isItem = url.indexOf("/items/") !== -1;
      var isUser = url.indexOf("/users/") !== -1;
      var code = isItem && response.status === 404
        ? "NOT_FOUND"
        : isUser && response.status === 404
          ? "USER_NOT_FOUND"
          : "HTTP";
      throw new ApiError(
        code,
        code === "NOT_FOUND"
          ? "This Hacker News item was not found."
          : code === "USER_NOT_FOUND"
            ? "This Hacker News user was not found."
            : "Hacker News returned an error.",
        { status: response.status, url: url }
      );
    }

    var data;
    try {
      data = await response.json();
    } catch (error) {
      throw new ApiError("PARSE", "Hacker News returned an unreadable response.", {
        status: response.status,
        url: url
      });
    }

    responseCache.set(url, data);
    return data;
  }

  function normalizeStoryHit(hit) {
    var tags = Array.isArray(hit._tags) ? hit._tags : [];
    return {
      id: Number(hit.objectID || hit.story_id),
      type: tags.indexOf("job") !== -1 ? "job" : "story",
      title: hit.title || hit.story_title || "(untitled)",
      url: hit.url || hit.story_url || null,
      author: hit.author || null,
      points: Number(hit.points || 0),
      numComments: Number(hit.num_comments || 0),
      createdAt: hit.created_at || null,
      createdAtI: hit.created_at_i || 0,
      text: hit.story_text || hit.job_text || "",
      tags: tags
    };
  }

  function normalizeCommentHit(hit) {
    return {
      id: Number(hit.objectID),
      type: "comment",
      author: hit.author || null,
      text: hit.comment_text || "",
      createdAt: hit.created_at || null,
      createdAtI: hit.created_at_i || 0,
      storyId: Number(hit.story_id),
      storyTitle: hit.story_title || "(untitled)",
      storyUrl: hit.story_url || null,
      parentId: hit.parent_id == null ? null : Number(hit.parent_id)
    };
  }

  function normalizeItemNode(node) {
    if (!node) return null;
    return {
      id: Number(node.id),
      type: node.type || "comment",
      title: node.title || "",
      url: node.url || null,
      author: node.author || null,
      text: node.text || "",
      points: Number(node.points || 0),
      parentId: node.parent_id == null ? null : Number(node.parent_id),
      storyId: node.story_id == null ? null : Number(node.story_id),
      createdAt: node.created_at || null,
      createdAtI: node.created_at_i || 0,
      children: (node.children || []).map(normalizeItemNode).filter(Boolean)
    };
  }

  function normalizeSearchResponse(data, kind) {
    var hits = (data.hits || []).map(
      kind === "comment" ? normalizeCommentHit : normalizeStoryHit
    );
    var page = Number(data.page || 0);
    var nbPages = Number(data.nbPages || 0);
    return {
      hits: hits,
      page: page,
      nbPages: nbPages,
      nbHits: Number(data.nbHits || 0),
      hitsPerPage: Number(data.hitsPerPage || HITS_PER_PAGE),
      hasMore: page + 1 < nbPages,
      query: data.query || ""
    };
  }

  async function runSearch(spec, options) {
    var page = options && Number.isFinite(options.page) ? options.page : 0;
    var url = buildSearchUrl(spec, page);
    var data = await fetchJson(url, options);
    return normalizeSearchResponse(data, spec.kind);
  }

  function checkedUsername(username) {
    var value = String(username || "").trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      throw new ApiError("INVALID_USER", "Enter a valid Hacker News username.");
    }
    return value;
  }

  async function fetchFeed(feedId, options) {
    var spec = FEEDS[feedId];
    if (!spec) throw new ApiError("INVALID_FEED", "Unknown feed: " + feedId);
    return runSearch(spec, options || {});
  }

  async function fetchSubmitted(username, options) {
    var user = checkedUsername(username);
    return runSearch({
      endpoint: "search_by_date",
      tags: "story,author_" + user,
      kind: "story"
    }, options || {});
  }

  async function fetchUserComments(username, options) {
    var user = checkedUsername(username);
    return runSearch({
      endpoint: "search_by_date",
      tags: "comment,author_" + user,
      kind: "comment"
    }, options || {});
  }

  async function searchStories(query, options) {
    var value = String(query || "").trim();
    if (!value) {
      return {
        hits: [],
        page: 0,
        nbPages: 0,
        nbHits: 0,
        hitsPerPage: HITS_PER_PAGE,
        hasMore: false,
        query: ""
      };
    }
    return runSearch({
      endpoint: "search",
      query: value,
      tags: "story",
      kind: "story"
    }, options || {});
  }

  async function getItem(id, options) {
    var itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new ApiError("NOT_FOUND", "This Hacker News item was not found.");
    }
    var data = await fetchJson(BASE + "/items/" + itemId, options || {});
    return normalizeItemNode(data);
  }

  async function getUser(username, options) {
    var user = checkedUsername(username);
    var data = await fetchJson(BASE + "/users/" + encodeURIComponent(user), options || {});
    return {
      username: data.username || user,
      about: data.about || "",
      karma: Number(data.karma || 0)
    };
  }

  function clearCache() {
    responseCache.clear();
  }

  global.HNApi = {
    BASE: BASE,
    HITS_PER_PAGE: HITS_PER_PAGE,
    FEEDS: FEEDS,
    ApiError: ApiError,
    localDayRange: localDayRange,
    buildSearchUrl: buildSearchUrl,
    fetchFeed: fetchFeed,
    fetchSubmitted: fetchSubmitted,
    fetchUserComments: fetchUserComments,
    searchStories: searchStories,
    getItem: getItem,
    getUser: getUser,
    clearCache: clearCache
  };
})(window);
