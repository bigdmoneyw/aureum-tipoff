# Aureum Tipoff — official domain rollout

**Primary website:** `https://aureumtipoff.com/`

**Status:** Awaiting confirmation that the domain has been registered and is controlled by the site owner. Do not add a root `CNAME` file before ownership and DNS access are confirmed; otherwise, the current Pages address may stop serving correctly.

## One-time owner action

1. Register or confirm control of **aureumtipoff.com** with your domain registrar.
2. In the GitHub repository, open **Settings → Pages → Custom domain** and enter `aureumtipoff.com`, then Save. For branch publishing, GitHub adds a root `CNAME` file automatically.
3. At your domain registrar, create these `A` records for the apex/root host (`@`):
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
4. Add a `CNAME` record for `www`, pointing directly to `bigdmoneyw.github.io` (not to a URL containing `/aureum-tipoff/`).
5. Remove conflicting old `A`, `AAAA`, `ALIAS`, `ANAME` or `www CNAME` records and avoid wildcard domain records.
6. When DNS and certificate provisioning succeed, enable **Enforce HTTPS** in GitHub Pages settings.
7. Check `https://aureumtipoff.com/`, `https://www.aureumtipoff.com/` (redirect), images, internal routing, data snapshots, and mobile navigation. Check the former GitHub Pages URL redirects to the chosen domain.
8. Only after the public domain resolves and TLS works should `<link rel="canonical">` and social preview URL tags be changed to the official address.

**Security:** GitHub recommends verifying the custom domain under GitHub Pages before attaching it, to mitigate domain-takeover risks. Changes in public DNS can take time to propagate; the existing site must stay available until the new address is verified.

Reference: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
