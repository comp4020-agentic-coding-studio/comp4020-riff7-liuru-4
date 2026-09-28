# You are riffing on someone else's prototype

This repo is a copy of [`comp4020-crit7-liuru`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-liuru) at
`b697cdc5` --- liuru's crit agent's shipped prototype for `07-anu-system`.
The copy is yours; their repo is untouched and off limits.

**The brief is to take this somewhere it hasn't been.** Not to restart it, not
to polish it, and not to finish the agent's to-do list. Read how they directed
the agent, find the thing the prototype implies but doesn't do, and build
that. You have the session's half-hour, so pick something you can get live.

**Nothing here is marked.** No cutoff, no reflection, no `PROCESS.md` entry,
no crit sweep, no repo of your own on the line. That is the point --- the
interesting move is the one you wouldn't risk in your own graded repo.

**What you show at the share-back** is the live site plus
`git diff riff-start`. Push early and keep `main` green.

**The agent's own spec tests are `spec/exceptions.test.ts` and `spec/readme.test.ts`.** They encode the crit brief,
not yours, and they gate the deploy --- a red check means no live site to show
at the share-back. If your riff moves past that brief, change them or delete
them; keep `spec/invariants.test.ts` green, since that one is true of any good
site.

Everything below this line was written for that crit submission. The marks,
the cutoff, the private-repo phase, the weekly `start` skill and the
reflection are all done, and none of it governs what you do here. Read it for
how they worked, not for what you owe.

---

# Your harness

This app models the crit-group scheduling slice of the course website's own
crit-groups API: standing weekly slots and the one-off exceptions (public
holidays, room clashes, tutor swaps) that currently get hand-edited into that
site's published data. Rules I hold this build to:

- **`groups` is a read-only cache of public data, never a second source of
  it.** Seed it from the course website's own `api/crit-groups.json` (cite the
  fetch date in `db.ts`), and never add a UI path that writes to it — proposing
  and confirming exceptions is the app's job; changing a standing slot is the
  website repo's.
- **No invented people or slots.** Every group, tutor and room in seed data is
  real, sourced from the published API — not a placeholder, not a guess.
- **Every page gets a route in `spec/routes.ts`.** The invariants only see
  routes listed there; add a page and forget the list, and axe/heading/nav
  checks silently stop covering it.
- **A spec test earns its place by testing a contract, not an implementation.**
  `spec/exceptions.test.ts` asserts what the brief's spec lines actually
  require against the running app (persists across reload, reaches other
  clients live) — not internal function shapes that would survive a rewrite
  anyway.
- **No client-side framework for what a form and an SSE stream already do.**
  The starter's plain-HTML-form-plus-EventSource pattern covers every flow
  this app needs; reach for more only if a real requirement can't be met this
  way.
