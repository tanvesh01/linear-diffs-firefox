/* global LinearDiffsRedirect */

const ext = globalThis.browser ?? globalThis.chrome;
const redirect = LinearDiffsRedirect;

const enabledInput = document.getElementById("enabled");
const status = document.getElementById("status");
const context = document.getElementById("context");
const contextName = document.getElementById("context-name");
const contextAction = document.getElementById("context-action");

enabledInput.addEventListener("change", async () => {
  const next = enabledInput.checked;
  enabledInput.disabled = true;
  renderStatus(next, "");
  try {
    const response = await ext.runtime.sendMessage({ type: "setEnabled", enabled: next });
    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "Could not update the redirect.");
    }
    renderStatus(next, "");
  } catch (error) {
    const stored = await ext.storage.local.get({ enabled: true });
    enabledInput.checked = Boolean(stored.enabled);
    renderStatus(enabledInput.checked, error instanceof Error ? error.message : "Could not update the redirect.");
  } finally {
    enabledInput.disabled = false;
  }
});

init().catch((error) => {
  status.textContent = error instanceof Error ? error.message : "Could not read the extension settings.";
});

async function init() {
  const stored = await ext.storage.local.get({ enabled: true });
  enabledInput.checked = Boolean(stored.enabled);
  renderStatus(enabledInput.checked, "");
  await showCurrentPage();
}

function renderStatus(enabled, error) {
  status.textContent = error
    ? error
    : enabled
      ? "On. GitHub pull requests open in Linear Diffs."
      : "Paused. GitHub pull requests stay on GitHub.";
}

async function showCurrentPage() {
  const tabs = await ext.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !tab.url) {
    return;
  }

  const openOnGitHub = redirect.githubUrlFor(tab.url);
  const linearPage = redirect.parseLinearReview(tab.url);
  if (openOnGitHub && linearPage) {
    showAction(tab.id, openOnGitHub, `${linearPage.owner}/${linearPage.repo}#${linearPage.number}`, "Open on GitHub");
    return;
  }

  const page = redirect.parseGitHubPullRequest(tab.url);
  const openInLinear = redirect.linearUrlFor(tab.url);
  if (page && openInLinear) {
    showAction(tab.id, openInLinear, `${page.owner}/${page.repo}#${page.number}`, "Open in Linear");
  }
}

function showAction(tabId, url, name, label) {
  contextName.textContent = name;
  contextName.title = name;
  contextAction.textContent = label;
  contextAction.addEventListener("click", async () => {
    contextAction.disabled = true;
    await ext.tabs.update(tabId, { url });
    window.close();
  });
  context.hidden = false;
}
