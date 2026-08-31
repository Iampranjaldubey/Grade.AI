import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./Dialog";
import { ConfirmDialog } from "./AlertDialog";

describe("Dialog", () => {
  it("opens from a trigger, moves focus in, and closes on Escape", async () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create course</DialogTitle>
          </DialogHeader>
          <button>Inside action</button>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // Radix moves focus into the dialog (focus trap).
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );

    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});

describe("ConfirmDialog", () => {
  it("fires onConfirm when the confirm button is pressed", () => {
    let confirmed = false;

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete document?"
          description="This cannot be undone."
          confirmLabel="Delete"
          tone="danger"
          onConfirm={() => {
            confirmed = true;
          }}
        />
      );
    }

    render(<Harness />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirmed).toBe(true);
  });
});
