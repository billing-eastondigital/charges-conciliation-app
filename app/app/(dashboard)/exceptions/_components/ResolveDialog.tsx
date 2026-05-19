"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { resolveException } from "../actions";
import type { Exception } from "@/lib/types";

interface ResolveDialogProps {
  exception: Exception | null;
  mode: "RESOLVED" | "WONT_FIX" | null;
  onClose: () => void;
}

export function ResolveDialog({ exception, mode, onClose }: ResolveDialogProps) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const isOpen = exception !== null && mode !== null;

  function handleConfirm() {
    if (!exception || !mode) return;
    startTransition(async () => {
      await resolveException(exception.id, mode, note);
      setNote("");
      onClose();
    });
  }

  function handleClose() {
    if (isPending) return;
    setNote("");
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "RESOLVED" ? "Resolve Exception" : "Won't Fix"}
          </DialogTitle>
        </DialogHeader>

        {exception && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 py-3 border-b border-[#dddddd]">
              <StatusBadge status={exception.reconciliation_status} />
              <div>
                <p className="text-sm font-medium text-[#3a3a3a]">{exception.display_name}</p>
                <p className="text-xs text-[#6b7280]">{exception.period_label}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[#4B4F58] uppercase tracking-wide">
                Note <span className="normal-case font-normal text-[#9ca3af]">(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  mode === "RESOLVED"
                    ? "Explain how this was resolved..."
                    : "Explain why no action is needed..."
                }
                rows={4}
                className="mt-1.5 w-full text-sm border border-[#dddddd] rounded-sm px-3 py-2 focus:outline-none focus:border-[#0170B9] resize-none text-[#3a3a3a] placeholder:text-[#9ca3af]"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <button
            onClick={handleClose}
            disabled={isPending}
            className="text-sm px-4 py-2 border border-[#dddddd] rounded-sm text-[#4B4F58] hover:border-[#6b7280] disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="text-sm px-4 py-2 bg-[#0170B9] text-white rounded-sm hover:bg-[#015a94] disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving…" : mode === "RESOLVED" ? "Mark Resolved" : "Won't Fix"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
