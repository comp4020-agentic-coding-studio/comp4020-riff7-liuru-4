import { effectiveSlot, findClashes, toMinutes } from "./clashes";
import type { Exception, Group } from "./schema";
import { DAYS, dateLabel, dayIndex } from "./weeks";

// The list of exceptions answers "what's been asked for"; nobody reading it
// can easily answer "where is everyone in week 9". This resolves one week
// into blocks on a day × time grid: each group's effective slot, the
// standing slot a confirmed move vacated, and any still-pending proposals
// drawn where they'd land — with clashes marked on both sides.

export type BlockKind = "standing" | "moved" | "proposed" | "vacated";

export type Block = {
  groupSlug: string;
  name: string;
  kind: BlockKind;
  day: number;
  start: number;
  end: number;
  startLabel: string;
  endLabel: string;
  room: string;
  exceptionId?: number;
  // noteLead is read out but not drawn: the grid is too narrow for
  // "moved to Tue 6 Oct", so it shows "→ Tue 6 Oct" and says the rest.
  noteLead?: string;
  note?: string;
  clashes: BlockClash[];
  lane: number;
};

export type BlockClash = { kind: "room" | "tutor"; with: string; pending: boolean };

export type Day = { index: number; label: string; date?: string; lanes: number; blocks: Block[] };

export type Timetable = { days: Day[]; axisStart: number; axisEnd: number; slotMinutes: number };

const SLOT_MINUTES = 15;

export function buildTimetable(week: number, groups: Group[], all: Exception[]): Timetable {
  const nameOf = (slug: string) => groups.find((group) => group.slug === slug)?.name ?? slug;
  const blocks: Block[] = [];
  const add = (
    input: Omit<Block, "day" | "start" | "end" | "startLabel" | "endLabel" | "lane" | "clashes"> & {
      dayText: string;
      startText: string;
      endText: string;
    },
  ) => {
    const day = dayIndex(input.dayText);
    const start = toMinutes(input.startText);
    const end = toMinutes(input.endText);
    // Free-text rows that don't parse stay in the list below, just not here.
    if (day < 0 || start === undefined || end === undefined || end <= start) return undefined;
    const { dayText: _d, startText, endText, ...rest } = input;
    const block: Block = { ...rest, day, start, end, startLabel: startText, endLabel: endText, clashes: [], lane: 0 };
    blocks.push(block);
    return block;
  };

  // Keyed by group for the standing/moved block a clash on the *other*
  // side should be marked on.
  const effectiveBlock = new Map<string, Block>();
  for (const group of groups) {
    const slot = effectiveSlot(group, week, all);
    if (slot.exception) {
      add({
        groupSlug: group.slug,
        name: group.name,
        kind: "vacated",
        dayText: group.day,
        startText: group.start,
        endText: group.end,
        room: group.room,
        noteLead: "moved ",
        note: `→ ${slot.day}${dateLabel(week, slot.day) ? ` ${dateLabel(week, slot.day)}` : ""}`,
      });
    }
    const block = add({
      groupSlug: group.slug,
      name: group.name,
      kind: slot.exception ? "moved" : "standing",
      dayText: slot.day,
      startText: slot.start,
      endText: slot.end,
      room: slot.room,
      exceptionId: slot.exception?.id,
      note: slot.exception ? `moved from ${group.day}` : undefined,
    });
    if (block) effectiveBlock.set(group.slug, block);
  }

  const proposedBlock = new Map<number, Block>();
  for (const exception of all) {
    if (exception.week !== week || exception.status !== "proposed") continue;
    const room = exception.room ?? groups.find((group) => group.slug === exception.groupSlug)?.room ?? "";
    const block = add({
      groupSlug: exception.groupSlug,
      name: nameOf(exception.groupSlug),
      kind: "proposed",
      dayText: exception.day,
      startText: exception.start,
      endText: exception.end,
      room,
      exceptionId: exception.id,
      note: "proposed",
    });
    if (block) proposedBlock.set(exception.id, block);
  }

  for (const exception of all) {
    if (exception.week !== week || exception.status === "declined") continue;
    const own =
      exception.status === "proposed" ? proposedBlock.get(exception.id) : effectiveBlock.get(exception.groupSlug);
    // A confirmed exception superseded by a later one isn't where the group
    // is any more, so it has nothing on the grid to mark.
    if (exception.status === "confirmed" && own?.exceptionId !== exception.id) continue;
    const pending = exception.status === "proposed";
    for (const clash of findClashes(exception, all, groups)) {
      own?.clashes.push({ kind: clash.kind, with: nameOf(clash.slot.groupSlug), pending: false });
      const other = effectiveBlock.get(clash.slot.groupSlug);
      const mark = { kind: clash.kind, with: nameOf(exception.groupSlug), pending };
      if (other && !other.clashes.some((c) => c.kind === mark.kind && c.with === mark.with)) other.clashes.push(mark);
    }
  }

  // Mon–Fri always, plus a weekend day only when something lands on it.
  const indices = new Set([0, 1, 2, 3, 4, ...blocks.map((block) => block.day)]);
  const days: Day[] = [...indices]
    .sort((a, b) => a - b)
    .map((index) => {
      const dayBlocks = blocks
        .filter((block) => block.day === index)
        .sort((a, b) => a.start - b.start || a.end - b.end);
      // Greedy lanes: each block takes the first lane that's free by its
      // start, so overlapping sessions sit side by side instead of on top.
      const laneEnds: number[] = [];
      for (const block of dayBlocks) {
        let lane = laneEnds.findIndex((end) => end <= block.start);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = block.end;
        block.lane = lane;
      }
      return {
        index,
        label: DAYS[index],
        date: dateLabel(week, DAYS[index]),
        lanes: Math.max(1, laneEnds.length),
        blocks: dayBlocks,
      };
    });

  const starts = blocks.map((block) => block.start);
  const ends = blocks.map((block) => block.end);
  const axisStart = Math.floor(Math.min(9 * 60, ...starts) / 60) * 60;
  const axisEnd = Math.ceil(Math.max(17 * 60, ...ends) / 60) * 60;
  return { days, axisStart, axisEnd, slotMinutes: SLOT_MINUTES };
}

export function minutesLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// "Room 4.03" out of "Marie Reay Building (155), Room 4.03" — the building
// is the same for every slot the course publishes, and the grid is narrow.
export function shortRoom(room: string): string {
  return room.split(", ").at(-1) ?? room;
}
