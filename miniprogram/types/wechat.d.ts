declare const wx: {
  cloud?: {
    init(options: { env?: string; traceUser?: boolean }): void;
    database(): unknown;
  };
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  login(options: { success?: (res: { code?: string }) => void; fail?: (err: unknown) => void }): void;
};

declare function App(options: Record<string, unknown>): void;
