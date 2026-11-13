/**
 * URL rules for opening a GitHub pull request in Linear Diffs.
 *
 * Verified against Linear's own code, not invented:
 * - Chrome extension 1.0.2 (cnclkfmjefmdhpdelbalcjohfnnkccja) redirects
 *   github.com/<owner>/<repo>/pull/<n> to
 *   https://linear.app/review/<owner>/<repo>/pull/<n>?from=github
 *   and github.com/.../pull/<n>/files to the same path with /changes.
 *   Commits and checks use the review root. A `from=linear` query is allowed
 *   through so Linear can link back to GitHub without a loop.
 * - linear.review/<owner>/<repo>/pull/<n> answers 302 to that linear.app path,
 *   and linear.review/.../files answers 302 to .../changes. linear.review
 *   drops query strings, so the from flag has to be on linear.app directly.
 * - Linear's web client route is /review/:owner/:repo/pull/:number/:viewMode?
 *   with no workspace slug. It keeps the view modes changes, review, and
 *   preview, and it keeps a from=github or from=graphite query. Its
 *   openedFromLinearUrl() sets from=linear on github.com links.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LinearDiffsRedirect = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RULESET_ID = "github-pull-requests";
  const GITHUB_BYPASS_PARAM = "from";
  const GITHUB_BYPASS_VALUE = "linear";
  const LINEAR_ORIGIN = "https://linear.app";

  const OWNER_SRC = "[A-Za-z0-9_-]+";
  const REPO_SRC = "[A-Za-z0-9_.-]+";
  const NUMBER_SRC = "[1-9][0-9]*";
  const OWNER = `(${OWNER_SRC})`;
  const REPO = `(${REPO_SRC})`;
  const NUMBER = `(${NUMBER_SRC})`;
  const QUERY = "([?#].*)?";

  const GITHUB_PR_PATH = new RegExp(
    `^/(${OWNER_SRC})/(${REPO_SRC})/pull/(${NUMBER_SRC})(?:/(files|commits|checks))?/?$`,
    "i",
  );

  // One optional tab segment so a new Linear tab still has an "Open on GitHub" escape.
  const LINEAR_APP_PATH = new RegExp(
    `^/review/(${OWNER_SRC})/(${REPO_SRC})/pull/(${NUMBER_SRC})(?:/([A-Za-z0-9_-]+))?/?$`,
    "i",
  );
  const LINEAR_SHORT_PATH = new RegExp(
    `^/(${OWNER_SRC})/(${REPO_SRC})/pull/(${NUMBER_SRC})(?:/([A-Za-z0-9_-]+))?/?$`,
    "i",
  );

  const GITHUB_HOST = "github\\.com";
  const RULE_PATTERNS = {
    allow: `^https?://${GITHUB_HOST}/[^?#]*[?]([^#]*&)?from=linear(&|#|$)`,
    files: `^https?://${GITHUB_HOST}/${OWNER}/${REPO}/pull/${NUMBER}/files/?${QUERY}$`,
    commits: `^https?://${GITHUB_HOST}/${OWNER}/${REPO}/pull/${NUMBER}/commits/?${QUERY}$`,
    checks: `^https?://${GITHUB_HOST}/${OWNER}/${REPO}/pull/${NUMBER}/checks/?${QUERY}$`,
    root: `^https?://${GITHUB_HOST}/${OWNER}/${REPO}/pull/${NUMBER}/?${QUERY}$`,
  };

  function pageKey(page) {
    return `${page.owner.toLowerCase()}/${page.repo.toLowerCase()}#${page.number}`;
  }

  function rejectedRepo(name) {
    return name === "." || name === "..";
  }

  function readUrl(href) {
    try {
      return new URL(href);
    } catch {
      return null;
    }
  }

  function parseGitHubPullRequest(href) {
    const url = readUrl(href);
    if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
      return null;
    }
    if (url.hostname !== "github.com") {
      return null;
    }
    const match = GITHUB_PR_PATH.exec(url.pathname);
    if (!match || rejectedRepo(match[2])) {
      return null;
    }
    return {
      owner: match[1],
      repo: match[2],
      number: match[3],
      tab: (match[4] || "").toLowerCase(),
    };
  }

  function parseLinearReview(href) {
    const url = readUrl(href);
    if (!url || url.protocol !== "https:") {
      return null;
    }
    const match =
      url.hostname === "linear.app"
        ? LINEAR_APP_PATH.exec(url.pathname)
        : url.hostname === "linear.review"
          ? LINEAR_SHORT_PATH.exec(url.pathname)
          : null;
    if (!match || rejectedRepo(match[2])) {
      return null;
    }
    return {
      owner: match[1],
      repo: match[2],
      number: match[3],
      view: (match[4] || "").toLowerCase(),
    };
  }

  function isOpenedFromLinear(href) {
    const url = readUrl(href);
    if (!url) {
      return false;
    }
    return url.searchParams.getAll(GITHUB_BYPASS_PARAM).some((value) => value.toLowerCase() === GITHUB_BYPASS_VALUE);
  }

  function linearUrlFor(href) {
    const page = parseGitHubPullRequest(href);
    if (!page) {
      return null;
    }
    // Linear's review route only keeps changes, review, and preview.
    // /files is the changes tab. Commits and checks are not view modes, so
    // they open the review itself — the same choice as Linear's extension.
    const suffix = page.tab === "files" ? "/changes" : "";
    return `${LINEAR_ORIGIN}/review/${page.owner}/${page.repo}/pull/${page.number}${suffix}?from=github`;
  }

  function destination(href) {
    if (isOpenedFromLinear(href)) {
      return null;
    }
    return linearUrlFor(href);
  }

  function githubUrlFor(href) {
    const page = parseLinearReview(href);
    if (!page) {
      return null;
    }
    let suffix = "";
    if (page.view === "changes" || page.view === "files") {
      suffix = "/files";
    } else if (page.view === "commits" || page.view === "checks") {
      suffix = `/${page.view}`;
    }
    return `https://github.com/${page.owner}/${page.repo}/pull/${page.number}${suffix}?from=linear`;
  }

  function withBypass(href) {
    const url = readUrl(href);
    if (!url) {
      return null;
    }
    url.searchParams.set(GITHUB_BYPASS_PARAM, GITHUB_BYPASS_VALUE);
    url.hash = "";
    return url.href;
  }

  function classifyDocumentLoad({ href, enabled, dnrReady, bypassKeys }) {
    const page = parseGitHubPullRequest(href);
    if (!page) {
      return { action: "ignore" };
    }
    const key = pageKey(page);
    if (isOpenedFromLinear(href) || bypassKeys.has(key)) {
      return { action: "stay", key };
    }
    if (!enabled) {
      return { action: "ignore", key };
    }
    // A declarativeNetRequest redirect would already have left GitHub.
    // Still being here means this load was allowed (Linear opened it, or the
    // bypass param survived a redirect the ruleset did not see).
    if (dnrReady) {
      return { action: "stay", key };
    }
    const url = destination(href);
    return url ? { action: "redirect", url, key } : { action: "ignore", key };
  }

  function classifyHistoryChange({ href, enabled, bypassKeys }) {
    const page = parseGitHubPullRequest(href);
    if (!page) {
      return { action: "ignore" };
    }
    const key = pageKey(page);
    if (!enabled || isOpenedFromLinear(href) || bypassKeys.has(key)) {
      return { action: enabled || isOpenedFromLinear(href) || bypassKeys.has(key) ? "stay" : "ignore", key };
    }
    const url = destination(href);
    return url ? { action: "redirect", url, key } : { action: "ignore", key };
  }

  function shouldForceGitHubClick({ href, altKey, enabled, bypassKeys }) {
    if (!enabled) {
      return false;
    }
    const page = parseGitHubPullRequest(href);
    if (!page) {
      return false;
    }
    return Boolean(altKey) || bypassKeys.has(pageKey(page));
  }

  function redirectRule(id, pattern, substitution) {
    return {
      id,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { regexSubstitution: substitution },
      },
      condition: {
        regexFilter: pattern,
        isUrlFilterCaseSensitive: false,
        resourceTypes: ["main_frame"],
        requestMethods: ["get"],
        excludedInitiatorDomains: ["linear.app", "linear.review"],
      },
    };
  }

  function buildRedirectRules() {
    return [
      {
        id: 1,
        priority: 2,
        action: { type: "allow" },
        condition: {
          regexFilter: RULE_PATTERNS.allow,
          resourceTypes: ["main_frame"],
        },
      },
      redirectRule(2, RULE_PATTERNS.files, "https://linear.app/review/\\1/\\2/pull/\\3/changes?from=github"),
      redirectRule(3, RULE_PATTERNS.commits, "https://linear.app/review/\\1/\\2/pull/\\3?from=github"),
      redirectRule(4, RULE_PATTERNS.checks, "https://linear.app/review/\\1/\\2/pull/\\3?from=github"),
      redirectRule(5, RULE_PATTERNS.root, "https://linear.app/review/\\1/\\2/pull/\\3?from=github"),
    ];
  }

  return {
    RULESET_ID,
    RULE_PATTERNS,
    pageKey,
    parseGitHubPullRequest,
    parseLinearReview,
    isOpenedFromLinear,
    linearUrlFor,
    destination,
    githubUrlFor,
    withBypass,
    classifyDocumentLoad,
    classifyHistoryChange,
    shouldForceGitHubClick,
    buildRedirectRules,
  };
});
