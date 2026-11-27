/** Regroupe une salve d'appels en un seul, `wait` ms après le dernier. */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, wait: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  const d = (...a: A) => { if (t) clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, wait); };
  d.cancel = () => { if (t) clearTimeout(t); t = null; };
  return d;
}
