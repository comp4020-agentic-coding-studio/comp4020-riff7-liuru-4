import { beforeAll, describe, expect, inject, it } from "vitest";

// The brief's own checkable lines, turned into tests against the running
// app: a proposed exception persists across a reload, a confirmation is
// reachable end to end, and both reach other clients over the SSE stream
// the starter's plumbing already proved works.
const baseUrl = inject("baseUrl");

describe("crit slot exceptions", () => {
  let reason: string;

  beforeAll(() => {
    reason = `spec probe ${process.hrtime.bigint()}`;
  });

  // Astro checks form POSTs carry a same-origin Origin header (CSRF
  // protection); browsers send it automatically, a bare fetch doesn't.
  const post = (path: string, body?: URLSearchParams) =>
    fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: { origin: baseUrl },
      body,
      redirect: "manual",
    });

  it("shows every group's standing slot", async () => {
    const res = await fetch(baseUrl);
    const html = await res.text();
    for (const group of ["Shitao", "Bada", "Baishi", "Dachi", "Yunlin", "Liuru"]) {
      expect(html).toContain(group);
    }
  });

  // Runs before any other test in this file proposes an exception for
  // Dachi, so its filtered view is still genuinely empty here — the seed
  // data (src/lib/db.ts) only seeds Shitao and Bada with confirmed
  // exceptions, and every other test that touches Dachi runs later.
  it("shows an empty-state message when a filtered group has no exceptions", async () => {
    const res = await fetch(new URL("/?group=dachi", baseUrl));
    const html = await res.text();
    const list = html.match(/<ul id="exceptions"[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(list).toContain("Dachi has no exceptions yet.");
  });

  it("accepts a proposed exception and redirects back to the board", async () => {
    const res = await post(
      "/api/exceptions",
      new URLSearchParams({
        groupSlug: "liuru",
        week: "10",
        reason,
        day: "Thu",
        start: "15:30",
        end: "17:00",
        room: "",
      }),
    );
    expect(res.status).toBe(303);
    // back to the board, opened on the week just proposed for
    expect(res.headers.get("location")).toBe("/?week=10#week-view");
  });

  it("persists the proposal: a fresh page load includes it, marked proposed", async () => {
    const res = await fetch(baseUrl);
    const html = await res.text();
    expect(html).toContain(reason);
    expect(html).toContain("proposed");
  });

  it("broadcasts a new proposal over the SSE stream", async () => {
    const live = `live probe ${process.hrtime.bigint()}`;

    // subscribe first, then post, then read until the event arrives
    const stream = await fetch(new URL("/api/events", baseUrl));
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reader = stream.body?.getReader();
    if (!reader) throw new Error("no response body");

    await post(
      "/api/exceptions",
      new URLSearchParams({
        groupSlug: "baishi",
        week: "11",
        reason: live,
        day: "Thu",
        start: "09:00",
        end: "10:30",
        room: "",
      }),
    );

    const decoder = new TextDecoder();
    let received = "";
    while (!received.includes(live)) {
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended before the event arrived");
      received += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    expect(received).toContain(`data: `);
    expect(received).toContain(live);
  }, 10_000);

  it("confirms an exception, and the confirmation persists", async () => {
    const list = await fetch(baseUrl);
    const html = await list.text();
    const match = html.match(/action="\/api\/exceptions\/(\d+)\/confirm"/);
    if (!match) throw new Error("no proposed exception with a confirm form found");
    const id = match[1];

    const res = await post(`/api/exceptions/${id}/confirm`);
    expect(res.status).toBe(303);

    const after = await fetch(baseUrl);
    const afterHtml = await after.text();
    expect(afterHtml).toContain(`id="exception-${id}"`);
    expect(afterHtml).toMatch(new RegExp(`id="exception-${id}"[^>]*data-status="confirmed"`));
  });

  it("declines an exception, and the decline persists (a proposal doesn't just sit forever)", async () => {
    const declineReason = `decline probe ${process.hrtime.bigint()}`;
    await post(
      "/api/exceptions",
      new URLSearchParams({
        groupSlug: "dachi",
        week: "12",
        reason: declineReason,
        day: "Fri",
        start: "10:30",
        end: "12:00",
        room: "",
      }),
    );

    const list = await fetch(baseUrl);
    const html = await list.text();
    const idMatch = html.match(/id="exception-(\d+)"[\s\S]{0,400}?decline probe/);
    if (!idMatch) throw new Error("no proposed decline-probe exception found");
    const id = idMatch[1];

    const res = await post(`/api/exceptions/${id}/decline`);
    expect(res.status).toBe(303);

    const after = await fetch(baseUrl);
    const afterHtml = await after.text();
    expect(afterHtml).toMatch(new RegExp(`id="exception-${id}"[^>]*data-status="declined"`));
  });

  it("flags a room clash between a proposal and another group's confirmed exception", async () => {
    // Two groups share the same standing room when no room override is
    // given (see the seed data in src/lib/db.ts), so leaving room blank on
    // both proposals below is what makes them collide.
    const tag = process.hrtime.bigint();
    const holderReason = `clash holder ${tag}`;
    const proposalReason = `clash probe ${tag}`;
    const week = "6";
    const day = "Sat";
    const start = "08:00";
    const end = "09:30";

    await post(
      "/api/exceptions",
      new URLSearchParams({ groupSlug: "yunlin", week, reason: holderReason, day, start, end, room: "" }),
    );
    const beforeConfirm = await fetch(baseUrl);
    const holderMatch = (await beforeConfirm.text()).match(
      new RegExp(`id="exception-(\\d+)"[\\s\\S]{0,400}?${holderReason}`),
    );
    if (!holderMatch) throw new Error("no proposed clash-holder exception found");
    await post(`/api/exceptions/${holderMatch[1]}/confirm`);

    await post(
      "/api/exceptions",
      new URLSearchParams({ groupSlug: "shitao", week, reason: proposalReason, day, start, end, room: "" }),
    );

    const after = await fetch(baseUrl);
    const html = await after.text();
    const clashMatch = html.match(new RegExp(`${proposalReason}[\\s\\S]{0,400}?clash-warning[\\s\\S]{0,200}?Yunlin`));
    expect(clashMatch).not.toBeNull();
  });

  it("keeps a clash warning visible after both clashing exceptions are confirmed", async () => {
    // Unlike the proposal-vs-confirmed clash test above, this confirms
    // *both* sides independently — the scenario where the warning must not
    // disappear once neither row is "proposed" any more.
    const tag = process.hrtime.bigint();
    const firstReason = `both-confirmed clash first ${tag}`;
    const secondReason = `both-confirmed clash second ${tag}`;
    const week = "3";
    const day = "Sat";
    const start = "13:00";
    const end = "14:30";

    // Scoped to a single <li> (never crossing a "</li>" boundary) so a
    // reason tag can't accidentally match against a *different* row's id
    // when two rows for the same clashing slot sit close together in the
    // rendered list.
    const rowFor = (html: string, reason: string) =>
      html.match(new RegExp(`<li id="exception-(\\d+)"(?:(?!</li>)[\\s\\S])*?${reason}(?:(?!</li>)[\\s\\S])*?</li>`));

    await post(
      "/api/exceptions",
      new URLSearchParams({ groupSlug: "baishi", week, reason: firstReason, day, start, end, room: "" }),
    );
    const firstMatch = rowFor(await (await fetch(baseUrl)).text(), firstReason);
    if (!firstMatch) throw new Error("no proposed first-clash exception found");
    await post(`/api/exceptions/${firstMatch[1]}/confirm`);

    await post(
      "/api/exceptions",
      new URLSearchParams({ groupSlug: "dachi", week, reason: secondReason, day, start, end, room: "" }),
    );
    const secondMatch = rowFor(await (await fetch(baseUrl)).text(), secondReason);
    if (!secondMatch) throw new Error("no proposed second-clash exception found");
    await post(`/api/exceptions/${secondMatch[1]}/confirm`);

    const html = await (await fetch(baseUrl)).text();
    expect(rowFor(html, firstReason)?.[0]).toContain("clash-warning");
    expect(rowFor(html, secondReason)?.[0]).toContain("clash-warning");
  });

  it("rejects a proposal for a group slug that doesn't exist, without crashing", async () => {
    const res = await post(
      "/api/exceptions",
      new URLSearchParams({
        groupSlug: "not-a-real-group",
        week: "7",
        reason: `bogus slug probe ${process.hrtime.bigint()}`,
        day: "Mon",
        start: "09:00",
        end: "10:00",
        room: "",
      }),
    );
    expect(res.status).toBe(303);

    const after = await fetch(baseUrl);
    expect((await after.text()).includes("bogus slug probe")).toBe(false);
  });

  it("rejects a week outside the form's own 1–12 range, without crashing", async () => {
    const outOfRangeReason = `out of range week probe ${process.hrtime.bigint()}`;
    const res = await post(
      "/api/exceptions",
      new URLSearchParams({
        groupSlug: "dachi",
        week: "0",
        reason: outOfRangeReason,
        day: "Mon",
        start: "09:00",
        end: "10:00",
        room: "",
      }),
    );
    expect(res.status).toBe(303);

    const after = await fetch(baseUrl);
    expect((await after.text()).includes(outOfRangeReason)).toBe(false);
  });

  it("truncates day/start/end to the form's own maxlength, like reason and room already are", async () => {
    const tag = process.hrtime.bigint();
    const longFieldsReason = `long fields probe ${tag}`;
    await post(
      "/api/exceptions",
      new URLSearchParams({
        groupSlug: "dachi",
        week: "5",
        reason: longFieldsReason,
        day: "Wednesday!!",
        start: "14:00:00",
        end: "15:30:00",
        room: "",
      }),
    );

    const after = await fetch(baseUrl);
    const html = await after.text();
    const row = html.match(new RegExp(`<li[^>]*>[\\s\\S]{0,400}?${longFieldsReason}`))?.[0] ?? "";
    expect(row).toContain("Wednesday!"); // day.slice(0, 10)
    expect(row).not.toContain("Wednesday!!");
    expect(row).toContain("14:00"); // start.slice(0, 5)
    expect(row).not.toContain("14:00:00");
  });

  it("won't re-decide an exception that's already confirmed or declined", async () => {
    const tag = process.hrtime.bigint();
    const confirmedReason = `redecide confirmed probe ${tag}`;

    await post(
      "/api/exceptions",
      new URLSearchParams({
        groupSlug: "dachi",
        week: "8",
        reason: confirmedReason,
        day: "Sun",
        start: "11:00",
        end: "12:30",
        room: "",
      }),
    );
    const list = await fetch(baseUrl);
    const html = await list.text();
    const idMatch = html.match(new RegExp(`id="exception-(\\d+)"[\\s\\S]{0,400}?${confirmedReason}`));
    if (!idMatch) throw new Error("no proposed redecide-probe exception found");
    const id = idMatch[1];

    await post(`/api/exceptions/${id}/confirm`);
    // A second decline on an already-confirmed row must not flip it back.
    await post(`/api/exceptions/${id}/decline`);

    const after = await fetch(baseUrl);
    const afterHtml = await after.text();
    expect(afterHtml).toMatch(new RegExp(`id="exception-${id}"[^>]*data-status="confirmed"`));
  });

  it("flags a proposal that moves into another group's standing slot and room", async () => {
    // Yunlin holds Wed 14:00–15:30 in the shared room every week; Dachi
    // moving to Wed 14:30 with no room override lands in the same room,
    // overlapping — a clash with no confirmed exception involved at all.
    const reason = `standing clash probe ${process.hrtime.bigint()}`;
    await post(
      "/api/exceptions",
      new URLSearchParams({ groupSlug: "dachi", week: "11", reason, day: "Wed", start: "14:30", end: "16:00", room: "" }),
    );
    const html = await (await fetch(baseUrl)).text();
    expect(html).toMatch(new RegExp(`${reason}[\\s\\S]{0,400}?clash-warning[^<]*Room clash with Yunlin\\S* standing slot`));
  });

  it("flags a tutor clash when a group moves into its tutor's other session, in a different room", async () => {
    // Bill McAlister runs both Yunlin (Wed 14:00) and Liuru (Wed 15:30).
    const reason = `tutor clash probe ${process.hrtime.bigint()}`;
    await post(
      "/api/exceptions",
      new URLSearchParams({
        groupSlug: "yunlin",
        week: "12",
        reason,
        day: "Wed",
        start: "15:00",
        end: "16:30",
        room: "Marie Reay Building (155), Room 3.05",
      }),
    );
    const html = await (await fetch(baseUrl)).text();
    expect(html).toMatch(new RegExp(`${reason}[\\s\\S]{0,400}?clash-warning[^<]*Tutor clash: Bill McAlister also runs Liuru`));
  });

  it("draws the week as a timetable: real week-9 moves in their new place, the slot they vacated marked", async () => {
    const html = await (await fetch(new URL("/?week=9", baseUrl))).text();
    const grid = html.match(/<div class="timetable"[\s\S]*?<\/section>\s*<\/div>/)?.[0] ?? "";
    expect(html).toContain("5 Oct – 9 Oct");
    // Shitao's seeded move: off Monday, onto Tuesday 6 October.
    const tuesday = grid.match(/<h3[^>]*>\s*Tue[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(tuesday).toContain("6 Oct");
    expect(tuesday).toMatch(/tt-block moved[\s\S]*?Shitao/);
    const monday = grid.match(/<h3[^>]*>\s*Mon[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(monday).toMatch(/tt-block vacated[\s\S]*?Shitao[\s\S]*?→ Tue 6 Oct/);
  });

  it("falls back to a real teaching week when ?week= isn't one", async () => {
    const res = await fetch(new URL("/?week=99", baseUrl));
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/<h2 id="week-heading">\s*Week ([1-9]|1[0-2]) /);
  });

  it("filters the exceptions list to one group via ?group=", async () => {
    const tag = process.hrtime.bigint();
    const ownReason = `filter probe own ${tag}`;
    const otherReason = `filter probe other ${tag}`;

    await post(
      "/api/exceptions",
      new URLSearchParams({ groupSlug: "liuru", week: "4", reason: ownReason, day: "Thu", start: "16:00", end: "17:30", room: "" }),
    );
    await post(
      "/api/exceptions",
      new URLSearchParams({ groupSlug: "baishi", week: "4", reason: otherReason, day: "Thu", start: "09:00", end: "10:30", room: "" }),
    );

    const res = await fetch(new URL("/?group=liuru", baseUrl));
    const html = await res.text();
    const list = html.match(/<ul id="exceptions"[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(list).toContain(ownReason);
    expect(list).not.toContain(otherReason);
  });
});
