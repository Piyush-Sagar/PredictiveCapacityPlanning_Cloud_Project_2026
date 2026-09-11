import type { CurrentUser } from "@/lib/types";

/**
 * Phase I has no real authentication — Cognito + API Gateway are described
 * in the architecture docs but not implemented. This stands in for a signed
 * in session so the dashboard shell reads as "authenticated".
 */
export const CURRENT_USER: CurrentUser = {
  name: "Ops Demo User",
  role: "operator",
  avatarInitials: "OD",
};

export function getCurrentUser(): CurrentUser {
  return CURRENT_USER;
}
