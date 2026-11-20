# Aureum Tipoff — connect the official domain

**Target public website:** https://aureumtipoff.com/

**Registrar and DNS host:** Porkbun (domain already purchased).

**Deployment:** GitHub Pages at `https://bigdmoneyw.github.io/aureum-tipoff/`, currently serving the site.

**Prepared release:** [Domain activation PR #1](https://github.com/bigdmoneyw/aureum-tipoff/pull/1). This is intentionally a **draft**, so the currently working site is not prematurely redirected to the parked custom domain. It contains the root `CNAME` and canonical/social metadata.

## Confirmed DNS at the initial audit

- Apex/root A records: `207.207.210.36`, `207.207.210.50`, `207.207.210.23`.
- `www` CNAME: `uixie.porkbun.com`.
- Root HTTPS returned a redirect to `aureumtipoff-com.l.ink`, the parking destination.
- Authoritative nameservers: `maceio.ns.porkbun.com`, `salvador.ns.porkbun.com`, `fortaleza.ns.porkbun.com`, `curitiba.ns.porkbun.com`.

These are **parking records**, not GitHub Pages records.

## Porkbun: exact DNS changes

1. Log in to https://porkbun.com/account/domains.
2. Find `aureumtipoff.com`, select **DNS** (or Details → DNS Records).
3. Remove the **three apex/root parking A records** noted above and replace the existing `www` CNAME that targets `uixie.porkbun.com`.
4. Add the following:

| Type | Host field (Porkbun) | Answer / Value |
| --- | --- | --- |
| A | Leave blank | `185.199.108.153` |
| A | Leave blank | `185.199.109.153` |
| A | Leave blank | `185.199.110.153` |
| A | Leave blank | `185.199.111.153` |
| CNAME | `www` | `bigdmoneyw.github.io` |

Leave unrelated MX/TXT/email and authentication records in place. If you use external nameservers later, make DNS changes at that provider instead of Porkbun.

## GitHub: release after DNS is correct

1. Check the apex A records and www CNAME, either with the `Custom Domain DNS Diagnostics` GitHub Actions workflow or a public DNS checker.
2. Once DNS points to GitHub Pages, finish PR #1 (mark ready and merge). It adds the root `CNAME` value `aureumtipoff.com` and official-domain meta tags. Alternatively, GitHub **Settings → Pages → Custom domain → Save** can create/manage the CNAME file automatically for branch publishing.
3. Confirm GitHub **Settings → Pages → Custom domain** displays `aureumtipoff.com`. Verify ownership through GitHub if prompted.
4. Enable **Enforce HTTPS** after GitHub provisions a certificate.
5. Test `https://aureumtipoff.com/`, the `www` redirect to the apex, internal hash navigation, CSS/JS and team images, and data feeds.

Do **not** merge PR #1 while the Porkbun parking DNS is active. GitHub Pages may redirect traffic from the working GitHub Pages address to the parked domain.

Documentation: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site and https://kb.porkbun.com/article/231-how-to-add-dns-records-on-porkbun.
