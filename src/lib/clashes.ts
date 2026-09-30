import type { Exception, Group } from "./schema";
import { dayIndex } from "./weeks";

// The other half of "the slice that annoys you": a proposal can silently ask
// for a room or a tutor another group already holds that week. Computed at
// render time from the same rows already on the page, not stored — a clash
// appears or clears the moment any exception's status changes, with no
// extra state to keep in sync.

export function toMinutes(time: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : undefined;
}

type Timed = { day: string; start: string; end: string };

// Same day and the two time ranges genuinely overlap — back-to-back slots
// (one ends 15:30, the next starts 15:30) don't.
export function overlaps(a: Timed, b: Timed): boolean {
  const day = dayIndex(a.day);
  if (day < 0 || day !== dayIndex(b.day)) return false;
  const [aStart, aEnd, bStart, bEnd] = [a.start, a.end, b.start, b.end].map(toMinutes);
  if (aStart === undefined || aEnd === undefined || bStart === undefined || bEnd === undefined) return false;
  return aStart < bEnd && bStart < aEnd;
}

// Where a group actually is in a given week: its confirmed exception for
// that week if it has one (the latest, if somehow more than one got
// confirmed), otherwise its standing slot.
export type Slot = Timed & { groupSlug: string; room: string; exception?: Exception };

export function effectiveSlot(group: Group, week: number, all: Exception[]): Slot {
  const moved = all
    .filter((e) => e.groupSlug === group.slug && e.week === week && e.status === "confirmed")
    .sort((a, b) => a.id - b.id)
    .at(-1);
  return moved
    ? { groupSlug: group.slug, day: moved.day, start: moved.start, end: moved.end, room: moved.room ?? group.room, exception: moved }
    : { groupSlug: group.slug, day: group.day, start: group.start, end: group.end, room: group.room };
}

export type Clash = { kind: "room" | "tutor"; slot: Slot };

// Checked against every *other* group's effective slot for the exception's
// week — their standing slot, or the confirmed move that replaces it — not
// just other confirmed exceptions: moving into a room another group has
// every week is the commonest double-booking there is. A shared room is a
// room clash; a different room but the same tutor is a tutor clash, since
// one person can't run both.
export function findClashes(exception: Exception, all: Exception[], groups: Group[]): Clash[] {
  const own = groups.find((group) => group.slug === exception.groupSlug);
  if (!own) return [];
  const room = exception.room ?? own.room;
  const clashes: Clash[] = [];
  for (const group of groups) {
    if (group.slug === own.slug) continue;
    const slot = effectiveSlot(group, exception.week, all);
    if (!overlaps(exception, slot)) continue;
    if (slot.room === room) clashes.push({ kind: "room", slot });
    else if (group.tutorName === own.tutorName) clashes.push({ kind: "tutor", slot });
  }
  return clashes;
}

// One sentence per clash, shared by the server render and the live form
// check so the two can't word the same clash differently.
export function describeClash(clash: Clash, groups: Group[]): string {
  const other = groups.find((group) => group.slug === clash.slot.groupSlug);
  const name = other?.name ?? clash.slot.groupSlug;
  const what = clash.slot.exception ? "confirmed move" : "standing slot";
  const when = `${clash.slot.day} ${clash.slot.start}–${clash.slot.end}`;
  return clash.kind === "room"
    ? `⚠ Room clash with ${name}'s ${what}, ${when} in ${clash.slot.room}`
    : `⚠ Tutor clash: ${other?.tutorName ?? "the same tutor"} also runs ${name}'s ${what}, ${when}`;
}
