'use client';

export const dynamic = 'force-dynamic';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { doc, setDoc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Check, Gift, User, Phone, LogOut,
  Car, AlertCircle, CheckCircle, Loader2, Star,
} from 'lucide-react';
import type { Customer, CarWashSale } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BilingualMsg {
  en: string;
  ar: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string | null {
  const clean = raw.trim().replace(/\s+/g, '');
  if (clean.startsWith('+')) return clean;
  if (clean.startsWith('05') && clean.length === 10) return '+966' + clean.slice(1);
  if (clean.startsWith('5') && clean.length === 9) return '+966' + clean;
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LoyaltyPage() {
  const searchParams = useSearchParams();
  const firestore = useFirestore();

  const shopId   = searchParams.get('shop');
  const claimCode = searchParams.get('claim'); // Sale document ID (from cashier QR)

  // ── Session State ──────────────────────────────────────────────────────────
  const [savedPhone, setSavedPhone] = React.useState<string | null>(null);
  const [customer,   setCustomer]   = React.useState<Customer | null>(null);
  const [loading,    setLoading]    = React.useState(true);

  // ── Form State ─────────────────────────────────────────────────────────────
  const [phone,       setPhone]       = React.useState('');
  const [name,        setName]        = React.useState('');
  const [submitting,  setSubmitting]  = React.useState(false);
  const [errorMsg,    setErrorMsg]    = React.useState<BilingualMsg | null>(null);

  // ── Claim State ────────────────────────────────────────────────────────────
  const [claimStatus, setClaimStatus] = React.useState<{
    success: boolean;
    msgEn: string;
    msgAr: string;
  } | null>(null);
  const [claiming, setClaiming] = React.useState(false);

  // ── Step: phone already known → try to return claim status ────────────────
  const claimAttempted = React.useRef(false);

  // ── 1. Load saved phone from localStorage ─────────────────────────────────
  React.useEffect(() => {
    if (!shopId) { setLoading(false); return; }
    const stored = localStorage.getItem(`loyalty_phone_${shopId}`);
    if (stored) {
      setSavedPhone(stored);
    } else {
      setLoading(false);
    }
  }, [shopId]);

  // ── 2. Live listener for the customer document ─────────────────────────────
  React.useEffect(() => {
    if (!firestore || !shopId || !savedPhone) return;

    setLoading(true);
    const ref = doc(firestore, 'users', shopId, 'customers', savedPhone);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setCustomer(snap.data() as Customer);
        } else {
          // Document no longer exists — clear local session
          localStorage.removeItem(`loyalty_phone_${shopId}`);
          localStorage.removeItem(`loyalty_name_${shopId}`);
          setSavedPhone(null);
          setCustomer(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Firestore listener error:', err);
        setErrorMsg({
          en: 'Unable to sync your loyalty card. Check your connection.',
          ar: 'تعذر مزامنة بطاقة الولاء. تحقق من الاتصال.',
        });
        setLoading(false);
      }
    );

    return () => unsub();
  }, [firestore, shopId, savedPhone]);

  // ── 3. Auto-claim stamp once customer is loaded ────────────────────────────
  React.useEffect(() => {
    if (savedPhone && customer && claimCode && !claimStatus && !claimAttempted.current) {
      claimAttempted.current = true;
      handleClaimStamp(savedPhone, customer.name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPhone, customer, claimCode]);

  // ── Stamp Claim Logic ──────────────────────────────────────────────────────
  const handleClaimStamp = async (customerPhone: string, customerName: string) => {
    if (!firestore || !shopId || !claimCode) return;
    setClaiming(true);

    try {
      const saleRef = doc(firestore, 'users', shopId, 'sales', claimCode);
      const saleSnap = await getDoc(saleRef);

      if (!saleSnap.exists()) {
        setClaimStatus({
          success: false,
          msgEn: 'Wash receipt not found. Please ask the cashier.',
          msgAr: 'لم يتم العثور على إيصال الغسيل. يرجى مراجعة الصراف.',
        });
        setClaiming(false);
        return;
      }

      const saleData = saleSnap.data() as CarWashSale;

      if (saleData.isLoyaltyClaimed) {
        setClaimStatus({
          success: false,
          msgEn: 'This stamp has already been claimed.',
          msgAr: 'تم الحصول على هذا الطابع بالفعل.',
        });
        setClaiming(false);
        return;
      }

      const custRef = doc(firestore, 'users', shopId, 'customers', customerPhone);
      const custSnap = await getDoc(custRef);

      const currentStamps = custSnap.exists() ? (custSnap.data() as Customer).washCount : 0;
      const totalWashes   = custSnap.exists() ? (custSnap.data() as Customer).totalWashes : 0;

      const isFreeRedemption = saleData.paymentMethod === 'free-loyalty' || saleData.paymentMethod === 'coupon';

      if (isFreeRedemption && currentStamps < 6) {
        setClaimStatus({
          success: false,
          msgEn: `Cannot redeem free wash. You only have ${currentStamps} of 6 stamps completed.`,
          msgAr: `لا يمكن استرداد الغسيل المجاني. لديك فقط ${currentStamps} من أصل ٦ طوابع مكتملة.`,
        });
        setClaiming(false);
        return;
      }

      const newCount = isFreeRedemption ? 0 : (currentStamps >= 6 ? 1 : currentStamps + 1);

      // Update customer document
      await setDoc(custRef, {
        phone: customerPhone,
        name: customerName,
        washCount: newCount,
        totalWashes: totalWashes + 1,
        lastWashDate: new Date().toISOString(),
      }, { merge: true });

      // Mark sale as claimed
      await updateDoc(saleRef, {
        isLoyaltyClaimed: true,
        customerPhone,
        customerName,
      });

      setClaimStatus({
        success: true,
        msgEn: isFreeRedemption
          ? '🎉 Free wash redeemed! Your stamps have been reset. See you next time!'
          : newCount >= 6
          ? `🌟 Stamp ${newCount}/6 added! You\'ve earned your FREE wash — come visit us!`
          : `✅ Stamp ${newCount}/6 added! ${6 - newCount} more wash${6 - newCount !== 1 ? 'es' : ''} to unlock your FREE Full Wash!`,
        msgAr: isFreeRedemption
          ? '🎉 تم استرداد الغسيل المجاني! تمت إعادة تعيين الطوابع. نراك قريباً!'
          : newCount >= 6
          ? `🌟 طابع ${newCount}/6 تم إضافته! لقد ربحت غسيلك المجاني — تفضل بزيارتنا!`
          : `✅ طابع ${newCount}/6 تم إضافته! ${6 - newCount} غسيل إضافي للحصول على الغسيل الكامل المجاني!`,
      });
    } catch (err) {
      console.error('Claim stamp error:', err);
      setClaimStatus({
        success: false,
        msgEn: 'Could not claim stamp. Please try again.',
        msgAr: 'فشل الحصول على الطابع. يرجى المحاولة مجدداً.',
      });
    } finally {
      setClaiming(false);
    }
  };

  // ── Register / Login Handler ───────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !shopId) return;

    setErrorMsg(null);
    const cleanPhone = normalizePhone(phone);
    const cleanName  = name.trim();

    if (!cleanPhone) {
      setErrorMsg({
        en: 'Enter a valid Saudi mobile number, e.g. 0501234567',
        ar: 'أدخل رقم جوال سعودي صحيح، مثل: 0501234567',
      });
      return;
    }
    if (!cleanName) {
      setErrorMsg({ en: 'Please enter your name.', ar: 'يرجى إدخال اسمك.' });
      return;
    }

    setSubmitting(true);
    try {
      const custRef = doc(firestore, 'users', shopId, 'customers', cleanPhone);
      const snap    = await getDoc(custRef);

      if (!snap.exists()) {
        // New customer — create record
        await setDoc(custRef, {
          phone: cleanPhone,
          name: cleanName,
          washCount: 0,
          totalWashes: 0,
          registeredAt: new Date().toISOString(),
        });
      }
      // Save session locally
      localStorage.setItem(`loyalty_phone_${shopId}`, cleanPhone);
      localStorage.setItem(`loyalty_name_${shopId}`,  snap.exists() ? snap.data().name : cleanName);

      // Trigger listener
      setSavedPhone(cleanPhone);

      // If there's a claim code, claim immediately after registering
      if (claimCode) {
        const custName = snap.exists() ? snap.data().name : cleanName;
        claimAttempted.current = true;
        await handleClaimStamp(cleanPhone, custName);
      }
    } catch (err) {
      console.error('Register error:', err);
      setErrorMsg({
        en: 'Something went wrong. Please try again.',
        ar: 'حدث خطأ. يرجى المحاولة مرة أخرى.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    if (shopId) {
      localStorage.removeItem(`loyalty_phone_${shopId}`);
      localStorage.removeItem(`loyalty_name_${shopId}`);
    }
    setSavedPhone(null);
    setCustomer(null);
    setPhone('');
    setName('');
    setErrorMsg(null);
    setClaimStatus(null);
    claimAttempted.current = false;
  };

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-accent animate-spin" />
          <p className="text-slate-400 text-sm">
            Loading your card… / جاري تحميل بطاقتك…
          </p>
        </div>
      </div>
    );
  }

  // ─── No Shop ID ────────────────────────────────────────────────────────────
  if (!shopId) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-slate-900 border-slate-800 shadow-2xl overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-red-500 via-amber-500 to-yellow-500" />
          <CardHeader className="text-center pt-8">
            <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <AlertCircle className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl font-bold flex flex-col gap-1">
              <span>Invalid QR Code</span>
              <span className="text-lg text-slate-400 font-normal">رمز QR غير صالح</span>
            </CardTitle>
            <CardDescription className="text-slate-400 pt-2 text-xs leading-relaxed flex flex-col gap-2">
              <span>Please scan the QR code at the cashier desk to open your loyalty card.</span>
              <span className="border-t border-slate-800 pt-2 text-slate-500">
                يرجى مسح رمز QR في مغسلة السيارات لفتح بطاقتك.
              </span>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ─── Loyalty Stamp Card View ───────────────────────────────────────────────
  if (savedPhone && customer) {
    const STAMPS_NEEDED  = 6;
    const progress       = customer.washCount;
    const isFreeWashReady = progress >= STAMPS_NEEDED;

    return (
      <div className="min-h-screen bg-slate-950 text-white py-8 px-4 flex flex-col items-center font-sans">
        <div className="w-full max-w-md space-y-5">

          {/* Brand Header */}
          <div className="text-center flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center border border-accent/20">
              <Car className="h-6 w-6 text-accent" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-accent to-blue-400 bg-clip-text text-transparent">
              CleanSweep Pro
            </h1>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 flex flex-col gap-0.5">
              <span>Loyalty Rewards Program</span>
              <span>برنامج مكافآت الولاء</span>
            </p>
          </div>

          {/* Claim Status */}
          {claiming && (
            <div className="p-4 rounded-xl border bg-blue-500/10 border-blue-500/20 text-blue-300 flex items-center gap-3 text-xs">
              <Loader2 className="h-5 w-5 animate-spin shrink-0" />
              <span>Claiming your stamp… / جاري إضافة الطابع…</span>
            </div>
          )}
          {claimStatus && (
            <div className={`p-4 rounded-xl border flex gap-3 text-xs ${
              claimStatus.success
                ? 'bg-green-500/10 border-green-500/20 text-green-300'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
            }`}>
              {claimStatus.success
                ? <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                : <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              }
              <div className="space-y-1">
                <p className="font-bold">{claimStatus.success ? 'Success! / تم بنجاح' : 'Notice / تنبيه'}</p>
                <p>{claimStatus.msgEn}</p>
                <p className="opacity-75">{claimStatus.msgAr}</p>
              </div>
            </div>
          )}

          {/* Stamp Card */}
          <Card className="bg-slate-900 border-slate-800 text-white shadow-2xl overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-accent to-blue-500" />

            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base font-bold">{customer.name}</CardTitle>
                  <CardDescription className="text-slate-400 mt-1 flex items-center gap-1.5 text-xs font-mono">
                    <Phone className="h-3.5 w-3.5 text-slate-500" />
                    <span>{customer.phone}</span>
                  </CardDescription>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-red-400 hover:bg-slate-800/50 h-8 w-8"
                  title="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">

              {/* Reward Status Banner */}
              {isFreeWashReady ? (
                <div className="relative p-4 rounded-2xl overflow-hidden border-2 border-green-400/50 text-green-200 flex items-start gap-3 text-xs" style={{background: 'linear-gradient(135deg, rgba(34,197,94,0.25) 0%, rgba(16,185,129,0.15) 50%, rgba(20,184,166,0.10) 100%)', boxShadow: '0 0 30px rgba(34,197,94,0.2), inset 0 0 40px rgba(34,197,94,0.05)'}}>
                  <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.03) 10px, rgba(255,255,255,0.03) 20px)'}} />
                  <div className="w-10 h-10 shrink-0 rounded-full bg-green-500/20 border border-green-400/40 flex items-center justify-center">
                    <Gift className="h-5 w-5 text-green-400" />
                  </div>
                  <div className="space-y-1.5 z-10">
                    <p className="font-extrabold text-sm text-green-200 tracking-tight">🎉 Congratulations! / تهانينا! 🎉</p>
                    <p className="text-green-100 font-semibold leading-snug">You've completed <strong>6 washes!</strong> Come in anytime for your <strong className="text-yellow-300">FREE Full Wash! 🚗✨</strong></p>
                    <p className="text-green-300/90 text-[11px] border-t border-green-500/20 pt-1">أكملت <strong>٦ غسلات!</strong> تفضّل بزيارتنا في أي وقت للحصول على <strong className="text-yellow-200">غسيل كامل مجاني!</strong></p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl text-center text-xs flex flex-col gap-1">
                  <span>
                    Wash <strong className="text-accent">{STAMPS_NEEDED - progress}</strong> more time{STAMPS_NEEDED - progress !== 1 ? 's' : ''} to unlock your{' '}
                    <strong className="text-green-400">FREE Full Wash!</strong>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    اغسل <strong className="text-accent">{STAMPS_NEEDED - progress}</strong> مرة إضافية للحصول على <strong className="text-green-500">غسيل كامل مجاني!</strong>
                  </span>
                </div>
              )}

              {/* Stamp Grid */}
              <div className="grid grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => {
                  const stampNum = i + 1;
                  const isEarned = progress >= stampNum;

                  return (
                    <div
                      key={i}
                      className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center border-2 transition-all duration-500 ${
                        isEarned
                          ? 'bg-accent/10 border-accent text-accent shadow-[0_0_20px_rgba(56,189,248,0.2)]'
                          : 'bg-slate-950 border-slate-800 text-slate-700'
                      }`}
                    >
                      <span className="absolute top-1.5 left-2 text-[9px] font-bold opacity-50">{stampNum}</span>

                      {isEarned ? (
                        <Check className="h-8 w-8 stroke-[3]" />
                      ) : (
                        <Star className="h-7 w-7 opacity-20" />
                      )}

                      <span className="text-[9px] font-bold mt-1 uppercase tracking-wide flex flex-col items-center leading-none">
                        <span>Wash</span>
                        <span className="text-[8px] font-normal opacity-70">غسيل</span>
                      </span>
                    </div>
                  );
                })}

                {/* 7th Slot: FREE WASH COUPON card */}
                <div
                  className={`relative col-start-2 aspect-square rounded-2xl flex flex-col items-center justify-center border-2 transition-all duration-700 overflow-hidden ${
                    isFreeWashReady
                      ? 'border-yellow-400 text-yellow-300 shadow-[0_0_25px_rgba(250,204,21,0.3)]'
                      : 'border-dashed border-slate-700 text-slate-600'
                  }`}
                  style={isFreeWashReady ? {background: 'linear-gradient(135deg, rgba(250,204,21,0.15), rgba(34,197,94,0.15))'} : {background: 'transparent'}}
                >
                  {isFreeWashReady && (
                    <div className="absolute inset-0 opacity-20" style={{backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(250,204,21,0.4), transparent 70%)'}} />
                  )}
                  <span className="absolute top-1.5 left-2 text-[9px] font-bold opacity-50">7</span>
                  <Gift className={`h-7 w-7 z-10 ${ isFreeWashReady ? 'text-yellow-300' : 'opacity-25' }`} />
                  <span className="text-[8px] font-bold mt-1 z-10 uppercase tracking-wide flex flex-col items-center leading-none text-center px-1">
                    <span className={isFreeWashReady ? 'text-yellow-200' : 'opacity-40'}>
                      {isFreeWashReady ? 'Claim!' : 'Free!'}
                    </span>
                    <span className={`text-[7px] font-normal leading-tight ${ isFreeWashReady ? 'text-yellow-300/80' : 'opacity-30' }`}>
                      {isFreeWashReady ? 'مجاناً الآن' : 'مجاني كامل'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Stats Footer */}
              <div className="flex justify-between items-center text-[10px] text-slate-500 pt-2 border-t border-slate-800/80">
                <span className="flex flex-col">
                  <span>Total washes: <strong className="text-slate-300">{customer.totalWashes ?? 0}</strong></span>
                  <span>إجمالي الغسيل: {customer.totalWashes ?? 0}</span>
                </span>
                {customer.lastWashDate && (
                  <span className="flex flex-col text-right">
                    <span>Last visit: <strong className="text-slate-300">{new Date(customer.lastWashDate).toLocaleDateString()}</strong></span>
                    <span>آخر زيارة: {new Date(customer.lastWashDate).toLocaleDateString('ar-SA')}</span>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* How It Works */}
          <Card className="bg-slate-900 border-slate-800 text-white shadow-xl text-center text-xs p-4 space-y-2">
            <p className="font-semibold text-slate-300">How to earn stamps / طريقة كسب الطوابع</p>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              After every paid wash, the cashier will show a QR receipt. Scan it to earn your stamp!
            </p>
            <p className="text-slate-500 text-[10px] leading-relaxed border-t border-slate-800 pt-2">
              بعد كل غسيل مدفوع، سيعرض الصراف رمز QR. امسحه بجوالك للحصول على الطابع!
            </p>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Registration Form ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-white py-12 px-6 flex flex-col items-center justify-center font-sans">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center flex flex-col items-center gap-2">
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center border border-accent/20 shadow-[0_0_30px_rgba(56,189,248,0.15)]">
            <Car className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-accent via-blue-400 to-indigo-400 bg-clip-text text-transparent">
            CleanSweep Pro
          </h1>
          <p className="text-slate-400 text-sm font-medium">برنامج الولاء الرقمي</p>
          <p className="text-slate-500 text-xs flex flex-col gap-0.5">
            <span>Wash 6 times → Get your 7th wash FREE (Full Wash only)</span>
            <span>اغسل ٦ مرات ← واحصل على الغسيل السابع مجاناً (غسيل كامل فقط)</span>
          </p>
        </div>

        {/* Form Card */}
        <Card className="bg-slate-900 border-slate-800 text-white shadow-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-accent to-blue-500" />
          <CardHeader>
            <CardTitle className="text-lg font-bold flex justify-between items-baseline">
              <span>Join / سجّل بطاقتك</span>
              <span className="text-sm text-slate-400 font-medium">تسجيل البطاقة</span>
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs flex flex-col gap-1">
              <span>Enter your mobile number and name to register or access your stamp card.</span>
              <span className="text-slate-500">أدخل رقم جوالك واسمك للتسجيل أو الوصول إلى بطاقتك.</span>
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">

              {errorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 text-xs rounded-lg flex flex-col gap-0.5">
                  <span>⚠️ {errorMsg.en}</span>
                  <span className="opacity-80">{errorMsg.ar}</span>
                </div>
              )}

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs uppercase tracking-wider text-slate-400 flex justify-between">
                  <span>Mobile Number / رقم الجوال</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="e.g. 0501234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={submitting}
                    className="bg-slate-950 border-slate-800 pl-10 text-white focus-visible:ring-accent font-mono text-sm"
                    required
                  />
                </div>
                <span className="text-[10px] text-slate-600">
                  Saudi format: 05XXXXXXXX / الصيغة السعودية: 05XXXXXXXX
                </span>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs uppercase tracking-wider text-slate-400 flex justify-between">
                  <span>Full Name / الاسم الكامل</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="e.g. Sulaiman"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={submitting}
                    className="bg-slate-950 border-slate-800 pl-10 text-white focus-visible:ring-accent text-sm"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-accent hover:bg-accent/90 text-white mt-2 font-semibold h-11 flex items-center justify-center gap-2"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving… / جاري الحفظ…</>
                  : <><Star className="h-4 w-4" /> Open My Card / افتح بطاقتي</>
                }
              </Button>

              <p className="text-center text-[10px] text-slate-600 leading-relaxed pt-1">
                Already registered? Enter the same number to view your card.<br />
                <span className="text-slate-700">مسجل مسبقاً؟ أدخل نفس الرقم لعرض بطاقتك.</span>
              </p>
            </form>
          </CardContent>
        </Card>

        {/* Steps */}
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500">
          {[
            { step: '1', en: 'Register', ar: 'سجّل', sub: 'Enter name & phone', subAr: 'أدخل اسمك ورقمك' },
            { step: '2', en: 'Wash 6×', ar: 'اغسل ٦ مرات', sub: 'Earn 6 stamps', subAr: 'اجمع ٦ طوابع' },
            { step: '3', en: 'FREE!', ar: 'مجاناً!', sub: '7th wash FREE (Full Wash)', subAr: 'السابع مجاناً (غسيل كامل)' },
          ].map(({ step, en, ar, sub, subAr }) => (
            <div key={step} className="bg-slate-900/50 rounded-xl p-2 border border-slate-800/60 space-y-1">
              <div className="w-6 h-6 bg-accent/10 rounded-full flex items-center justify-center text-accent font-bold text-xs mx-auto">{step}</div>
              <div className="font-bold text-slate-300">{en} / {ar}</div>
              <span className="block">{sub}</span>
              <span className="block opacity-60">{subAr}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
