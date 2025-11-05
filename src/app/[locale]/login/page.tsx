
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
import { useAuth, useUser, initiateEmailSignIn } from '@/firebase';
import { useToast } from '@/components/ui/use-toast';
import { FirebaseError } from 'firebase/app';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      router.push('/');
      toast({
        title: "Login Successful / تم تسجيل الدخول بنجاح",
        description: "Welcome back! / !أهلاً بعودتك",
      });
    }
  }, [user, router, toast]);

  const handleSignIn = async () => {
    if (!auth) return;

    try {
      // We are not using non-blocking here to handle errors
      await initiateEmailSignIn(auth, email, password);
      // The useEffect will handle the redirect and success toast
    } catch (e) {
      let description = "An unexpected error occurred. / حدث خطأ غير متوقع.";
      if (e instanceof FirebaseError) {
        switch (e.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            description = "Invalid email or password. / البريد الإلكتروني أو كلمة المرور غير صالحة.";
            break;
          case 'auth/invalid-email':
            description = "Please enter a valid email address. / الرجاء إدخال عنوان بريد إلكتروني صالح.";
            break;
        }
      }
      toast({
        variant: "destructive",
        title: "Login Failed / فشل تسجيل الدخول",
        description: description,
      });
      console.error(e);
    }
  };


  if (isUserLoading) {
      return <div>Loading... / ...جاري التحميل</div>
  }

  // If user is already logged in but the redirect hasn't happened yet
  if (user) {
    return <div>Loading... / ...جاري التحميل</div>
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Login / تسجيل الدخول</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
            <br />
            أدخل بريدك الإلكتروني أدناه لتسجيل الدخول إلى حسابك
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email / البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password / كلمة المرور</Label>
              </div>
              <Input 
                id="password" 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" onClick={handleSignIn}>
              Login / تسجيل الدخول
            </Button>
          </div>
          <div className="mt-4 text-center text-sm">
            Don&apos;t have an account? / ليس لديك حساب؟{' '}
            <Link href="/register" className="underline">
              Sign up / اشتراك
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
