---
name: paper-access
description: >-
  Reach an academic paper behind an institutional subscription by routing the
  request through the right network path (Playwright with the user's IP, an
  optional institution proxy, or WebFetch for open access). Never reports a
  paper as paywalled without exhausting every configured institutional path.
  TRIGGER: the user asks to read, review, analyze, summarize, or fetch an
  academic paper, journal article, DOI, preprint, or any publication from
  scholarly publishers (Nature, Science, Elsevier/ScienceDirect, ACS, Wiley,
  RSC, Springer, IEEE, AAAS, etc.), especially when subscription access may be
  required.
---

# Paper Access Workflow

## Overview

Institutional subscriptions can be reached two ways: (1) directly from the user's own network via IP-based access, and (2) optionally through the user's institution library proxy. To enable the proxy path (Tier 2), set `paper_access.institution_proxy_url` in config — a URL pattern that contains a `{URL}` placeholder for the original paper URL.

**Core rule:** Never tell the user "this is paywalled" without exhausting every configured institutional path.

## Auto-detection (Onboarding)

You normally don't hand-write `institution_proxy_url`. The onboarding wizard (Phase 2.4) registers it **semi-automatically**: it opens your institution's library portal in Playwright, you log in and open any one subscription article, and the wizard captures the resulting URL and extracts the proxy pattern (the part before `url=`/`qurl=`, or an OpenAthens `redirector` form), then validates it against a second subscription URL before writing it to config.

- **Credential-handling is forbidden.** The wizard never asks for, receives, or programmatically enters your library ID / password / OTP. **You log in yourself in the browser**; it only waits for your "done" signal. (Institutional SSO uses device fingerprinting + MFA, so programmatic login fails or locks the account — and credentials must never enter the session transcript.)
- **Host-rewriting proxies can't be auto-registered.** If your proxy merges the origin domain into the hostname (e.g. `www-nature-com.proxy.univ.ac.kr`), the `{prefix}{URL}` pattern can't express it and Tier 2 can't auto-convert it. In that case leave `institution_proxy_url` unset and rely on Tier 1 (IP-based) access.
- If Playwright MCP is unavailable during onboarding, you enter the pattern manually from the three example forms (EZproxy / OpenAthens / redirector).

## Why the Order Matters

The tool you choose determines *which IP* the request originates from, which determines *which subscription* the publisher sees:

| Tool | Originating IP | Subscription |
|---|---|---|
| **Playwright MCP** | User's local PC / network | Institution ✓ (IP-based) |
| **WebFetch** | Anthropic server | Neither ✗ |
| **Playwright + institution proxy URL** | Institution proxy infrastructure | Institution ✓ (proxy-based) |

This is why Playwright is primary: it actually uses the user's subscribed IP. WebFetch is only useful for open-access content or when content is cached server-side.

## Tier 1 — Playwright with Original URL (IP-based subscription)

**Try first for any journal paper.** Use Playwright MCP to navigate from the user's machine:

```
mcp__playwright__browser_navigate({ url: <original paper URL> })
mcp__playwright__browser_evaluate(<paywall detector, see below>)
```

If detector reports full text present and no paywall signals, extract text/PDF. **Done.**

**Shortcut for obvious open-access:** If URL is arxiv.org, a preprint server, PMC, or clearly OA DOI, WebFetch is fine — it's faster and consumes fewer tokens.

## Tier 2 — Playwright with Institution Proxy URL

Only available when `paper_access.institution_proxy_url` is set. If Tier 1 hits a paywall, rewrite the URL through the configured proxy pattern by substituting the original paper URL for the `{URL}` placeholder:

```
# config: paper_access.institution_proxy_url = "https://<your-institution-proxy>/...?url={URL}"
# → replace {URL} with the original paper URL
```

Then navigate via Playwright:

```
mcp__playwright__browser_navigate({ url: <proxy-wrapped URL> })
```

