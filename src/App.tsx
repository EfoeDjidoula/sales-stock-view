import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAppQueryClient, offlinePersister, OFFLINE_CACHE_MAX_AGE } from "@/lib/offlineCache";
import { OfflineStatus } from "@/components/offline/OfflineStatus";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";
import { CountryProvider, useCountry } from "@/hooks/useCountry";
import { BrandingProvider } from "@/hooks/useBranding";
import { LanguageProvider } from "@/hooks/useLanguage";
import { WorkspaceSelector } from "@/components/tenant/WorkspaceSelector";
import Index from "./pages/Index";
import IndexEntry from "./pages/IndexEntry";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import OAuthConsent from "./pages/OAuthConsent";
import LumatekAdmin from "./pages/LumatekAdmin";
import ClientPortal from "./pages/ClientPortal";
import { usePortalMembership } from "@/hooks/usePortalMembership";

const queryClient = createAppQueryClient();

// Protected route wrapper
const Spinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
  </div>
);

// B2B client logins only ever see their own portal.
const PortalRoute = () => {
  const { user, loading } = useAuth();
  const { membership, isLoading } = usePortalMembership();
  if (!loading && !user) return <Navigate to="/auth" replace />;
  if (loading || isLoading) return <Spinner />;
  if (!membership) return <Navigate to="/" replace />;
  return <ClientPortal />;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { isLoading: countryLoading, needsSelection } = useCountry();
  const { membership, isLoading: portalLoading } = usePortalMembership();

  if (!loading && !user) {
    return <Navigate to="/auth" replace />;
  }

  if (loading || portalLoading) return <Spinner />;
  if (membership) return <Navigate to="/portail" replace />;

  if (countryLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (needsSelection) {
    return <WorkspaceSelector />;
  }

  return <>{children}</>;
};


const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={user ? <Navigate to="/" replace /> : <Auth />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Index />
          </ProtectedRoute>
        }
      />
      <Route
        path="/saisie"
        element={
          <ProtectedRoute>
            <IndexEntry />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lumatek"
        element={
          <ProtectedRoute>
            <LumatekAdmin />
          </ProtectedRoute>
        }
      />
      <Route path="/portail" element={<PortalRoute />} />
      <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister: offlinePersister,
      maxAge: OFFLINE_CACHE_MAX_AGE,
      dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" },
    }}
  >
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <TenantProvider>
            <BrandingProvider>
              <LanguageProvider><CountryProvider>
                <Toaster />
                <Sonner />
                <AppRoutes />
                <OfflineStatus />
              </CountryProvider></LanguageProvider>
            </BrandingProvider>
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
