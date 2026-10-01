import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { translations } from "@/lib/translations";

export type Language = "fr" | "en";
const normalize = (value?: string | null): Language => value?.toLowerCase().startsWith("en") ? "en" : "fr";
type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void; t: (text: string) => string };
const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const key = user?.id ? `lumatek.language.${user.id}` : "lumatek.language.guest";
  const [choice, setChoice] = useState<{ key: string; value: Language } | null>(null);
  const stored = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  const language = choice?.key === key ? choice.value : normalize(stored || tenant?.default_language);
  const setLanguage = (value: Language) => {
    window.localStorage.setItem(key, value);
    setChoice({ key, value });
  };
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const context = useMemo(() => ({ language, setLanguage, t: (text: string) => language === "en" ? translations[text] ?? text : text }), [language, key]);
  return <LanguageContext.Provider value={context}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LanguageProvider missing");
  return context;
};
