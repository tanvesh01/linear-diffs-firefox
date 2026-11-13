/* global LinearDiffsRedirect */

const ext = globalThis.browser ?? globalThis.chrome;
const redirect = LinearDiffsRedirect;

if (window.top === window && redirect) {
  const bypassKeys = new Set();
  let enabled = true;
  let dnrReady = true;
  let lastHref = location.href;
  let settingsReady = Promise.resolve();

  const initialPage = redirect.parseGitHubPullRequest(location.href);
  if (initialPage && redirect.isOpenedFromLinear(location.href)) {
    bypassKeys.add(redirect.pageKey(initialPage));
  }

  settingsReady = ext.storage.local
    .get({ enabled: true, dnrReady: true })
    .then((stored) => {
      enabled = Boolean(stored.enabled);
      dnrReady = stored.dnrReady !== false;
      applyDocumentLoad();
    })
    .catch(() => {});

  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    if (changes.enabled) {
      enabled = Boolean(changes.enabled.newValue);
    }
    if (changes.dnrReady) {
      dnrReady = changes.dnrReady.newValue !== false;
    }
    if (changes.enabled && enabled) {
      const decision = redirect.classifyHistoryChange({
        href: location.href,
        enabled: true,
        bypassKeys,
      });
      if (decision.action === "stay" && decision.key) {
        bypassKeys.add(decision.key);
      }
      if (decision.action === "redirect") {
        location.replace(decision.url);
      }
    }
  });

  ext.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "history") {
      return undefined;
    }
    onHistory();
    return undefined;
  });

  window.addEventListener("click", onClick, true);
  window.addEventListener("auxclick", onClick, true);

  function applyDocumentLoad() {
    const decision = redirect.classifyDocumentLoad({
      href: location.href,
      enabled,
      dnrReady,
      bypassKeys,
    });
    if (decision.action === "stay" && decision.key) {
      bypassKeys.add(decision.key);
    }
    if (decision.action === "redirect") {
      location.replace(decision.url);
    }
  }

  function onHistory() {
    const href = location.href;
    if (href === lastHref) {
      return;
    }
    lastHref = href;
    settingsReady.then(() => {
      if (location.href !== href) {
        return;
      }
      const decision = redirect.classifyHistoryChange({ href, enabled, bypassKeys });
      if (decision.action === "stay" && decision.key) {
        bypassKeys.add(decision.key);
      }
      if (decision.action === "redirect") {
        location.replace(decision.url);
      }
    });
  }

  function onClick(event) {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    const target = event.target;
    const anchor = target instanceof Element ? target.closest("a[href]") : null;
    if (!anchor || anchor.hasAttribute("download")) {
      return;
    }
    let href = anchor.href;
    try {
      href = new URL(anchor.getAttribute("href"), location.href).href;
    } catch {
      return;
    }
    if (
      !redirect.shouldForceGitHubClick({
        href,
        altKey: event.altKey,
        enabled,
        bypassKeys,
      })
    ) {
      return;
    }
    const bypassed = redirect.withBypass(href);
    if (!bypassed) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const newTab = event.button === 1 || event.metaKey || event.ctrlKey || anchor.target === "_blank";
    if (newTab) {
      window.open(bypassed, "_blank", "noopener,noreferrer");
      return;
    }
    location.assign(bypassed);
  }
}
