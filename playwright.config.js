import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './test/e2e',
    timeout: 30_000,
    use: {
        baseURL: 'http://localhost:3001',
        headless: true,
    },
    webServer: {
        command: 'node mcp/server.js',
        url: 'http://localhost:3001',
        reuseExistingServer: true,
        timeout: 10_000,
    },
})
