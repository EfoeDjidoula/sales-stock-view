import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";
import { CountryProvider, useCountry } from "@/hooks/useCountry";
import { WorkspaceSelector } from "@/components/tenant/WorkspaceSelector";
import Index from "./pages/Index";
import IndexEntry from "./pages/IndexEntry";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import OAuthConsent from "./pages/OAuthConsent";
import LumatekAdmin from "./pages/LumatekAdmin";

const queryClient = new QueryClient();

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { isLoading: countryLoading, needsSelection } = useCountry();

  if (loading || countryLoading) {
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
      <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <TenantProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TenantProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
