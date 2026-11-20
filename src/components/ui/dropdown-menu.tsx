"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />;
export const DropdownMenuLabel = ({ children }: { children: React.ReactNode }) => (
  <M.Label className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-mute">{children}</M.Label>
);

export function DropdownMenuContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align="end"
        sideOffset={8}
        className={cn("z-50 min-w-[200px] rounded-xl border border-line bg-rail p-1 text-sm text-fg shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0", className)}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: React.ComponentPropsWithoutRef<typeof M.Item>) {
  return (
    <M.Item
      className={cn("flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-seg", className)}
      {...props}
    />
  );
}
