/**
 * "live" talks to the FastAPI backend through the /api/backend BFF proxy and
 * requires a (mock) Cognito session; "mock" keeps the original seeded,
 * backend-free demo. Inlined at build time.
 */
export const DATA_MODE: "live" | "mock" = process.env.NEXT_PUBLIC_DATA_MODE === "live" ? "live" : "mock";
export const IS_LIVE = DATA_MODE === "live";
