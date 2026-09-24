/** Fixed-capacity ring buffer (no allocation growth over long runs). Items must be pushed in time order. */
export class RingBuffer<T extends { t: number }> {
  private buf: (T | undefined)[];
  private head = 0;
  private len = 0;
  constructor(readonly capacity: number) {
    this.buf = new Array(capacity);
  }
  push(item: T) {
    this.buf[(this.head + this.len) % this.capacity] = item;
    if (this.len < this.capacity) this.len++;
    else this.head = (this.head + 1) % this.capacity;
  }
  get size() {
    return this.len;
  }
  clear() {
    this.buf = new Array(this.capacity);
    this.head = 0;
    this.len = 0;
  }
  /** items with t >= since, oldest first */
  since(since: number): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.len; i++) {
      const it = this.buf[(this.head + i) % this.capacity] as T;
      if (it.t >= since) out.push(it);
    }
    return out;
  }
  /** drop items older than t (keeps memory bounded by time, too) */
  dropBefore(t: number) {
    while (this.len && (this.buf[this.head] as T).t < t) {
      this.buf[this.head] = undefined;
      this.head = (this.head + 1) % this.capacity;
      this.len--;
    }
  }
}
