/** Доступ к localStorage всегда через try/catch: приватный режим его запрещает. */

export function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Место кончилось или хранилище запрещено — интерфейс продолжает работать.
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Молча: удаление не критично.
  }
}

export function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // См. выше.
  }
}

export function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  }
}
