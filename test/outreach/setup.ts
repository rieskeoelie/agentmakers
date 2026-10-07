import { beforeEach } from "vitest";

// Tests must never spend paid credits: strip real credentials and make any un-mocked fetch fail loudly.
for (const k of ["ANTHROPIC_API_KEY", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "HUNTER_API_KEY", "FIRECRAWL_API_KEY", "SMARTLEAD_API_KEY", "RESEND_API_KEY", "OUTREACH_WEBHOOK_SECRET"]) delete process.env[k];

const blockedFetch = async (input: unknown) => {
  throw new Error(`Network access is blocked in tests (attempted: ${String(input)})`);
};
beforeEach(() => {
  globalThis.fetch = blockedFetch as typeof fetch;
});
