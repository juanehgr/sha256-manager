/// <reference types="vite/client" />

type Sha256Desktop = {
  desktop: boolean;
  onUpdate: (
    fn: (data: { state: string; version?: string; percent?: number; message?: string }) => void
  ) => () => void;
  downloadUpdate: () => Promise<unknown>;
  installUpdate: () => Promise<unknown>;
};

interface Window {
  sha256Manager?: Sha256Desktop;
}
