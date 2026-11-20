"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;
export const DialogTitle = D.Title;
export const DialogDescription = D.Description;

export function DialogContent({
  className, children, wide, ...props
}: React.ComponentPropsWithoutRef<typeof D.Content> & { wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <D.Content
        className={cn(
          "fixed z-50 flex max-h-[92dvh] flex-col overflow-hidden border border-line bg-card shadow-2xl focus:outline-none",
          "inset-x-0 bottom-0 rounded-t-2xl md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(94vw,var(--w))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4",
          className
        )}
        style={{ ["--w" as string]: wide ? "960px" : "520px" }}
        {...props}
      >
        {children}
        <D.Close aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-sub hover:bg-seg hover:text-fg">
          <X size={18} />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
