module.exports = {
  apps: [
    {
      name: "auto-diagram-https",
      script: "dist/server/src/index.js",
      cwd: "/home/gpt/autoDiagram",
      env: {
        HOST: "0.0.0.0",
        PORT: "27488",
        HTTPS_CERT: "certs/auto-diagram.pem",
        HTTPS_KEY: "certs/auto-diagram-key.pem"
      }
    }
  ]
};
