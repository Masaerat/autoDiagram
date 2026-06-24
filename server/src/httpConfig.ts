export type ServerEnvironment = Partial<Record<"HOST" | "PORT" | "HTTPS_CERT" | "HTTPS_KEY", string>>;

export type ServerHttpsConfig = {
  certPath: string;
  keyPath: string;
};

export type ServerConfig = {
  host: string;
  port: number;
  https: ServerHttpsConfig | null;
  publicProtocol: "http" | "https";
};

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function parsePort(value: string | undefined): number {
  const parsed = Number(clean(value));
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 27300;
}

export function buildServerConfig(environment: ServerEnvironment = process.env): ServerConfig {
  const certPath = clean(environment.HTTPS_CERT);
  const keyPath = clean(environment.HTTPS_KEY);
  const https = certPath && keyPath ? { certPath, keyPath } : null;

  return {
    host: clean(environment.HOST) || "127.0.0.1",
    port: parsePort(environment.PORT),
    https,
    publicProtocol: https ? "https" : "http"
  };
}
