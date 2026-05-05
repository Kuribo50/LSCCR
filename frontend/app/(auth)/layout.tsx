export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ccr-auth-shell relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 sm:py-8">
      <div className="ccr-auth-backdrop pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,#e9f4fb_0%,rgba(219,234,254,0)_28%),radial-gradient(circle_at_90%_18%,#ecf5f8_0%,rgba(239,246,255,0)_30%),linear-gradient(180deg,#F8FAFC_0%,#F1F5F9_100%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full items-center justify-center sm:min-h-[calc(100vh-4rem)]">
        {children}
      </div>
    </div>
  )
}
