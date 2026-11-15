import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "../ConfirmDialog";

// react-aria-components Modal uses portals; jsdom handles them fine.
// framer-motion AnimatePresence may skip exit animations in test; that's OK.

const defaultProps = {
  isOpen: true,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
  title: "Confirmar eliminación",
  message: "¿Está seguro de eliminar este paciente?",
};

describe("ConfirmDialog", () => {
  // ---- Rendering -----------------------------------------------------------

  it("renders title and message when open", () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByText("Confirmar eliminación")).toBeInTheDocument();
    expect(
      screen.getByText("¿Está seguro de eliminar este paciente?"),
    ).toBeInTheDocument();
  });

  it("renders default button labels", () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirmar" }),
    ).toBeInTheDocument();
  });

  it("renders custom button labels", () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmLabel="Sí, eliminar"
        cancelLabel="No, volver"
      />,
    );

    expect(
      screen.getByRole("button", { name: "No, volver" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sí, eliminar" }),
    ).toBeInTheDocument();
  });

  // ---- Callbacks -----------------------------------------------------------

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  // ---- Loading state -------------------------------------------------------

  it("shows 'Procesando...' when loading is true", () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);

    expect(screen.getByText("Procesando...")).toBeInTheDocument();
  });

  it("disables both buttons when loading", () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);

    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  // ---- Variant styling -----------------------------------------------------

  it("uses danger button classes for danger variant", () => {
    render(<ConfirmDialog {...defaultProps} variant="danger" />);

    const confirmBtn = screen.getByRole("button", { name: "Confirmar" });
    expect(confirmBtn.className).toContain("bg-red-600");
  });

  it("uses warning button classes for warning variant", () => {
    render(<ConfirmDialog {...defaultProps} variant="warning" />);

    const confirmBtn = screen.getByRole("button", { name: "Confirmar" });
    expect(confirmBtn.className).toContain("bg-amber-600");
  });

  it("uses info button classes for info variant", () => {
    render(<ConfirmDialog {...defaultProps} variant="info" />);

    const confirmBtn = screen.getByRole("button", { name: "Confirmar" });
    expect(confirmBtn.className).toContain("bg-blue-500");
  });
});
