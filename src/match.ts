import type { StoreSnapshot } from './types.ts';

export function storeEquals(snapshot: StoreSnapshot, cond?: StoreSnapshot): boolean {
  if (!cond) return true;
  for (const [key, value] of Object.entries(cond)) {
    if (snapshot[key] !== value) return false;
  }
  return true;
}

export function cueMatches(snapshot: StoreSnapshot, when?: StoreSnapshot, unless?: StoreSnapshot): boolean {
  if (!storeEquals(snapshot, when)) return false;
  if (!unless) return true;
  for (const [key, value] of Object.entries(unless)) {
    if (snapshot[key] === value) return false;
  }
  return true;
}

export function cueBecameTrue(
  prev: StoreSnapshot,
  next: StoreSnapshot,
  when?: StoreSnapshot,
  unless?: StoreSnapshot,
): boolean {
  return !cueMatches(prev, when, unless) && cueMatches(next, when, unless);
}
