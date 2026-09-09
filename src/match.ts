import type { StoreSnapshot, StoreValue, WhenSnapshot, WhenValue } from './types.ts';

function isCompare(value: WhenValue): value is Exclude<WhenValue, StoreValue> {
  return typeof value === 'object' && value !== null;
}

function valueMatches(actual: StoreValue | undefined, cond: WhenValue): boolean {
  if (isCompare(cond)) {
    if (typeof actual !== 'number' || !Number.isFinite(actual)) return false;
    if (cond.lt !== undefined && !(actual < cond.lt)) return false;
    if (cond.lte !== undefined && !(actual <= cond.lte)) return false;
    if (cond.gt !== undefined && !(actual > cond.gt)) return false;
    if (cond.gte !== undefined && !(actual >= cond.gte)) return false;
    return cond.lt !== undefined || cond.lte !== undefined || cond.gt !== undefined || cond.gte !== undefined;
  }
  return actual === cond;
}

export function storeEquals(snapshot: StoreSnapshot, cond?: WhenSnapshot): boolean {
  if (!cond) return true;
  for (const [key, value] of Object.entries(cond)) {
    if (!valueMatches(snapshot[key], value)) return false;
  }
  return true;
}

export function cueMatches(snapshot: StoreSnapshot, when?: WhenSnapshot, unless?: WhenSnapshot): boolean {
  if (!storeEquals(snapshot, when)) return false;
  if (!unless) return true;
  for (const [key, value] of Object.entries(unless)) {
    if (valueMatches(snapshot[key], value)) return false;
  }
  return true;
}

export function cueBecameTrue(
  prev: StoreSnapshot,
  next: StoreSnapshot,
  when?: WhenSnapshot,
  unless?: WhenSnapshot,
): boolean {
  return !cueMatches(prev, when, unless) && cueMatches(next, when, unless);
}
