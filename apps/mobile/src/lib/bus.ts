/** Tiny in-memory event bus — used to hand a scanned product back to the bill screen. */
type Fn<T> = (v: T) => void;
const subs = new Map<string, Set<Fn<any>>>();
export const bus = {
  on<T>(ev: string, fn: Fn<T>) { if (!subs.has(ev)) subs.set(ev, new Set()); subs.get(ev)!.add(fn); return () => { subs.get(ev)!.delete(fn); }; },
  emit<T>(ev: string, v: T) { subs.get(ev)?.forEach((f) => f(v)); },
};
