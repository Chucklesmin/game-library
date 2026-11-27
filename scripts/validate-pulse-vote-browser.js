// Pass to playwright-cli run-code --filename scripts/validate-pulse-vote-browser.js.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Playwright CLI invokes this function.
async function validatePulseVote(page) {
  const start = new URL(page.url());
  const base = start.origin;
  const browser = page.context().browser();
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1280, height: 900 } }),
    browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }),
    browser.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true }),
  ]);
  const errors = [];
  const names = ["Pulse Host", "Pulse Guest One", "Pulse Guest Two"];
  const [host, guest, away] = await Promise.all(contexts.map((context) => context.newPage()));
  const pages = [host, guest, away];
  const button = (target, name) => target.getByRole("button", { name, exact: true });
  const see = (target, value) => target.getByText(value, { exact: typeof value === "string" }).first().waitFor({ timeout: 15000 });
  const absent = async (locator, reason) => {
    if (await locator.count()) throw new Error(reason);
  };
  const ballot = async (target, index) => {
    await target.getByRole("radio").nth(index).check();
    await button(target, "Lock in vote").click();
    await see(target, /Vote locked in/);
  };
  const checkViewport = async (target) => {
    if (await target.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
      throw new Error("Horizontal overflow in the game layout");
    }
  };

  try {
    await Promise.all(pages.map(async (target, index) => {
      target.on("pageerror", (error) => errors.push(error.message));
      await target.goto(base);
      const launch = target.getByRole("link", { name: /Open Pulse Vote/ });
      if (await launch.count()) await launch.click();
      else {
        if (!start.searchParams.has("controlled")) throw new Error("Pulse Vote launch link is missing");
        await button(target, "Coming soon").waitFor();
        await target.goto(`${base}/pulse-vote`);
      }
      await target.getByRole("textbox", { name: "Display name" }).fill(names[index]);
      await checkViewport(target);
    }));
    await button(host, "Create room").click();
    await see(host, "Room lobby");
    const inviteCode = await host.getByRole("region", { name: "Room details" }).locator("strong").textContent();
    if (!/^[A-Z0-9]{6}$/.test(inviteCode)) throw new Error("Missing invite code");
    for (const target of [guest, away]) {
      await target.getByRole("textbox", { name: "Invite code" }).fill(inviteCode);
      await button(target, "Join room").click();
      await see(target, "Waiting for the host to start.");
    }
    await see(host, "Players (3/8)");
    await host.getByLabel("Rounds").selectOption("3");
    await button(host, "Start match").click();
    await Promise.all(pages.map((target) => see(target, "Round 1 of 3")));
    await absent(button(guest, "Close voting"), "A non-host saw the close button");
    await ballot(host, 0);
    await absent(guest.getByRole("list", { name: "Vote distribution" }), "Partial tally was shown");
    await absent(guest.getByText(/Vote locked in/), "Another guest appeared to have voted");
    await ballot(guest, 1);
    await guest.reload();
    await see(guest, /Vote locked in/);
    await absent(button(guest, "Lock in vote"), "Reload allowed a second ballot");
    await checkViewport(guest);
    await checkViewport(away);
    await contexts[2].setOffline(true);

    await button(host, "Close voting").click();
    await see(host, "2 of 3 players voted. 1 abstention.");
    await see(host, /Tied answers each score/);
    const distribution = host.getByRole("list", { name: /Vote distribution/ });
    if (await distribution.getByText("1 vote · 50%", { exact: true }).count() !== 2) {
      throw new Error("A tied ballot did not show both 50% shares");
    }
    await see(guest, /You earned 1 point/);
    await button(host, "Next round").click();
    await see(guest, "Round 2 of 3");
    await contexts[2].setOffline(false);
    await see(away, "Round 2 of 3");
    await ballot(away, 2);
    await ballot(guest, 2);
    await ballot(host, 1);
    await button(host, "Close voting").click();
    await see(guest, "3 of 3 players voted. 0 abstentions.");
    await see(guest, "You earned 1 point.");
    await see(guest, "2 votes · 66.7%");
    await button(host, "Next round").click();

    await see(host, "Round 3 of 3");
    await button(host, "Close voting").click();
    await see(away, "No votes this round. No points awarded.");
    await see(away, "0 of 3 players voted. 3 abstentions.");
    if (await away.getByRole("list", { name: /Vote distribution/ }).getByText("0 votes · 0%", { exact: true }).count() !== 4) {
      throw new Error("An empty ballot did not show zero share for all answers");
    }
    await button(host, "Show final standings").click();
    for (const target of pages) {
      await see(target, "Final standings");
      const standings = target.getByRole("region", { name: "Final standings" });
      for (const [index, expected] of ["#1 Pulse Guest One2 pts", "#2 Pulse HostHost1 pt", "#2 Pulse Guest Two1 pt"].entries()) {
        if ((await standings.getByRole("listitem").nth(index).textContent()).trim() !== expected) throw new Error("Incorrect final standings");
      }
    }
    await host.getByLabel("Rounds").selectOption("1");
    await button(host, "Start fresh match").click();
    await see(guest, "Round 1 of 1");
    if (await guest.getByRole("region", { name: "Scoreboard" }).getByText("0 pts", { exact: true }).count() !== 3) {
      throw new Error("Fresh match scores did not reset");
    }
    await away.reload();
    await see(away, "Round 1 of 1");
    if (errors.length) throw new Error(errors.join("\n"));
    return { verified: "Three isolated sessions, desktop and two mobile widths, invite join, private voting, reload, offline recovery, tie, abstention, zero-vote round, standings and fresh match." };
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
