import { expect, test } from "@playwright/test";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1440, height: 900 },
});

test("hovering and closing either preview keeps every main-plane frame fixed", async ({
  page,
}, testInfo) => {
  await page.goto(
    "/api/dev/test-auth/enter?persona=creator-ready&redirect=/app",
    { waitUntil: "domcontentloaded" },
  );
  const notes = page.getByRole("textbox", { name: "Notes", exact: true });
  await expect(notes).toBeVisible();
  await notes.fill("Continuous hover geometry regression");
  const control = (side: "left" | "right") =>
    page
      .locator(`[data-rail-toggle="${side}"]:not([inert] *)`)
      .filter({ visible: true });

  for (const side of ["left", "right"] as const) {
    await expect(control(side)).toHaveCount(1);
    if ((await control(side).getAttribute("aria-pressed")) === "true") {
      await control(side).click();
    }
  }
  await notes.focus();
  await page.mouse.move(700, 450);
  await expect(page.locator("#shell-left-rail")).toHaveAttribute(
    "data-rail-phase",
    "closed",
  );
  await expect(page.locator("#shell-artist-profile-rail")).toHaveAttribute(
    "data-rail-phase",
    "closed",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(520);

  // Model the inspector's 6px exiting travel deterministically. Hidden
  // overflow still accepts programmatic scrolling (including scrollIntoView),
  // even when endpoint-only hover assertions happen to miss the displacement.
  const travel = await page.evaluate(() => {
    const plane = document.querySelector<HTMLElement>(
      "[data-app-shell-main-plane]",
    )!;
    const main = document.querySelector("main#main-content")!;
    const before = main.getBoundingClientRect().x;
    const position = plane.style.position;
    plane.style.position = "relative";
    const exitingEdge = document.createElement("span");
    exitingEdge.setAttribute("aria-hidden", "true");
    exitingEdge.style.cssText =
      "position:absolute;left:calc(100% + 6px);top:0;width:1px;height:1px;pointer-events:none";
    plane.append(exitingEdge);
    plane.scrollLeft = 6;
    const result = {
      scroll: plane.scrollLeft,
      displacement: main.getBoundingClientRect().x - before,
    };
    exitingEdge.remove();
    plane.scrollLeft = 0;
    plane.style.position = position;
    return result;
  });
  expect(travel).toEqual({ scroll: 0, displacement: 0 });

  const samples: { side: string; x: number; width: number; scroll: number }[] =
    [];
  for (const side of ["left", "right"] as const) {
    const before = await page.locator("main#main-content").boundingBox();
    expect(before).not.toBeNull();
    const sampler = await page.evaluateHandle(() => {
      const plane = document.querySelector<HTMLElement>(
        "[data-app-shell-main-plane]",
      )!;
      const main = document.querySelector("main#main-content")!;
      const probe = {
        frames: [] as { x: number; width: number; scroll: number }[],
        raf: 0,
      };
      const sample = () => {
        const box = main.getBoundingClientRect();
        probe.frames.push({
          x: box.x,
          width: box.width,
          scroll: plane.scrollLeft,
        });
        probe.raf = requestAnimationFrame(sample);
      };
      probe.raf = requestAnimationFrame(sample);
      return probe;
    });
    for (let cycle = 0; cycle < 5; cycle++) {
      await control(side).hover();
      await expect(control(side)).toHaveAttribute("aria-expanded", "true");
      await expect(notes).toBeFocused();
      await page.waitForTimeout(120);
      await page.mouse.move(700, 450);
      await expect(control(side)).toHaveAttribute("aria-expanded", "false");
      await page.waitForTimeout(520);
    }
    const frames = await sampler.evaluate((probe) => {
      cancelAnimationFrame(probe.raf);
      return probe.frames;
    });
    await sampler.dispose();
    expect(frames.length).toBeGreaterThan(10);
    for (const frame of frames) {
      expect(frame.x).toBeCloseTo(before!.x, 1);
      expect(frame.width).toBeCloseTo(before!.width, 1);
      expect(frame.scroll).toBe(0);
    }
    samples.push(...frames.map((frame) => ({ side, ...frame })));
  }
  await expect(notes).toBeFocused();
  await expect(notes).toHaveValue("Continuous hover geometry regression");
  await testInfo.attach("continuous-main-plane-geometry", {
    body: JSON.stringify(samples),
    contentType: "application/json",
  });
});
