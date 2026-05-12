export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ccr-auth-shell relative min-h-screen overflow-hidden">
      <div className="relative flex min-h-screen w-full items-center justify-center">
        {children}
      </div>
    </div>
  )
}
