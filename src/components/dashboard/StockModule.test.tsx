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
 * Stable, semantic data-testid based queries.
 * Avoids relying on Tailwind utility classes which may change.
 */
const queryRegions = (container: HTMLElement) => ({
  // Skeleton regions
  summarySkeletonSuper: container.querySelector('[data-testid="stock-summary-skeleton-super"]'),
  summarySkeletonGasoil: container.querySelector('[data-testid="stock-summary-skeleton-gasoil"]'),
  alertsSkeleton: container.querySelector('[data-testid="stock-alerts-skeleton"]'),
  listSkeleton: container.querySelector('[data-testid="stock-list-skeleton"]'),
  listSkeletonHeader: container.querySelector('[data-testid="stock-list-skeleton-header"]'),
  listSkeletonGauges: container.querySelectorAll('[data-testid="stock-list-skeleton-gauge"]'),

  // Real regions
  summarySuper: container.querySelector('[data-testid="stock-summary-super"]'),
  summaryGasoil: container.querySelector('[data-testid="stock-summary-gasoil"]'),
  alerts: container.querySelector('[data-testid="stock-alerts"]'),
  list: container.querySelector('[data-testid="stock-list"]'),
  listStations: container.querySelectorAll('[data-testid="stock-list-station"]'),
  errorBlock: container.querySelector('[data-testid="stock-error"]'),
});

describe("StockModule — semantic skeleton coverage via data-testid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders real Stock regions (no skeletons) when idle", () => {
    setQueryState(false);

    const { container } = render(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    const r = queryRegions(container);

    // No skeleton region present
    expect(r.summarySkeletonSuper).toBeNull();
    expect(r.summarySkeletonGasoil).toBeNull();
    expect(r.alertsSkeleton).toBeNull();
    expect(r.listSkeleton).toBeNull();

    // All real regions visible
    expect(r.summarySuper).not.toBeNull();
    expect(r.summaryGasoil).not.toBeNull();
    expect(r.alerts).not.toBeNull(); // mock contains a low-stock tank
    expect(r.list).not.toBeNull();
    expect(r.listStations.length).toBe(1);
    expect(r.errorBlock).toBeNull();
  });

  it("shows skeletons on totals, alerts AND station list during refetch", async () => {
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
      const r = queryRegions(container);

      // Skeletons by region
      expect(r.summarySkeletonSuper).not.toBeNull();
      expect(r.summarySkeletonGasoil).not.toBeNull();
      expect(r.alertsSkeleton).not.toBeNull();
      expect(r.listSkeleton).not.toBeNull();
      expect(r.listSkeletonHeader).not.toBeNull();
      expect(r.listSkeletonGauges.length).toBe(4);

      // Real regions hidden during refetch
      expect(r.summarySuper).toBeNull();
      expect(r.summaryGasoil).toBeNull();
      expect(r.alerts).toBeNull();
      expect(r.list).toBeNull();
    });
  });

  it("clears skeleton regions and restores real ones after refetch (no reload)", async () => {
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
      expect(queryRegions(container).listSkeleton).not.toBeNull();
    });

    setQueryState(false);
    rerender(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    await waitFor(() => {
      const r = queryRegions(container);

      expect(r.summarySkeletonSuper).toBeNull();
      expect(r.summarySkeletonGasoil).toBeNull();
      expect(r.alertsSkeleton).toBeNull();
      expect(r.listSkeleton).toBeNull();

      expect(r.summarySuper).not.toBeNull();
      expect(r.summaryGasoil).not.toBeNull();
      expect(r.alerts).not.toBeNull();
      expect(r.list).not.toBeNull();
    });
  });

  it("clears skeletons and shows error region when refetch fails", async () => {
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
      expect(queryRegions(container).listSkeleton).not.toBeNull();
    });

    setQueryError("Network failure");
    rerender(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    await waitFor(() => {
      const r = queryRegions(container);

      // No skeleton region stays stuck
      expect(r.summarySkeletonSuper).toBeNull();
      expect(r.summarySkeletonGasoil).toBeNull();
      expect(r.alertsSkeleton).toBeNull();
      expect(r.listSkeleton).toBeNull();

      // No stale real region
      expect(r.summarySuper).toBeNull();
      expect(r.list).toBeNull();

      // Error region rendered correctly
      expect(r.errorBlock).not.toBeNull();
      expect(r.errorBlock?.getAttribute("role")).toBe("alert");
      expect(r.errorBlock?.textContent ?? "").toContain("Erreur lors du chargement des stocks");
      expect(r.errorBlock?.textContent ?? "").toContain("Network failure");
    });
  });
});
