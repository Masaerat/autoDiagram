import { describe, expect, it } from "vitest";
import { buildServerConfig } from "./httpConfig.js";

describe("HTTP server config", () => {
  it("defaults to local HTTP for safe single-machine use", () => {
    expect(buildServerConfig({})).toEqual({
      host: "127.0.0.1",
      port: 27300,
      https: null,
      publicProtocol: "http"
    });
  });

  it("enables LAN HTTPS when certificate and key paths are provided", () => {
    expect(
      buildServerConfig({
        HOST: "0.0.0.0",
        PORT: "9443",
        HTTPS_CERT: "certs/auto-diagram.pem",
        HTTPS_KEY: "certs/auto-diagram-key.pem"
      })
    ).toEqual({
      host: "0.0.0.0",
      port: 9443,
      https: {
        certPath: "certs/auto-diagram.pem",
        keyPath: "certs/auto-diagram-key.pem"
      },
      publicProtocol: "https"
    });
  });

  it("defaults LAN HTTPS to the single production port", () => {
    expect(
      buildServerConfig({
        HOST: "0.0.0.0",
        HTTPS_CERT: "certs/auto-diagram.pem",
        HTTPS_KEY: "certs/auto-diagram-key.pem"
      })
    ).toMatchObject({
      host: "0.0.0.0",
      port: 27300,
      publicProtocol: "https"
    });
  });
});
