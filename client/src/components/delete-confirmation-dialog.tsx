import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning";
}

export function DeleteConfirmationDialog({
  isOpen,
  setIsOpen,
  title,
  description,
  onConfirm,
  confirmText = "Delete",
  cancelText = "Cancel",
  variant = "danger",
}: DeleteConfirmationDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    setIsOpen(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className={variant === "danger" ? "text-red-500" : "text-amber-500"} size={18} />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700 focus:ring-red-600"
                : "bg-amber-600 hover:bg-amber-700 focus:ring-amber-600"
            }
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}