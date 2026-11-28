export interface PermissionChoice {
  id: string;
  code: string;
  prerequisites?: string[] | null;
}

/** Preserve required common rights without silently granting sibling actions. */
export function changePermissionChoices(
  permissions: PermissionChoice[], selected: Set<string>, ids: string[], enabled: boolean,
): Set<string> {
  const next = new Set(selected);
  const byCode = new Map(permissions.map((p) => [p.code, p]));
  const add = (id: string, visiting = new Set<string>()) => {
    if (visiting.has(id)) return;
    visiting.add(id);
    next.add(id);
    const p = permissions.find((item) => item.id === id);
    const parents = (p?.prerequisites ?? []).map((code) => byCode.get(code)).filter((item): item is PermissionChoice => !!item);
    if (parents.length && !parents.some((parent) => next.has(parent.id))) {
      const parent = parents[0];
      if (parent) add(parent.id, visiting);
    }
  };
  if (enabled) ids.forEach((id) => add(id));
  else {
    ids.forEach((id) => next.delete(id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of permissions) {
        if (next.has(p.id) && p.prerequisites?.length && !p.prerequisites.some((code) => {
          const parent = byCode.get(code);
          return parent && next.has(parent.id);
        })) {
          next.delete(p.id);
          changed = true;
        }
      }
    }
  }
  return next;
}