The proxy redirects back to the publisher domain but with institutional cookies set, granting access under the institution's subscription.

### Prerequisite: Active Library Session

Before using Tier 2, verify the institution library session is live — navigate to the library's home/login page and check whether the user is logged in:

```
mcp__playwright__browser_navigate({ url: "<your institution library home URL>" })
mcp__playwright__browser_evaluate({
  function: "() => ({ url: location.href, loggedIn: !location.href.includes('/login') })"
})
```

- If `loggedIn: true` → proceed
- If `loggedIn: false` → tell the user: **"도서관 세션이 만료됐습니다. 열려있는 Playwright 창에서 로그인한 후 '완료'라고 말씀해주세요."** Do NOT attempt programmatic login (institutional SSO often uses device fingerprinting / MFA that will fail or flag the attempt).

After the user confirms login, resume with the proxy-wrapped URL.

## Paywall Detection

Run this in Playwright to decide whether a page shows full text or a paywall:

```javascript
() => {
  const body = document.body.innerText;
  const signals = {
    paywallRegex: /Access through your institution|Buy article|Subscribe to|Get access to this article|Rent this article|Purchase PDF|Sign in to read/i.test(body),
    paywallDom: !!document.querySelector('.c-article-buy-box, .Paywall, .article__access, .access-options, [data-test="price-access-options"]'),
    shortBody: body.length < 3000,
    loginRedirect: /\/login|\/action\/showLogin|\/paywall/.test(location.href),
    fullTextPresent: !!document.querySelector('section[data-title="Abstract"], .c-article-body, article[itemprop="mainEntity"], #bodyContent, .article__sections')
  };
  const paywallCount = [signals.paywallRegex, signals.paywallDom, signals.shortBody, signals.loginRedirect].filter(Boolean).length;
  return {
    ...signals,
    verdict: signals.fullTextPresent && paywallCount < 2 ? 'ACCESS_OK' : 'PAYWALL'
  };
}
```

Rule: `fullTextPresent` AND `<2 paywall signals` → access OK. Otherwise escalate.

## Quick Reference

| Situation | Action |
|---|---|
| DOI only | Resolve via `https://doi.org/{DOI}` redirect, then Tier 1 |
| Clearly OA (arxiv, PMC, bioRxiv) | WebFetch straight away — skip Playwright |
| PDF wanted | After successful access: `meta[name="citation_pdf_url"]` or `a[data-track-action="download pdf"]` |
| Multiple papers | Reuse the same Playwright session; don't reopen browser per paper |
| Library session expires mid-batch | Pause, ask user to re-login, resume |
| Playwright MCP unavailable | Tell user Tier 1/2 need the Playwright MCP server; offer WebFetch as open-access-only fallback |
| No `institution_proxy_url` configured | Tier 2 unavailable — use Tier 1 (IP-based) and OA fallback only |

## Common Mistakes

- **Using WebFetch expecting institutional access.** WebFetch originates from Anthropic's network, not the user's institution. Only works for OA or server-cached content.
- **Claiming "paywalled" after only Tier 1.** Some publishers work via the proxy but not the direct IP (or vice versa). Always try Tier 2 (if configured) before reporting failure.
- **Programmatic institutional login attempts.** Device fingerprinting plus SSO MFA will either fail or trigger an account lock. Always ask the user to log in manually.
- **Closing the Playwright window between papers.** Institution session cookies live in that browser context; killing it requires a fresh login.
- **Trusting HTTP 200 as "access OK".** Publishers return 200 for paywall pages too. Always run the detector.

## Red Flags — Stop and Reconsider

- About to say "이 논문은 구독이 필요합니다" → Did you try Tier 2 (if a proxy is configured)?
- About to use WebFetch for a subscription journal → It won't work, switch to Playwright
- About to log in to the library for the user → Don't. Ask them to do it manually
- Detector shows `ACCESS_OK` but body is only 500 chars → Probably abstract page, not full text. Look for "Read full text" or DOI landing page
