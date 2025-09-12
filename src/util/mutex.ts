export interface Mutex<TOwner> {
  acquire(owner: TOwner): Promise<MutexLock>;
}

export interface MutexLock {
  readonly active?: boolean;
  release(): void;
}

export interface MutexOptions<TOwner> {
  readonly onAcquire?: (owner: TOwner) => void;
  readonly onRelease?: (owner: TOwner) => void;
}

export default function createMutex<TOwner = void>({
  onAcquire,
  onRelease,
}: MutexOptions<TOwner> = {}): Mutex<TOwner> {
  let waiting: Promise<void> | undefined;

  return {
    async acquire(owner) {
      while (waiting) await waiting;

      let active = true;
      let release!: () => void;

      waiting = new Promise<void>((resolve) => {
        release = () => {
          waiting = undefined;
          active = false;
          resolve();
        };
      }).finally(() => {
        onRelease?.(owner);
      });

      onAcquire?.(owner);

      const lock: MutexLock = {
        get active() {
          return active;
        },
        release,
      };

      return lock;
    },
  };
}
