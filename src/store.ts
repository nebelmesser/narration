import type { StoreSnapshot, StoreValue } from './types.ts';

export type StoreListener = (prev: StoreSnapshot, next: StoreSnapshot) => void;

export class KvStore {
  private data: StoreSnapshot = {};
  private listeners = new Set<StoreListener>();

  get(key: string): StoreValue | undefined {
    return this.data[key];
  }

  snapshot(): StoreSnapshot {
    return { ...this.data };
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  set(key: string, value: StoreValue): void {
    this.patch({ [key]: value });
  }

  delete(key: string): void {
    if (!(key in this.data)) return;
    const prev = this.snapshot();
    delete this.data[key];
    this.emit(prev, this.snapshot());
  }

  patch(values: StoreSnapshot): void {
    const prev = this.snapshot();
    let changed = false;
    for (const [key, value] of Object.entries(values)) {
      if (this.data[key] !== value) {
        this.data[key] = value;
        changed = true;
      }
    }
    if (changed) this.emit(prev, this.snapshot());
  }

  private emit(prev: StoreSnapshot, next: StoreSnapshot): void {
    for (const listener of this.listeners) listener(prev, next);
  }
}
