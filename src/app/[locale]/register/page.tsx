
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
import { useAuth, useUser, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { seedDefaultServices } from '@/lib/services';
import { useToast } from '@/components/ui/use-toast';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleSignUp = async () => {
    if (!auth || !firestore) {
        toast({
            variant: "destructive",
            title: "Error / خطأ",
            description: "Firebase services are not available. Please try again later. / خدمات Firebase غير متاحة. يرجى المحاولة مرة أخرى في وقت لاحق.",
        });
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = userCredential.user;
        await seedDefaultServices(firestore, newUser.uid);
        toast({
            title: "Account Created / تم إنشاء الحساب",
            description: "Your account has been created and default services have been set up. / تم إنشاء حسابك وإعداد الخدمات الافتراضية.",
        });
        // The onAuthStateChanged listener will handle the redirect
    } catch (error: any) {
        console.error("Error signing up:", error);
        let description = "An unexpected error occurred. / حدث خطأ غير متوقع.";
        if (error.code === 'auth/email-already-in-use') {
            description = "This email is already in use. Please try logging in. / هذا البريد الإلكتروني مستخدم بالفعل. يرجى محاولة تسجيل الدخول.";
        } else if (error.code === 'auth/weak-password') {
            description = "Password should be at least 6 characters. / يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.";
        }
        toast({
            variant: "destructive",
            title: "Sign-up failed / فشل الاشتراك",
            description: description,
        });
    }
  };
  
  if (isUserLoading || user) {
    return <div>Loading... / ...جاري التحميل</div>
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Sign Up / اشتراك</CardTitle>
          <CardDescription>
            Enter your information to create an account
            <br />
            أدخل معلوماتك لإنشاء حساب
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
              <Label htmlFor="password">Password / كلمة المرور</Label>
              <Input 
                id="password" 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" onClick={handleSignUp}>
              Create an account / إنشاء حساب
            </Button>
          </div>
          <div className="mt-4 text-center text-sm">
            Already have an account? / لديك حساب بالفعل؟{' '}
            <Link href="/login" className="underline">
              Sign in / تسجيل الدخول
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
