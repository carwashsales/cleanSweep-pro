import LayoutWrapper from "@/components/layout-wrapper";
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
            <LayoutWrapper>
                {children}
            </LayoutWrapper>
        </NextIntlClientProvider>
    );
}
