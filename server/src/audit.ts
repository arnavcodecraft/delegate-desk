import { insert } from './db.ts';
import { ctx, now } from './util.ts';

/** Append a row to the immutable audit trail. Every state change in the product goes through here. */
export function audit(action: string, entity: string, entityId: string | null, before?: unknown, after?: unknown) {
  const c = ctx();
  insert('audit_log', {
    at: now(), user_id: c.userId ?? null, user_label: c.userLabel ?? 'system', ip: c.ip ?? null,
    action, entity, entity_id: entityId,
    before: before === undefined ? null : JSON.stringify(before),
    after: after === undefined ? null : JSON.stringify(after),
  });
}

/** Keep only fields that changed, so the trail shows exact before/after values. */
export function diff(before: Record<string, any>, after: Record<string, any>) {
  const b: Record<string, any> = {}, a: Record<string, any> = {};
  for (const k of Object.keys(after)) {
    if (after[k] !== undefined && JSON.stringify(before[k]) !== JSON.stringify(after[k])) { b[k] = before[k]; a[k] = after[k]; }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
