import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { logAudit } from "@/lib/audit";
import { clearOfflineCache } from "@/lib/offlineCache";

/**
 * Without network an expired access token cannot be refreshed, so the auth client
 * reports no session. Keep the last signed-in user on screen (cached data + device
 * queue only); every server call still needs a valid token once back online.
 */
const storedOfflineUser = (): User | null => {
  if (typeof navigator === "undefined" || navigator.onLine) return null;
  try {
    const ref = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    return raw ? (JSON.parse(raw)?.user ?? null) : null;
  } catch {
    return null;
  }
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string, captchaToken?: string | null) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? (event === "SIGNED_OUT" ? null : storedOfflineUser()));
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? storedOfflineUser());
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, captchaToken?: string | null) => {
    await clearOfflineCache();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (!error) void logAudit("login", "authentification");
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    try {
      await logAudit("logout", "authentification");
      await supabase.auth.signOut();
    } catch (error) {
      // Even if signOut fails (e.g. session already expired), clear local state
      console.warn("Sign out error (clearing local state):", error);
    }
    await clearOfflineCache();
    // Force clear local state regardless of API response
    setSession(null);
    setUser(null);
    // Retour à l'écran d'accueil LUMATEK (page vierge sans paramètres de société/pays)
    window.location.replace("/auth");
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
