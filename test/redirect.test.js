const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const redirect = require("../src/redirect.js");

const ROOT = "https://linear.app/review/linear/linear/pull/123?from=github";

test("GitHub pull request root opens the Linear review URL", () => {
  assert.equal(redirect.destination("https://github.com/linear/linear/pull/123"), ROOT);
  assert.equal(redirect.destination("http://github.com/linear/linear/pull/123/"), ROOT);
  assert.equal(redirect.destination("https://github.com/linear/linear/pull/123?w=1#discussion_r1"), ROOT);
});

test("preserves owner and repository case", () => {
  assert.equal(
    redirect.destination("https://github.com/Linear/Linear-App/pull/8"),
    "https://linear.app/review/Linear/Linear-App/pull/8?from=github",
  );
});

test("files tab opens the Linear changes tab", () => {
  assert.equal(
    redirect.destination("https://github.com/owner/repo.name/pull/7/files"),
    "https://linear.app/review/owner/repo.name/pull/7/changes?from=github",
  );
  assert.equal(
    redirect.destination("https://github.com/owner/repo/pull/7/files/?w=1"),
    "https://linear.app/review/owner/repo/pull/7/changes?from=github",
  );
});

test("commits and checks open the review itself", () => {
  assert.equal(redirect.destination("https://github.com/owner/repo/pull/7/commits"), ROOT.replace("linear/linear/pull/123", "owner/repo/pull/7"));
  assert.equal(
    redirect.destination("https://github.com/owner/repo/pull/7/checks/"),
    "https://linear.app/review/owner/repo/pull/7?from=github",
  );
});

test("does not redirect pages that are not a pull request tab", () => {
  const skipped = [
    "https://github.com/owner/repo",
    "https://github.com/owner/repo/issues/123",
    "https://github.com/owner/repo/pull/123/files/src/index.js",
    "https://github.com/owner/repo/pull/123/commits/abcdef",
    "https://github.com/owner/repo/pull/0",
    "https://github.com/owner/repo/pull/01",
    "https://gist.github.com/owner/repo/pull/1",
    "https://github.com/../repo/pull/1",
    "https://linear.app/review/owner/repo/pull/1",
  ];
  for (const href of skipped) {
    assert.equal(redirect.destination(href), null, href);
  }
});

test("from=linear stays on GitHub, including alongside other parameters", () => {
  assert.equal(redirect.destination("https://github.com/owner/repo/pull/4?from=linear"), null);
  assert.equal(redirect.destination("https://github.com/owner/repo/pull/4?w=1&from=linear#files"), null);
  assert.equal(redirect.destination("https://github.com/owner/repo/pull/4?from=LINEAR"), null);
  assert.equal(redirect.isOpenedFromLinear("https://github.com/owner/repo/pull/4?from=linearity"), false);
  assert.notEqual(redirect.destination("https://github.com/owner/repo/pull/4?from=linearity"), null);
  assert.equal(redirect.isOpenedFromLinear("https://github.com/owner/repo/pull/4#from=linear"), false);
});

test("Open on GitHub uses from=linear and maps the changes tab back to files", () => {
  assert.equal(
    redirect.githubUrlFor("https://linear.app/review/owner/repo/pull/4?from=github"),
    "https://github.com/owner/repo/pull/4?from=linear",
  );
  assert.equal(
    redirect.githubUrlFor("https://linear.app/review/owner/repo/pull/4/changes"),
    "https://github.com/owner/repo/pull/4/files?from=linear",
  );
  assert.equal(
    redirect.githubUrlFor("https://linear.app/review/owner/repo/pull/4/review"),
    "https://github.com/owner/repo/pull/4?from=linear",
  );
  assert.equal(
    redirect.githubUrlFor("https://linear.review/owner/repo/pull/4/files"),
    "https://github.com/owner/repo/pull/4/files?from=linear",
  );
  assert.equal(redirect.githubUrlFor("https://linear.app/acme/issue/ENG-1"), null);
});

test("withBypass matches the declarative allow rule", () => {
  const allow = new RegExp(redirect.RULE_PATTERNS.allow, "i");
  const hrefs = [
    "https://github.com/owner/repo/pull/4",
    "https://github.com/owner/repo/pull/4/files?w=1#diff",
    "https://github.com/Owner/Repo.Name/pull/15/checks",
  ];
  for (const href of hrefs) {
    const bypassed = redirect.withBypass(href);
    assert.equal(allow.test(bypassed), true, bypassed);
    assert.equal(redirect.destination(bypassed), null);
  }
});

