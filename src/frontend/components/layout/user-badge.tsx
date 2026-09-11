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
import { CURRENT_USER } from "@/lib/auth-stub";

export function UserBadge() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-console-header-foreground transition-colors hover:bg-console-header-hover">
        <Avatar className="size-7">
          <AvatarFallback className="bg-console-header-hover text-xs font-medium text-console-header-foreground">
            {CURRENT_USER.avatarInitials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <span className="font-medium">{CURRENT_USER.name}</span>
          <span className="text-xs capitalize text-console-header-muted">{CURRENT_USER.role}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Auth stubbed for Phase I
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="gap-2">
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
          <p className="px-1.5 pt-1 pb-0.5 text-[11px] leading-snug text-muted-foreground">
            Cognito + API Gateway auth is planned for Phase II — this demo uses a fixed operator
            session.
          </p>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
