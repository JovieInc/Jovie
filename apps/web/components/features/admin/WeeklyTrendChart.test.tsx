import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DATA_SERIES } from "@/lib/design/metric-tone";
import { expectNoA11yViolations } from "@/tests/utils/a11y";
import { formatWeekLabel, WeeklyTrendChart } from "./WeeklyTrendChart";

const dynamicState = vi.hoisted(() => ({ loading: false }));
vi.mock("next/dynamic", () => ({
  default: (_loader: unknown, options: { loading: () => React.ReactNode }) =>
    function DynamicChart({ data }: { data: unknown[] }) {
      return dynamicState.loading ? (
        options.loading()
      ) : (
        <div data-testid="trend-plot">{data.length} weeks</div>
      );
    },
}));

const weeks = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    weekStart: `2026-01-${String(5 + (index % 4) * 7).padStart(2, "0")}`,
    scraped: 400 + index,
    contacted: 180,
    signups: 24,
    paid: 3,
  }));

describe("WeeklyTrendChart", () => {
  beforeEach(() => {
    dynamicState.loading = false;
  });

  it("formats week starts as UTC month and day", () => {
    expect(formatWeekLabel("2026-01-05")).toBe("Jan 5");
    expect(formatWeekLabel("2026-12-28")).toBe("Dec 28");
  });

  it("plots every week and names every series in the legend", async () => {
    const { container } = render(<WeeklyTrendChart data={weeks(8)} />);

    expect(screen.getByTestId("trend-plot")).toHaveTextContent("8 weeks");
    for (const label of ["Scraped", "Contacted", "Signups", "Paid"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    const swatches = Array.from(
      container.querySelectorAll<HTMLElement>(".rounded-full"),
    ).map((el) => el.style.backgroundColor);
    expect(swatches).toEqual([...DATA_SERIES.ordered]);
    expect(container.innerHTML).not.toContain("hsl(var(--color-");
    await expectNoA11yViolations(container);
  });

  it("keeps the legend with no weeks recorded", async () => {
    const { container } = render(<WeeklyTrendChart data={[]} />);

    expect(screen.getByTestId("trend-plot")).toHaveTextContent("0 weeks");
    expect(screen.getByText("Paid")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("reserves the chart height while the chart chunk loads", async () => {
    dynamicState.loading = true;
    const { container } = render(<WeeklyTrendChart data={weeks(4)} />);

    expect(screen.queryByTestId("trend-plot")).toBeNull();
    expect(container.querySelector(".h-36.animate-pulse")).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it("keeps a full year axe-clean inside an RTL document", async () => {
    const { container } = render(
      <div dir="rtl" lang="ar">
        <WeeklyTrendChart data={weeks(52)} />
      </div>,
    );

    expect(screen.getByTestId("trend-plot")).toHaveTextContent("52 weeks");
    await expectNoA11yViolations(container);
  });
});
