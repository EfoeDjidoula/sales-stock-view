/**
 * Runtime translator for French source UI text. It only rewrites the value of
 * existing text nodes and a few display attributes in place (never replaces
 * nodes), so React keeps ownership of the DOM. Original French text is kept per
 * node and restored when French is selected again.
 */
export type Lookup = {
  exact: Map<string, string>;
  templates: { piece: string; re: RegExp; to: string }[];
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildLookup = (dict: Record<string, string>): Lookup => {
  const exact = new Map<string, string>();
  const templates: Lookup["templates"] = [];
  for (const [from, to] of Object.entries(dict)) {
    if (!from || !to || from === to) continue;
    if (from.includes("{x}")) {
      const parts = from.split("{x}");
      const piece = parts.reduce((a, b) => (b.trim().length > a.trim().length ? b : a), "");
      if (piece.trim().length < 2) continue;
      templates.push({ piece, re: new RegExp(`^${parts.map(escapeRe).join("(.+?)")}$`), to });
    } else {
      exact.set(from, to);
    }
  }
  return { exact, templates };
};

/** Translates one piece of visible text; returns null when no translation applies. */
export const translateText = (raw: string, lookup: Lookup): string | null => {
  const core = raw.replace(/\s+/g, " ").trim();
  if (core.length < 2 || !/[A-Za-zÀ-ÿ]/.test(core)) return null;
  let translated = lookup.exact.get(core) ?? null;
  if (translated == null && core.length < 240) {
    for (const t of lookup.templates) {
      if (!core.includes(t.piece)) continue;
      const m = t.re.exec(core);
      if (!m) continue;
      let i = 1;
      translated = t.to.replace(/\{x\}/g, () => {
        const value = m[i++] ?? "";
        return lookup.exact.get(value.trim()) ?? value;
      });
      break;
    }
  }
  if (translated == null) return null;
  const lead = raw.match(/^\s*/)?.[0] ?? "";
  const trail = raw.match(/\s*$/)?.[0] ?? "";
  return lead + translated + trail;
};

const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT"]);

type TextState = { original: string; applied: string };

export const createDomTranslator = (root: HTMLElement) => {
  let lookup: Lookup | null = null;
  const texts = new WeakMap<Text, TextState>();
  const attrs = new WeakMap<Element, Record<string, TextState>>();

  const skipped = (el: Element | null) => {
    for (let e = el; e; e = e.parentElement) {
      if (SKIP_TAGS.has(e.tagName) || e.getAttribute("translate") === "no" || e.hasAttribute("data-no-translate") || (e as HTMLElement).isContentEditable) return true;
    }
    return false;
  };

  /** React splits `{n} jours` into several sibling text nodes: translate them as one sentence. */
  const handleGroup = (parent: Element): boolean => {
    const nodes = Array.from(parent.childNodes);
    if (nodes.length < 2 || nodes.length > 12 || !nodes.every((n) => n.nodeType === Node.TEXT_NODE)) return false;
    const textNodes = nodes as Text[];
    const originals = textNodes.map((n) => {
      const st = texts.get(n);
      return st && n.nodeValue === st.applied ? st.original : n.nodeValue ?? "";
    });
    const result = translateText(originals.join(""), lookup!);
    if (result == null) return false;
    if (skipped(parent)) return true;
    textNodes.forEach((n, i) => {
      const applied = i === 0 ? result : "";
      texts.set(n, { original: originals[i], applied });
      if (n.nodeValue !== applied) n.nodeValue = applied;
    });
    return true;
  };

  const handleText = (node: Text) => {
    if (!lookup) return;
    if (node.parentElement && node.parentElement.childNodes.length > 1) {
      const st = texts.get(node);
      if (st && node.nodeValue === st.applied) return;
      if (handleGroup(node.parentElement)) return;
    }
    const current = node.nodeValue ?? "";
    const state = texts.get(node);
    if (state && current === state.applied) return;
    const result = translateText(current, lookup);
    if (result == null || result === current) { texts.delete(node); return; }
    if (skipped(node.parentElement)) return;
    texts.set(node, { original: current, applied: result });
    node.nodeValue = result;
  };

  const handleAttr = (el: Element, name: string) => {
    if (!lookup) return;
    const current = el.getAttribute(name);
    if (current == null) return;
    const map = attrs.get(el) ?? {};
    if (map[name] && map[name].applied === current) return;
    const result = translateText(current, lookup);
    if (result == null || result === current) { delete map[name]; return; }
    if (skipped(el)) return;
    map[name] = { original: current, applied: result };
    attrs.set(el, map);
    el.setAttribute(name, result);
  };

  const walk = (start: Node) => {
    if (start.nodeType === Node.TEXT_NODE) return handleText(start as Text);
    if (start.nodeType !== Node.ELEMENT_NODE) return;
    const el = start as Element;
    if (SKIP_TAGS.has(el.tagName)) return;
    for (const a of ATTRS) if (el.hasAttribute(a)) handleAttr(el, a);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) handleText(n as Text);
      else for (const a of ATTRS) if ((n as Element).hasAttribute(a)) handleAttr(n as Element, a);
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "characterData") handleText(m.target as Text);
      else if (m.type === "attributes" && m.attributeName) handleAttr(m.target as Element, m.attributeName);
      else m.addedNodes.forEach(walk);
    }
  });

  const restore = () => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) {
        const s = texts.get(n as Text);
        if (s && n.nodeValue === s.applied) n.nodeValue = s.original;
        texts.delete(n as Text);
      } else {
        const map = attrs.get(n as Element);
        if (!map) continue;
        for (const [name, s] of Object.entries(map)) if ((n as Element).getAttribute(name) === s.applied) (n as Element).setAttribute(name, s.original);
        attrs.delete(n as Element);
      }
    }
  };

  return {
    start(next: Lookup) {
      lookup = next;
      walk(root);
      observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    },
    stop() {
      observer.disconnect();
      lookup = null;
      restore();
    },
  };
};
