import { useEffect, useMemo } from "react";
import { useTenant } from "@/hooks/useTenant";
import {
  BrandIdentity,
  DEFAULT_BRAND,
  setActiveBrand,
} from "@/lib/branding";

const applyColor = (variable: string, value: string | null | undefined) => {
  const root = document.documentElement;
  if (value && /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(value.trim())) {
    root.style.setProperty(variable, value.trim());
  } else {
    root.style.removeProperty(variable);
  }
};

const applyFavicon = (url: string | null) => {
  if (!url) return;
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
};

/**
 * Identité visuelle de la société active (white label).
 * Chaque société ne voit que sa propre configuration.
 */
export const useBranding = (): BrandIdentity => {
  const { tenant } = useTenant();

  return useMemo<BrandIdentity>(() => {
    if (!tenant) return DEFAULT_BRAND;
    return {
      tenantId: tenant.id,
      companyName: tenant.trade_name || tenant.name,
      legalName: tenant.legal_name || tenant.name,
      logoUrl: tenant.logo_url || null,
      faviconUrl: tenant.favicon_url || null,
      primaryColor: tenant.primary_color || DEFAULT_BRAND.primaryColor,
      secondaryColor: tenant.secondary_color || DEFAULT_BRAND.secondaryColor,
      address: tenant.address || null,
      phone: tenant.phone || null,
      email: tenant.email || null,
      website: tenant.website || null,
      taxId: tenant.tax_id || null,
      currency: tenant.default_currency || DEFAULT_BRAND.currency,
      language: tenant.default_language || DEFAULT_BRAND.language,
      appTitle: tenant.app_title || null,
      appDescription: tenant.app_description || null,
      footerNote: tenant.footer_note || null,
      poweredBy:
        tenant.show_powered_by === false
          ? null
          : tenant.powered_by_label || DEFAULT_BRAND.poweredBy,
    };
  }, [tenant]);
};

/** Applique dynamiquement thème, titre et favicon de la société active */
export const BrandingProvider = ({ children }: { children: React.ReactNode }) => {
  const brand = useBranding();

  useEffect(() => {
    setActiveBrand(brand);
    applyColor("--primary", brand.primaryColor);
    applyColor("--ring", brand.primaryColor);
    applyColor("--sidebar-primary", brand.primaryColor);
    applyColor("--accent", brand.secondaryColor);
    applyFavicon(brand.faviconUrl);
    document.title = brand.appTitle || `${brand.companyName} — Gestion des stations`;
    const desc = document.querySelector<HTMLMetaElement>("meta[name='description']");
    if (desc && brand.appDescription) desc.content = brand.appDescription;
  }, [brand]);

  return <>{children}</>;
};
