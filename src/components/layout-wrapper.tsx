'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import SidebarNav from "@/components/sidebar-nav";
import Header from "@/components/header";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Public/Customer routes that should not have dashboard navigation components
  const isPublicRoute = 
    pathname.includes('/loyalty') || 
    pathname.includes('/login') || 
    pathname.includes('/register');

  if (isPublicRoute) {
    return <div className="min-h-screen w-full">{children}</div>;
  }

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <Header />
        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
