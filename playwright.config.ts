import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // WebKit na Windows občas spadne bez vlivu aplikace – jeden opakovaný pokus (označí se jako „flaky“)
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "pc-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "pc-edge-uzky", use: { ...devices["Desktop Edge"], viewport: { width: 1024, height: 768 } } },
    { name: "ipad-na-vysku", use: { ...devices["iPad (gen 7)"] } },
    { name: "ipad-na-sirku", use: { ...devices["iPad (gen 7) landscape"] } },
    { name: "ipad-split-view", use: { ...devices["iPad (gen 7) landscape"], viewport: { width: 507, height: 810 } } },
    { name: "ipad-mini", use: { ...devices["iPad Mini"] } },
    { name: "mobil-iphone", use: { ...devices["iPhone 13"] } },
  ],
});
