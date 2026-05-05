'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:!bg-[#151515]">
        <div className="animate-pulse rounded-2xl border border-gray-200 bg-white px-6 py-4 text-sm font-medium text-gray-700 shadow-sm dark:!border-[#262626] dark:!bg-[#0f0f10] dark:!text-[#ecf5f8]">
          Cargando entorno...
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="ccr-dashboard-shell flex min-h-screen bg-slate-100 dark:!bg-[#151515]">
      <Sidebar
        rol={user.rol}
        userId={user.id}
        mobileOpen={mobileSidebarOpen}
        onMobileOpenChange={setMobileSidebarOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar user={user} onOpenSidebar={() => setMobileSidebarOpen(true)} />
        <main className="ccr-dashboard-main flex-1 overflow-y-auto bg-slate-100 dark:!bg-[#151515]">
          <div className="mx-auto w-full max-w-[1720px] px-3 py-3 sm:px-4 sm:py-4 lg:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
