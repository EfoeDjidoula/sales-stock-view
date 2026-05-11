import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StockModule } from "./StockModule";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

import { useQuery } from "@tanstack/react-query";

const mockStockData = [
  {
    stationId: "s1",
    stationName: "Station Test",
    stocks: [
      { tank: "SUPER 1", jauge: 8000, product: "super" as const },
      { tank: "GASOIL 1", jauge: 12000, product: "gasoil" as const },
      // jauge < 500 to trigger low stock alert section
      { tank: "SUPER 2", jauge: 200, product: "super" as const },
    ],
  },
];

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const setQueryState = (isFetching: boolean) => {
  (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
    data: mockStockData,
    isLoading: false,
    isFetching,
    isError: false,
    error: null,
  });
};

const setQueryError = (message: string) => {
  (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
    isError: true,
    error: new Error(message),
  });
};

/**
 * Skeleton "regions" we expect to be visible while the Stock module is refetching.
 *
 * The component renders three distinct skeleton blocks (see StockModule.tsx):
 *   1. Two summary cards (Stock Super + Stock Gasoil totals) — h-36 rounded-xl
 *   2. One low-stock alerts placeholder — h-24 rounded-xl
 *   3. Detailed station list — header (h-6 w-64) + 4 gauge cards (h-32 rounded-xl)
 */
const querySkeletonRegions = (container: HTMLElement) => {
  const skeletons = Array.from(container.querySelectorAll<HTMLElement>(".animate-pulse"));

  const has = (predicate: (el: HTMLElement) => boolean) => skeletons.some(predicate);

  return {
    skeletons,
    summaryCards: skeletons.filter((el) => el.classList.contains("h-36")),
    alertsPlaceholder: skeletons.find((el) => el.classList.contains("h-24")),
    listHeader: skeletons.find(
      (el) => el.classList.contains("h-6") && el.classList.contains("w-64")
    ),
    gaugeCards: skeletons.filter((el) => el.classList.contains("h-32")),
    realSummaryCardsVisible:
      !!container.querySelector(".border-super\\/30") &&
      !!container.querySelector(".border-gasoil\\/30"),
    realAlertsVisible: !!container.querySelector(".border-destructive\\/30"),
    realGaugesVisible: !!container.querySelector(".bg-card.rounded-xl.border.border-border"),
    has,
  };
};

describe("StockModule — targeted skeleton coverage during refetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders real Stock components (no skeletons) when idle", () => {
    setQueryState(false);

    const { container } = render(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    const regions = querySkeletonRegions(container);

    expect(regions.skeletons.length).toBe(0);
    expect(regions.realSummaryCardsVisible).toBe(true);
    expect(regions.realAlertsVisible).toBe(true); // mock contains a low-stock tank
    expect(regions.realGaugesVisible).toBe(true);
  });

  it("shows skeletons on totals cards, alerts block AND station list during refetch", async () => {
    setQueryState(false);

    const { rerender, container } = render(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    // Trigger refetch (simulates post-deletion or post-edit invalidation).
    setQueryState(true);
    rerender(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    await waitFor(() => {
      const r = querySkeletonRegions(container);

      // 1. Totals cards: exactly 2 skeleton placeholders (Super + Gasoil).
      expect(r.summaryCards.length).toBe(2);

      // 2. Low stock alerts: skeleton placeholder visible.
      expect(r.alertsPlaceholder).toBeDefined();

      // 3. Detailed station list: header + 4 gauge card skeletons visible.
      expect(r.listHeader).toBeDefined();
      expect(r.gaugeCards.length).toBe(4);

      // Real data components must be hidden during refetch to avoid stale UI.
      expect(r.realSummaryCardsVisible).toBe(false);
      expect(r.realAlertsVisible).toBe(false);
      expect(r.realGaugesVisible).toBe(false);
    });
  });

  it("hides all skeleton regions and restores real components after refetch completes (no reload)", async () => {
    setQueryState(false);

    const { rerender, container } = render(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    setQueryState(true);
    rerender(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(querySkeletonRegions(container).skeletons.length).toBeGreaterThan(0);
    });

    setQueryState(false);
    rerender(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    await waitFor(() => {
      const r = querySkeletonRegions(container);

      // All skeleton regions cleared.
      expect(r.skeletons.length).toBe(0);
      expect(r.summaryCards.length).toBe(0);
      expect(r.alertsPlaceholder).toBeUndefined();
      expect(r.listHeader).toBeUndefined();
      expect(r.gaugeCards.length).toBe(0);

      // Real components restored.
      expect(r.realSummaryCardsVisible).toBe(true);
      expect(r.realAlertsVisible).toBe(true);
      expect(r.realGaugesVisible).toBe(true);
    });
  });
});
