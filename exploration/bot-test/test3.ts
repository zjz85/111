// 订单处理模块 — 业务代码，非生成文件
// 用于测试 SCOPE-001 打回

export function validateOrderId(id: string): boolean {
  return /^ORD-\d{8}$/.test(id);
}

export function calculateDiscount(price: number, tier: string): number {
  switch (tier) {
    case "vip": return price * 0.8;
    case "wholesale": return price * 0.85;
    case "member": return price * 0.9;
    default: return price;
  }
}

export function formatCurrency(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

export function parseAddress(raw: string): { city: string; district: string; detail: string } {
  const parts = raw.split(",");
  return { city: parts[0] ?? "", district: parts[1] ?? "", detail: parts[2] ?? "" };
}

export function isExpressShipping(weight: number): boolean {
  return weight > 10;
}

export function calcShipping(weight: number, dest: string): number {
  const base = dest === "remote" ? 30 : 15;
  return base + weight * 0.5;
}

export function generateTrackingId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SF-${ts}-${rand}`;
}

export function validatePhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

export function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

export function estimateDelivery(days: number): string {
  if (days <= 0) return "今天送达";
  if (days === 1) return "明天送达";
  return `${days}天内送达`;
}

export function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

export function calcTax(amount: number, rate: number): number {
  return amount * rate;
}

export function bulkDiscount(count: number): number {
  if (count >= 100) return 0.7;
  if (count >= 50) return 0.8;
  if (count >= 10) return 0.9;
  return 1;
}

export function paginate<T>(items: T[], page: number, size: number): { items: T[]; total: number; page: number; pages: number } {
  const total = items.length;
  const pages = Math.ceil(total / size);
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), total, page, pages };
}

export function sortByKey<T>(arr: T[], key: keyof T, asc = true): T[] {
  return [...arr].sort((a, b) => {
    if (a[key] < b[key]) return asc ? -1 : 1;
    if (a[key] > b[key]) return asc ? 1 : -1;
    return 0;
  });
}

export function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = fn(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function retry<T>(fn: () => Promise<T>, max: number, delay: number): Promise<T> {
  return fn().catch((err) => {
    if (max <= 1) throw err;
    return new Promise<T>((r) => setTimeout(r, delay)).then(() => retry(fn, max - 1, delay));
  });
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const r = {} as Pick<T, K>;
  for (const k of keys) r[k] = obj[k];
  return r;
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const r = { ...obj };
  for (const k of keys) delete r[k];
  return r;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffle<T>(arr: T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < arr.length; i += size) r.push(arr.slice(i, i + size));
  return r;
}

export function flatten<T>(arr: T[][]): T[] {
  return arr.reduce((a, b) => a.concat(b), []);
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function uniqBy<T>(arr: T[], fn: (item: T) => any): T[] {
  const seen = new Set<any>();
  return arr.filter((item) => {
    const k = fn(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function diff<T>(a: T[], b: T[]): T[] {
  return a.filter((x) => !b.includes(x));
}

export function intersection<T>(a: T[], b: T[]): T[] {
  return a.filter((x) => b.includes(x));
}

export function union<T>(a: T[], b: T[]): T[] {
  return [...new Set([...a, ...b])];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function roundTo(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

export function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isUrl(url: string): boolean {
  try { new URL(url); return true; } catch { return false; }
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function camelCase(str: string): string {
  return str.replace(/[-_]\w/g, (m) => m[1].toUpperCase());
}

export function snakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()).replace(/^-/, "");
}

export function kebabCase(str: string): string {
  return snakeCase(str).replace(/_/g, "-");
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? singular + "s";
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function parseJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? "?" + parts.join("&") : "";
}

export function parseQueryString(qs: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const p of qs.replace(/^\?/, "").split("&")) {
    const [k, v] = p.split("=");
    if (k) r[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return r;
}

export function createCounter(): { inc(): number; dec(): number; reset(): void; value(): number } {
  let v = 0;
  return {
    inc() { return ++v; },
    dec() { return --v; },
    reset() { v = 0; },
    value() { return v; },
  };
}

export function createQueue<T>(): { push(item: T): void; pop(): T | undefined; size(): number; clear(): void } {
  const items: T[] = [];
  return {
    push(item: T) { items.push(item); },
    pop() { return items.shift(); },
    size() { return items.length; },
    clear() { items.length = 0; },
  };
}

export function createStack<T>(): { push(item: T): void; pop(): T | undefined; peek(): T | undefined; size(): number } {
  const items: T[] = [];
  return {
    push(item: T) { items.push(item); },
    pop() { return items.pop(); },
    peek() { return items[items.length - 1]; },
    size() { return items.length; },
  };
}

export function createLRU<K, V>(capacity: number): { get(k: K): V | undefined; set(k: K, v: V): void; has(k: K): boolean; delete(k: K): void; clear(): void } {
  const map = new Map<K, V>();
  return {
    get(k: K) {
      const v = map.get(k);
      if (v !== undefined) { map.delete(k); map.set(k, v); }
      return v;
    },
    set(k: K, v: V) {
      if (map.has(k)) map.delete(k);
      else if (map.size >= capacity) map.delete(map.keys().next().value as K);
      map.set(k, v);
    },
    has(k: K) { return map.has(k); },
    delete(k: K) { map.delete(k); },
    clear() { map.clear(); },
  };
}

export function once<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => ReturnType<T> {
  let called = false;
  let result: ReturnType<T>;
  return (...args) => {
    if (!called) { called = true; result = fn(...args); }
    return result;
  };
}

export function memoize<T extends (...args: any[]) => any>(fn: T, keyFn?: (...args: Parameters<T>) => string): (...args: Parameters<T>) => ReturnType<T> {
  const cache = new Map<string, ReturnType<T>>();
  return (...args) => {
    const k = keyFn ? keyFn(...args) : JSON.stringify(args);
    if (cache.has(k)) return cache.get(k)!;
    const r = fn(...args);
    cache.set(k, r);
    return r;
  };
}

export function pipe<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduce((v, fn) => fn(v), arg);
}

export function compose<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduceRight((v, fn) => fn(v), arg);
}

export function curry<T extends (...args: any[]) => any>(fn: T, arity = fn.length): (...args: any[]) => any {
  return (...args: any[]) =>
    args.length >= arity ? fn(...args) : curry(fn.bind(null, ...args), arity - args.length);
}

export function range(start: number, end: number, step = 1): number[] {
  const r: number[] = [];
  if (step > 0) for (let i = start; i < end; i += step) r.push(i);
  else for (let i = start; i > end; i += step) r.push(i);
  return r;
}

export function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

export function average(arr: number[]): number {
  return arr.length ? sum(arr) / arr.length : 0;
}

export function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mode(arr: number[]): number {
  const freq = new Map<number, number>();
  for (const n of arr) freq.set(n, (freq.get(n) ?? 0) + 1);
  let max = 0, val = 0;
  for (const [k, v] of freq) if (v > max) { max = v; val = k; }
  return val;
}

export function variance(arr: number[]): number {
  const avg = average(arr);
  return arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length;
}

export function stdDev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

export function normalize(arr: number[]): number[] {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (max === min) return arr.map(() => 0.5);
  return arr.map((v) => (v - min) / (max - min));
}

export function interleave<T>(...arrs: T[][]): T[] {
  const r: T[] = [];
  const max = Math.max(...arrs.map((a) => a.length));
  for (let i = 0; i < max; i++) for (const a of arrs) if (i < a.length) r.push(a[i]);
  return r;
}

export function zip<T, U>(a: T[], b: U[]): [T, U][] {
  return a.slice(0, Math.min(a.length, b.length)).map((v, i) => [v, b[i]]);
}

export function toPairs<T>(obj: Record<string, T>): [string, T][] {
  return Object.entries(obj);
}

export function fromPairs<T>(pairs: [string, T][]): Record<string, T> {
  return Object.fromEntries(pairs);
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" || Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

export function get<T, K extends keyof T>(obj: T, key: K, fallback?: T[K]): T[K] {
  return key in obj ? obj[key] : (fallback as T[K]);
}

export function set<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  obj[key] = value;
  return obj;
}

export function has<T extends object>(obj: T, key: keyof T): boolean {
  return key in obj;
}

export function toArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

export function isPromise(v: unknown): v is Promise<unknown> {
  return v instanceof Promise;
}

export function timeout<T>(promise: Promise<T>, ms: number, msg?: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg ?? "timeout")), ms)),
  ]);
}

export function sequentially<T>(fns: Array<() => Promise<T>>): Promise<T[]> {
  const r: T[] = [];
  return fns.reduce((p, fn) => p.then(() => fn().then((v) => r.push(v))), Promise.resolve()).then(() => r);
}

export function concurrently<T>(fns: Array<() => Promise<T>>, limit = 4): Promise<T[]> {
  const results: T[] = [];
  const queue = [...fns];
  const next = (): Promise<void> => {
    if (!queue.length) return Promise.resolve();
    const idx = fns.length - queue.length;
    return queue.shift()!().then((v) => { results[idx] = v; }).then(next);
  };
  return Promise.all(Array.from({ length: Math.min(limit, fns.length) }, next)).then(() => results);
}

export function createEventBus<T extends Record<string, any>>(): {
  on<K extends keyof T>(event: K, handler: (payload: T[K]) => void): () => void;
  emit<K extends keyof T>(event: K, payload: T[K]): void;
  off<K extends keyof T>(event: K, handler: (payload: T[K]) => void): void;
  clear(): void;
} {
  const handlers = new Map<string, Set<Function>>();
  return {
    on(event, handler) {
      if (!handlers.has(event as string)) handlers.set(event as string, new Set());
      handlers.get(event as string)!.add(handler);
      return () => handlers.get(event as string)?.delete(handler);
    },
    emit(event, payload) { handlers.get(event as string)?.forEach((h) => h(payload)); },
    off(event, handler) { handlers.get(event as string)?.delete(handler); },
    clear() { handlers.clear(); },
  };
}

export function createPubSub<T>(): {
  subscribe(fn: (data: T) => void): () => void;
  publish(data: T): void;
} {
  const subs = new Set<(data: T) => void>();
  return {
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    publish(data) { subs.forEach((fn) => fn(data)); },
  };
}

export function createRateLimiter(max: number, windowMs: number): {
  try(): boolean;
  remaining(): number;
  reset(): void;
} {
  let tokens = max;
  let lastRefill = Date.now();
  return {
    try() {
      const now = Date.now();
      const elapsed = now - lastRefill;
      tokens = Math.min(max, tokens + Math.floor(elapsed / windowMs) * (max - tokens));
      lastRefill = now;
      if (tokens <= 0) return false;
      tokens--;
      return true;
    },
    remaining() { return tokens; },
    reset() { tokens = max; lastRefill = Date.now(); },
  };
}

export function createSemaphore(initial: number): {
  acquire(): Promise<number>;
  release(): void;
  count(): number;
} {
  let permits = initial;
  const queue: Array<(permits: number) => void> = [];
  return {
    acquire() {
      if (permits > 0) return Promise.resolve(--permits);
      return new Promise((r) => queue.push(r));
    },
    release() {
      permits++;
      if (queue.length) queue.shift()!(--permits);
    },
    count() { return permits; },
  };
}

export function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

export function md5like(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 16777619) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function shortId(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let r = "";
  for (let i = 0; i < length; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function escapeHtml(str: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}

export function unescapeHtml(str: string): string {
  const map: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
  return str.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => map[m]);
}

export function countOccurrences(str: string, sub: string): number {
  let count = 0, pos = 0;
  while ((pos = str.indexOf(sub, pos)) !== -1) { count++; pos += sub.length; }
  return count;
}

export function isPalindrome(str: string): boolean {
  const s = str.replace(/[\W_]/g, "").toLowerCase();
  return s === s.split("").reverse().join("");
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(prev + (a[i - 1] === b[j - 1] ? 0 : 1), dp[i] + 1, dp[i - 1] + 1);
      prev = tmp;
    }
  }
  return dp[m];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max ? 1 - levenshtein(a, b) / max : 1;
}
