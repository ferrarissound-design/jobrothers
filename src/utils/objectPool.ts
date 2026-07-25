/** Simple generic object pool to avoid GC churn for frequently spawned objects (particles, fragments). */
export class ObjectPool<T> {
  private free: T[] = [];
  private createFn: () => T;
  private resetFn: (item: T) => void;
  private maxSize: number;

  constructor(createFn: () => T, resetFn: (item: T) => void, maxSize = 200) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  acquire(): T {
    const item = this.free.pop();
    if (item !== undefined) {
      this.resetFn(item);
      return item;
    }
    return this.createFn();
  }

  release(item: T): void {
    if (this.free.length < this.maxSize) {
      this.free.push(item);
    }
  }
}
