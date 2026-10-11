# Spec: anonymous visit counting (Vercel Web Analytics)

## Objective
The site owner wants to know how many people use the site and which pages they read,
without making visitors sign up. Every page sends an anonymous page view to Vercel Web
Analytics; the owner reads counts, top pages, referrers and countries in the Vercel dashboard.

## What it leaves out
- No sign-up, login, names or emails: it shows how many, not who.
- No click tracking (Vercel custom events need a paid plan).
- The Tried / Adopted / Not for me marks stay in the visitor's browser, never sent anywhere.
- No new dependencies, no build step, no change to `vercel.json` unless testing proves it needed (ask first).

## Approach (chosen: B)
About six lines in `assets/site.js`, which all 41 pages already load, set up `window.va`
and load Vercel's script from the project's unique path (one clearly named constant).
The script is same-origin, so the existing Content-Security-Policy should allow it.
Rejected: A, two tags in each of the 41 pages (many edits, easy to miss a new page);
C, the `@vercel/analytics` package (needs a build step the site does not have).

## Important constraint
These files are generated from a private repo and replaced on every publish. This change
is built here as a prototype; porting notes say what to copy into the private repo.

## Parts touched
`assets/site.js`, `about/index.html`, `tests/`, `SPEC.md`, a porting-notes file.

## Commands
- Test: `node --test` (from the project root; Node's built-in runner, no install)

## Slices
0. Safety tests pinning today's behaviour (pages load site.js, tools.json loads, marks work).
1. Analytics loader in `site.js`, using the unique path from the Vercel dashboard.
2. One line on the About page: visits are counted anonymously, no cookies, no accounts.
3. Porting notes for the private repo.

## Success criteria
1. `node --test` passes.
2. After deploy (checked by the owner): the browser Network tab shows a request ending in `/view`.
3. Visits appear in Vercel > Analytics.

## Boundaries
- Ask first: new dependencies, `vercel.json` or deployment changes, commits.
- Never: push, collect personal data, send the marks anywhere.

## Open questions
- The unique script path, available after Web Analytics is enabled in the Vercel dashboard.
