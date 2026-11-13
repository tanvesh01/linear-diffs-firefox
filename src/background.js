/* global LinearDiffsRedirect */

const ext = globalThis.browser ?? globalThis.chrome;
const RULESET_ID = LinearDiffsRedirect.RULESET_ID;

const ICONS = {
  enabled: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  paused: {
    16: "icons/paused-16.png",
    32: "icons/paused-32.png",
    48: "icons/paused-48.png",
    128: "icons/paused-128.png",
  },
};

let applying = Promise.resolve();

function enqueue(task) {
  const result = applying.then(task, task);
  applying = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

ext.runtime.onInstalled.addListener(() => {
  enqueue(() => reconcile()).catch(showFailure);
});

ext.runtime.onStartup.addListener(() => {
  enqueue(() => reconcile()).catch(showFailure);
});

ext.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "setEnabled") {
    return undefined;
  }
  return enqueue(() => setEnabled(Boolean(message.enabled)))
    .then(() => ({ ok: true }))
    .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
});

// GitHub changes pull-request tabs with history.pushState. That never hits a
// main-frame request, so the declarative rules do not see it. Forward those
// URL changes to the tab. The address is not stored or sent anywhere.
ext.webNavigation.onHistoryStateUpdated.addListener(
  (details) => {
    if (details.frameId !== 0 || !LinearDiffsRedirect.parseGitHubPullRequest(details.url)) {
      return;
    }
    ext.tabs.sendMessage(details.tabId, { type: "history" }).catch(() => {});
  },
  { url: [{ hostEquals: "github.com", schemes: ["http", "https"] }] },
);

enqueue(() => reconcile()).catch(showFailure);

async function reconcile() {
  const dnrReady = await rulesAreSupported();
  const stored = await ext.storage.local.get({ enabled: true });
  await setEnabled(Boolean(stored.enabled), { dnrReady });
}

async function setEnabled(enabled, extras) {
  if (enabled) {
    await ext.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [RULESET_ID],
      disableRulesetIds: [],
    });
  } else {
    await ext.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [],
      disableRulesetIds: [RULESET_ID],
    });
  }
  await ext.storage.local.set({ enabled: Boolean(enabled), ...extras });
  await showState(Boolean(enabled));
}

async function rulesAreSupported() {
  if (!ext.declarativeNetRequest.isRegexSupported) {
    return true;
  }
  const patterns = LinearDiffsRedirect.buildRedirectRules().map((rule) => rule.condition.regexFilter);
  const results = await Promise.all(patterns.map((regex) => ext.declarativeNetRequest.isRegexSupported({ regex })));
  return results.every((result) => result.isSupported);
}

async function showState(enabled) {
  await ext.action.setIcon({ path: enabled ? ICONS.enabled : ICONS.paused });
  await ext.action.setTitle({
    title: enabled ? "GitHub PRs in Linear Diffs" : "GitHub PRs in Linear Diffs (paused)",
  });
  await ext.action.setBadgeText({ text: "" });
}

async function showFailure() {
  await ext.action.setBadgeText({ text: "!" });
  await ext.action.setBadgeBackgroundColor({ color: "#9f1239" });
  await ext.action.setTitle({ title: "GitHub PRs in Linear Diffs could not update its redirect rules" });
}
