import type { APIRoute } from "astro";
import { addException, listExceptions } from "../../lib/db";
import { bus } from "../../lib/events";

// The write half of the board: a group (or their tutor) proposes a one-off
// replacement for a standing slot. The 303 redirect makes the form work with
// no client-side JavaScript — the submitting tab re-renders from SQLite, on
// the week it just proposed for, so the new block is on the grid in front of
// them; every other open tab hears about it over the SSE stream.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const groupSlug = String(form.get("groupSlug") ?? "").trim();
  const week = Number(form.get("week"));
  const reason = String(form.get("reason") ?? "").trim();
  const day = String(form.get("day") ?? "").trim();
  const start = String(form.get("start") ?? "").trim();
  const end = String(form.get("end") ?? "").trim();
  const room = String(form.get("room") ?? "").trim();

  // week/day/start/end are only bounded by the form's own min/max/maxlength
  // attributes — a raw POST skips those the same way it skips the <select>,
  // so this route re-checks the range and truncates to the same limits
  // rather than trusting the client to have honoured them.
  if (groupSlug && Number.isInteger(week) && week >= 1 && week <= 12 && reason && day && start && end) {
    const exception = addException({
      groupSlug,
      week,
      reason: reason.slice(0, 500),
      day: day.slice(0, 10),
      start: start.slice(0, 5),
      end: end.slice(0, 5),
      room: room ? room.slice(0, 200) : null,
    });
    if (exception) {
      bus.emit("exceptions", listExceptions());
      return redirect(`/?week=${exception.week}#week-view`, 303);
    }
  }
  return redirect("/", 303);
};
