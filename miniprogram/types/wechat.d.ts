declare const wx: {
  cloud?: {
    init(options: { env?: string; traceUser?: boolean }): void;
    database(): any;
    callFunction<T = unknown>(options: { name: string; data?: Record<string, unknown>; success?: (res: { result?: T }) => void; fail?: (err: unknown) => void }): Promise<{ result?: T }>;
  };
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  login(options: { success?: (res: { code?: string }) => void; fail?: (err: unknown) => void }): void;
};

declare function App(options: Record<string, unknown>): void;
declare function Page(options: Record<string, unknown>): void;
