import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import SidebarNav from "@/components/sidebar-nav";
import Header from "@/components/header";
import * as React from "react";
import { getMessages } from 'next-intl/server';
import { NextIntlClientProvider } from "next-intl";

export default async function AppLayout({ 
    children,
    params
 }: { 
    children: React.ReactNode,
    params: Promise<{ locale: string }>
}) {
    const { locale } = await params;
    let messages;
    try {
        messages = (await import(`../../../messages/${locale}.json`)).default;
    } catch (e) {
        messages = {};
    }
    
    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            <SidebarProvider>
                <SidebarNav />
                <SidebarInset>
                    <Header />
                    <main className="p-4 sm:p-6 lg:p-8">
                        {children}
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </NextIntlClientProvider>
    );
}
