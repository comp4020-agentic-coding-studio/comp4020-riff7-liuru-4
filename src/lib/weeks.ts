// Teaching week → the Monday it starts, from the course website's own
// crit-groups API (its `weeks` map), fetched 2026-09-30. A table, not
// arithmetic from week 1: the two-week teaching break (7–20 September) sits
// between weeks 6 and 7, so "week 9" isn't eight Mondays after week 1.
export const WEEKS: Record<number, string> = {
  1: "2026-07-27",
  2: "2026-08-03",
  3: "2026-08-10",
  4: "2026-08-17",
  5: "2026-08-24",
  6: "2026-08-31",
  7: "2026-09-21",
  8: "2026-09-28",
  9: "2026-10-05",
  10: "2026-10-12",
  11: "2026-10-19",
  12: "2026-10-26",
};
export const FIRST_WEEK = 1;
export const LAST_WEEK = 12;

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// Day fields are free text on a raw POST (the form offers a <select>, a curl
// doesn't have to), so "Wed", "wed" and "Wednesday" all land on the same
// column — and anything unrecognisable is -1, which keeps it off the grid
// and out of clash checks rather than guessing.
export function dayIndex(day: string): number {
  const prefix = day.trim().slice(0, 3).toLowerCase();
  return DAYS.findIndex((d) => d.toLowerCase() === prefix);
}

function dateOf(week: number, offset: number): Date | undefined {
  const monday = WEEKS[week];
  if (!monday) return undefined;
  const date = new Date(`${monday}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

const short = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

// "6 Oct" for week 9's Tuesday; undefined for an unknown week or day.
export function dateLabel(week: number, day: string): string | undefined {
  const index = dayIndex(day);
  const date = index < 0 ? undefined : dateOf(week, index);
  return date && short.format(date);
}

export function weekRangeLabel(week: number): string {
  const monday = dateOf(week, 0);
  const friday = dateOf(week, 4);
  return monday && friday ? `${short.format(monday)} – ${short.format(friday)}` : "";
}

// The week to open on: the first teaching week whose Sunday hasn't passed
// yet in Canberra — so the teaching break shows week 7 (what's next), and
// before/after semester clamps to week 1/12.
export function currentWeek(now = new Date()): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Canberra" }).format(now);
  for (let week = FIRST_WEEK; week <= LAST_WEEK; week++) {
    const sunday = dateOf(week, 6)?.toISOString().slice(0, 10);
    if (sunday && today <= sunday) return week;
  }
  return LAST_WEEK;
}
