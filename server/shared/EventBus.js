/** Simple pub/sub for live UI updates (DIP: services emit, routes subscribe). */
export class EventBus {
  constructor() {
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, data) {
    const evt = { type, data, at: new Date().toISOString() };
    for (const fn of this.listeners) {
      try {
        fn(evt);
      } catch {
        /* ignore */
      }
    }
  }
}

export const eventBus = new EventBus();
