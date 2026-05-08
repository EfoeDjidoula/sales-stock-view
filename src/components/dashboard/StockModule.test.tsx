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
    ],
  },
];

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("StockModule — skeletons during post-deletion refetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders data without skeletons initially", () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockStockData,
      isLoading: false,
      isFetching: false,
    });

    const { container } = render(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
  });

  it("shows skeletons while refetching after deletion, then hides them without page reload", async () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockStockData,
      isLoading: false,
      isFetching: false,
    });

    const { rerender, container } = render(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    // Sanity: no skeletons when idle.
    await waitFor(() => {
      expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
    });

    // Simulate refetch triggered by an external deletion (e.g. HistoryModule invalidating queries).
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockStockData,
      isLoading: false,
      isFetching: true,
    });

    rerender(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    // Skeletons should appear during the refetch window.
    await waitFor(() => {
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });

    // Refetch completes.
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockStockData,
      isLoading: false,
      isFetching: false,
    });

    rerender(
      <TestWrapper>
        <StockModule />
      </TestWrapper>
    );

    // Skeletons should disappear.
    await waitFor(() => {
      expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
    });
  });
});
