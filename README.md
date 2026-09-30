# Crit slot exceptions

Six crit groups (mine, Liuru, among them) each hold a standing weekly slot,
published by the course website's own `api/crit-groups.json`. When a public
holiday, a room clash or a tutor swap needs a one-off replacement for a
group's week, that change today lands as a hand-edited entry in that site's
`exceptions` array — a PR against the source of truth for what's really a
small, recurring coordination problem. This is the slice before that PR: a
board where anyone can propose a replacement slot for a given week, see every
open proposal in one place, and confirm one once it's settled — live across
every open tab, and still there on reload.

It deliberately doesn't do more than that. It doesn't write back to the
website's own data (that stays that repo's job), and it doesn't gate who can
propose or confirm — the six groups and their tutors are a small, known set,
not a public audience that needs authentication.

## What good looks like here

- The standing slots and the two exceptions already live on the published site
  are real data, fetched from the course API and seeded once at boot
  (`src/lib/db.ts`) — nothing here is invented to make the demo look populated.
- The core promise is persistence: propose an exception, reload, it's still
  there — `spec/exceptions.test.ts` asserts this against the running app, the
  same way the starter's own `guestbook.test.ts` did before this replaced it.
- A proposal that overlaps another group's slot that week — their standing
  slot, or the confirmed move replacing it — gets a visible warning when
  they'd share a room, or share a tutor who can't be in two places. It's
  live across tabs, shown in the propose form before you submit, and survives
  either or both sides later getting confirmed — `src/lib/clashes.ts`,
  exercised by the clash tests in `spec/exceptions.test.ts`.
- The accessibility floor (`spec/invariants.test.ts`) and the read-only
  `/readme/` promise (`spec/readme.test.ts`) are enforced checks, not
  judgement calls; which system to model, and how thin a slice counts as
  "wired end to end," were mine to decide, and `CLAUDE.md` records the rules
  that decision produced.

## Riff: the week, drawn

The board above answers "what's been asked for"; it never answered the
question people actually open it with — where is everyone in week 9? The
riff resolves each teaching week (dates from the same course API's `weeks`
map, `src/lib/weeks.ts`) into a timetable at the top of the page: every
group's effective slot, the slot a confirmed move vacated, pending proposals
drawn where they'd land, and clashes outlined on both sides. Pick a group to
get a one-line "you're here this week" answer. The grid re-renders live when
any tab proposes, confirms or declines.
