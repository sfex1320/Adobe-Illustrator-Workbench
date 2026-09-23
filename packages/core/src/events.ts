/** 极小型事件总线。core 不依赖 React；面板订阅后触发重渲染。 */

export type EventListener<T> = (payload: T) => void;

export class EventBus<EventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof EventMap, Set<EventListener<never>>>();

  on<K extends keyof EventMap>(type: K, listener: EventListener<EventMap[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as EventListener<never>);
    return () => {
      set?.delete(listener as EventListener<never>);
    };
  }

  emit<K extends keyof EventMap>(type: K, payload: EventMap[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as EventListener<EventMap[K]>)(payload);
      } catch {
        // 单个监听器异常不影响其他监听器与发射方。
      }
    }
  }

  listenerCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}
