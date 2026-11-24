import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LoginPage from "@/app/(auth)/login/page";

// next/image necesita las dimensiones del import de imagen, que vitest no entrega.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ login: vi.fn() }),
}));
vi.mock("@/lib/toast-context", () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }),
}));

// Prueba de humo del login: renderiza y restaura las preferencias guardadas.
describe("LoginPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("muestra el formulario de inicio de sesión", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  // Sin NEXT_PUBLIC_DEMO_MODE=true (el valor por defecto y el de producción) no hay accesos de prueba.
  it("sin modo demo no muestra accesos de prueba ni precarga credenciales", () => {
    render(<LoginPage />);
    expect(screen.queryByText(/Accesos de prueba/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Administrador CCR")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ingresa tu contraseña")).toHaveValue("");
  });

  it("aplica el tema oscuro guardado", async () => {
    window.localStorage.setItem("ccr-login-theme", "dark");
    render(<LoginPage />);
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  });

  it("restaura el RUT recordado", async () => {
    window.localStorage.setItem("ccr-login-rut", "12345678K");
    render(<LoginPage />);
    await waitFor(() => expect(screen.getByDisplayValue("12.345.678-K")).toBeInTheDocument());
  });
});
