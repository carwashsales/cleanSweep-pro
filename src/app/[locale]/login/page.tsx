'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth, useUser } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Car, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!auth) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    setShake(false);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setSuccessMsg('Login Successful! Redirecting… / تم تسجيل الدخول بنجاح! جاري التوجيه…');
    } catch (error: any) {
      console.error(error);
      let description = 'An unexpected error occurred. / حدث خطأ غير متوقع.';
      
      if (error && error.code) {
        switch (error.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            description = 'Invalid email or password. Please check your credentials and try again. / البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق والمحاولة مجدداً.';
            break;
          case 'auth/invalid-email':
            description = 'Please enter a valid email address. / الرجاء إدخال عنوان بريد إلكتروني صالح.';
            break;
          case 'auth/too-many-requests':
            description = 'Too many failed attempts. Account temporarily locked. Try again later. / محاولات فاشلة كثيرة. الحساب مقفل مؤقتاً. حاول لاحقاً.';
            break;
          case 'auth/network-request-failed':
            description = 'Network error. Check your internet connection. / خطأ في الشبكة. تحقق من اتصالك.';
            break;
        }
      }
      
      setErrorMsg(description);
      setShake(true);
      setTimeout(() => setShake(false), 600);
      toast({
        variant: 'destructive',
        title: 'Login Failed / فشل تسجيل الدخول',
        description: description,
      });
    } finally {
      setLoading(false);
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground">Loading… / جاري التحميل…</p>
        </div>
      </div>
    );
  }

  // If user is already logged in but the redirect hasn't happened yet
  if (user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground">Redirecting… / جاري التوجيه…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950 p-4" style={{background: 'radial-gradient(ellipse at 50% 0%, rgba(56,189,248,0.07) 0%, #020617 60%)'}}>
      
      {/* Shake Animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-4px); }
          90% { transform: translateX(4px); }
        }
        .shake-anim { animation: shake 0.6s ease-in-out; }
      `}</style>

      <div className={`w-full max-w-sm ${shake ? 'shake-anim' : ''}`}>
        {/* Brand header above card */}
        <div className="text-center mb-6 flex flex-col items-center gap-2">
          <div className="w-14 h-14 bg-primary/10 rounded-full border border-primary/20 flex items-center justify-center shadow-[0_0_30px_rgba(56,189,248,0.15)]">
            <Car className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-blue-400 to-indigo-400 bg-clip-text text-transparent">
            CleanSweep Pro
          </h1>
          <p className="text-[11px] text-slate-500 uppercase tracking-widest">Staff Dashboard Login</p>
        </div>

        <Card className="mx-auto w-full bg-slate-900/80 backdrop-blur border-slate-800 text-white shadow-2xl overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-primary via-blue-400 to-indigo-500" />
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold flex flex-col gap-0.5">
              <span>Sign In / تسجيل الدخول</span>
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs leading-relaxed">
              Enter your email and password to access the dashboard.
              <br />
              <span className="text-slate-500">أدخل بريدك وكلمة المرور للوصول إلى لوحة التحكم.</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="grid gap-4">
              {errorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 text-green-300 text-xs rounded-xl flex items-center gap-2.5 leading-relaxed">
                  <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="email" className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Email / البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  disabled={loading}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrorMsg(null); }}
                  className={`bg-slate-950 border text-white focus-visible:ring-primary text-sm transition-colors ${
                    errorMsg ? 'border-red-500/60 focus-visible:ring-red-500' : 'border-slate-800'
                  }`}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password" className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Password / كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  disabled={loading}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(null); }}
                  className={`bg-slate-950 border text-white focus-visible:ring-primary text-sm transition-colors ${
                    errorMsg ? 'border-red-500/60 focus-visible:ring-red-500' : 'border-slate-800'
                  }`}
                />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white font-semibold flex items-center justify-center gap-2 h-11 mt-1 transition-all" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Signing in… / جاري تسجيل الدخول…</span>
                  </>
                ) : (
                  <span>Sign In / تسجيل الدخول</span>
                )}
              </Button>
            </form>
            <div className="mt-5 text-center text-sm text-slate-500 border-t border-slate-800/60 pt-4">
              Don&apos;t have an account? / ليس لديك حساب؟{' '}
              <Link href="/register" className="underline text-primary hover:text-primary/80 font-medium">
                Sign up / اشتراك
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