test("declarative rules agree with destination()", () => {
  const rules = redirect.buildRedirectRules();
  const samples = [
    "https://github.com/linear/linear/pull/123",
    "https://GitHub.com/Linear/Linear-App/pull/8/",
    "http://github.com/owner/my.repo/pull/7/files?w=1",
    "https://github.com/owner/repo/pull/7/files/",
    "https://github.com/owner/repo/pull/7/commits",
    "https://github.com/owner/repo/pull/7/checks#check",
    "https://github.com/owner/repo/pull/4?from=linear",
    "https://github.com/owner/repo/pull/4/files?foo=1&from=linear",
    "https://github.com/owner/repo/issues/4",
    "https://github.com/owner/repo/pull/7/files/readme.md",
  ];
  for (const href of samples) {
    const applied = applyRules(href, rules);
    const expected = redirect.destination(href);
    if (redirect.isOpenedFromLinear(href) && redirect.parseGitHubPullRequest(href)) {
      assert.equal(applied.type, "allow", href);
      assert.equal(expected, null);
    } else if (expected) {
      assert.deepEqual(applied, { type: "redirect", url: expected }, href);
    } else {
      assert.equal(applied, null, href);
    }
  }
});

test("checked-in rules file matches buildRedirectRules()", () => {
  const file = path.join(__dirname, "..", "rules", "github-pull-requests.json");
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(saved, redirect.buildRedirectRules());
});

test("a bypassed document stays, and a later tab change can still redirect", () => {
  const bypassKeys = new Set();
  const stayed = redirect.classifyDocumentLoad({
    href: "https://github.com/owner/repo/pull/4?from=linear",
    enabled: true,
    dnrReady: true,
    bypassKeys,
  });
  assert.equal(stayed.action, "stay");
  bypassKeys.add(stayed.key);

  const samePullRequest = redirect.classifyHistoryChange({
    href: "https://github.com/owner/repo/pull/4/files",
    enabled: true,
    bypassKeys,
  });
  assert.equal(samePullRequest.action, "stay");

  const other = redirect.classifyHistoryChange({
    href: "https://github.com/owner/repo/pull/9",
    enabled: true,
    bypassKeys,
  });
  assert.equal(other.action, "redirect");
  assert.equal(other.url, "https://linear.app/review/owner/repo/pull/9?from=github");
});

test("Alt-click and an in-session bypass force GitHub; a paused extension does not", () => {
  const href = "https://github.com/owner/repo/pull/4/files";
  const bypassKeys = new Set([redirect.pageKey(redirect.parseGitHubPullRequest(href))]);
  assert.equal(redirect.shouldForceGitHubClick({ href, altKey: true, enabled: true, bypassKeys: new Set() }), true);
  assert.equal(redirect.shouldForceGitHubClick({ href, altKey: false, enabled: true, bypassKeys }), true);
  assert.equal(redirect.shouldForceGitHubClick({ href, altKey: true, enabled: false, bypassKeys }), false);
  assert.equal(
    redirect.shouldForceGitHubClick({
      href: "https://github.com/owner/repo/issues/4",
      altKey: true,
      enabled: true,
      bypassKeys: new Set(),
    }),
    false,
  );
});

test("when network rules are unavailable the content script redirects the load", () => {
  const decision = redirect.classifyDocumentLoad({
    href: "https://github.com/owner/repo/pull/3/files",
    enabled: true,
    dnrReady: false,
    bypassKeys: new Set(),
  });
  assert.deepEqual(decision, {
    action: "redirect",
    url: "https://linear.app/review/owner/repo/pull/3/changes?from=github",
    key: "owner/repo#3",
  });
});

function applyRules(href, rules) {
  const matches = [];
  for (const rule of rules) {
    const flags = rule.condition.isUrlFilterCaseSensitive === false ? "i" : "";
    const match = new RegExp(rule.condition.regexFilter, flags).exec(href);
    if (match) {
      matches.push({ rule, match });
    }
  }
  if (matches.length === 0) {
    return null;
  }
  matches.sort((left, right) => right.rule.priority - left.rule.priority);
  const winner = matches[0];
  if (winner.rule.action.type === "allow") {
    return { type: "allow" };
  }
  const substitution = winner.rule.action.redirect.regexSubstitution.replace(/\\(\d)/g, (_, index) => {
    return winner.match[Number(index)] ?? "";
  });
  return { type: "redirect", url: substitution };
}
