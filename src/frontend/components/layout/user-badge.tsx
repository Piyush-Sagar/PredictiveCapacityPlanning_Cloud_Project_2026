"use client";

import { LogOut, ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IS_LIVE } from "@/lib/config";
import { useSession } from "@/lib/session";

export function UserBadge() {
  const { user } = useSession();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-console-header-foreground transition-colors hover:bg-console-header-hover">
        <Avatar className="size-7">
          <AvatarFallback className="bg-console-header-hover text-xs font-medium text-console-header-foreground">
            {user.avatarInitials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <span className="font-medium">{user.name}</span>
          <span className="text-xs capitalize text-console-header-muted">{user.role}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            {IS_LIVE ? "Signed in with Cognito (simulated)" : "Auth disabled in mock mode"}
          </DropdownMenuLabel>
          {IS_LIVE && user.email && <p className="px-1.5 pb-1 text-xs text-muted-foreground">{user.email}</p>}
          {IS_LIVE && user.groups && user.groups.length > 0 && (
            <p className="px-1.5 pb-1 text-[11px] text-muted-foreground">Groups: {user.groups.join(", ")}</p>
          )}
          <DropdownMenuSeparator />
          {IS_LIVE ? (
            // A plain anchor: logout is a route handler that clears cookies and redirects to Cognito.
            <DropdownMenuItem className="gap-2" render={<a href="/auth/logout" />}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem disabled className="gap-2">
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
              <p className="px-1.5 pt-1 pb-0.5 text-[11px] leading-snug text-muted-foreground">
                Set NEXT_PUBLIC_DATA_MODE=live to sign in through the mock Cognito Hosted UI.
              </p>
            </>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
