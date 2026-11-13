# GitHub PRs in Linear Diffs

Unofficial Firefox extension. It is not affiliated with, endorsed by, or maintained by Linear.

When you open a GitHub pull request, Firefox takes you to that same pull request in [Linear Diffs](https://linear.app/docs/diffs). A toolbar switch turns the redirect on or off.

This mirrors the behavior of [Linear’s Chrome extension](https://chromewebstore.google.com/detail/linear/cnclkfmjefmdhpdelbalcjohfnnkccja) for `github.com` pull requests. It does not cover Graphite or GitHub Enterprise.

## What it redirects

| GitHub | Linear Diffs |
| --- | --- |
| `https://github.com/<owner>/<repo>/pull/<n>` | `https://linear.app/review/<owner>/<repo>/pull/<n>?from=github` |
| `.../pull/<n>/commits` | same review URL |
| `.../pull/<n>/checks` | same review URL |
| `.../pull/<n>/files` | `https://linear.app/review/<owner>/<repo>/pull/<n>/changes?from=github` |

Query strings and hashes from GitHub are dropped. `?from=github` is how Linear knows to offer a way back.

The extension does not ask for a Linear workspace slug. Linear’s review route is `/review/<owner>/<repo>/pull/<number>`, and the signed-in Linear client resolves the workspace. You need to be signed in to Linear, with code reviews enabled and the repository connected. Otherwise Linear shows its own setup screen.

## How the URL was checked

The destination is the one Linear’s software already uses:

- Linear’s docs say to replace `github.com` with `linear.review` (`github.com/owner/repo/pull/123` → `linear.review/owner/repo/pull/123`). Requesting that URL returns **302** to `https://linear.app/review/owner/repo/pull/123`. `linear.review/.../files` returns **302** to `.../changes`. `linear.review` strips query strings, so `from=github` has to be attached to the `linear.app` URL.
- Linear’s Chrome extension 1.0.2 redirects with declarativeNetRequest to `https://linear.app/review/<owner>/<repo>/pull/<n>?from=github`, and sends the files tab to `/changes`. It lets `?from=linear` through, and it does not redirect navigations started by `linear.app` or `linear.review`.
- Linear’s web client route is `/review/:owner/:repo/pull/:number/:viewMode?` with no workspace segment. It keeps the `changes`, `review`, and `preview` tabs, keeps a `from=github` query, and its “open on GitHub” helper sets `from=linear` on `github.com` links.

## Stay on GitHub once

The redirect is easy to undo, so you cannot get stuck bouncing between the two sites.

- In the toolbar popup, **Open on GitHub** opens the current Linear review on GitHub with `?from=linear`.
- Hold **Alt** (**Option** on macOS) while clicking a GitHub pull request link.
- Paste or edit the GitHub URL so it contains `?from=linear`.
- Links Linear itself opens back to GitHub use that same `from=linear` flag. Navigations started by `linear.app` or `linear.review` are not redirected either.

That page stays on GitHub. Clicking its Files, Commits, or Checks tabs stays on GitHub as well. Opening the pull request again from the address bar, or opening a different pull request, redirects. The popup’s **Open in Linear** button sends the current page back. Pausing the toolbar switch stops every redirect.

## Permissions

Nothing is collected or sent to a server run by this extension. `data_collection_permissions` is `none`.

- **Host access to github.com**, so Firefox can redirect those pull request navigations.
- **declarativeNetRequestWithHostAccess**, for the redirect rules. This permission has no extra install warning. The rules run in the browser; the extension does not see each request.
- **storage**, for the on/off switch on this device.
- **webNavigation**, only to notice when GitHub changes a pull request tab without loading a new document. The new address is passed to that tab and is not stored.
- **activeTab**, so the toolbar popup can read the current page and offer Open on GitHub or Open in Linear.

## Install in Firefox for development

Firefox 140 or newer:

1. Clone this repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Choose the `manifest.json` file in the repository root.

A temporary add-on is removed when Firefox exits. Reload any GitHub tab that was already open.

## Build and sign for addons.mozilla.org

[web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) packages and signs the extension. There is no compile step.

```bash
npm install
npm test
npm run lint
npm run build
```

`npm run build` writes a zip under `web-ext-artifacts/`. That zip is what you upload, or what `web-ext sign` submits.

Create API credentials at [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key/), then:

```bash
export WEB_EXT_API_KEY="user:123456:78"
export WEB_EXT_API_SECRET="your-jwt-secret"
npm run sign
```

`npm run sign` runs `web-ext sign --channel=unlisted`. Use `--channel=listed` instead when you want a public listing. Signing needs the extension id in the manifest (`github-prs-linear-diffs@tanvesh01.github.io`). The signed file is written to `web-ext-artifacts/`.

`npm run lint` runs `web-ext lint`, which is the same checker addons.mozilla.org uses.

## Development

```bash
npm test
npm run lint
```

`test/redirect.test.js` checks the URL mapping against the declarative rules in `rules/github-pull-requests.json`.

## License

[MIT](LICENSE). Copyright (c) 2026 Tanvesh Sarve.
