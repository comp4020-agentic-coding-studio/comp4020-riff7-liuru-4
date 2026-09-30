import type { APIRoute } from "astro";
import { declineException, listExceptions } from "../../../../lib/db";
import { bus } from "../../../../lib/events";

// The other end of a proposal's lifecycle: a room clash or a tutor swap that
// didn't work out shouldn't just sit "proposed" forever — declining it is as
// real an outcome as confirming it, and both need to be visible to whoever
// is deciding between proposals for the same week.
export const POST: APIRoute = async ({ params, redirect }) => {
  const id = Number(params.id);
  if (Number.isInteger(id)) {
    const exception = declineException(id);
    // back to the row that was just decided, on its own week's grid
    if (exception) {
      bus.emit("exceptions", listExceptions());
      return redirect(`/?week=${exception.week}#exception-${exception.id}`, 303);
    }
  }
  return redirect("/", 303);
};
