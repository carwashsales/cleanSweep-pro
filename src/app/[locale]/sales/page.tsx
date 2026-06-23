'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MoreHorizontal,
  Settings,
  Trash,
  RotateCcw,
  Check,
  QrCode,
  Printer,
  ShoppingBag,
  Sparkles,
  Play,
  CheckCircle,
  AlertCircle,
  Truck,
  Globe,
  Car
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, useUser, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, orderBy, writeBatch } from 'firebase/firestore';
import type { CarWashSale, Staff, Price as ServicePrice } from '@/types';
import { format, startOfDay, endOfDay } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { CurrencySymbol } from '@/components/currency-symbol';
import { useFormatter } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Cart Item Type
type CartItem = {
  id: string; // unique cart item instance ID
  serviceId: string;
  serviceName: string;
  carSize: string;
  staffId: string;
  staffName: string;
  price: number;
  commission: number;
  hasCoupon: boolean;
  isFreeWash: boolean; // if redeemed using stamps
};

type PaymentType = 'coupon' | 'cash' | 'machine' | 'not-paid' | 'free-loyalty';

export default function SalesPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  const formatNumber = useFormatter().number;

  // POS State
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = React.useState<PaymentType>('cash');
  const [redeemFreeWash, setRedeemFreeWash] = React.useState(false);

  // Dialog / Modal States
  const [serviceSelectOpen, setServiceSelectOpen] = React.useState(false);
  const [selectedService, setSelectedService] = React.useState<ServicePrice | null>(null);
  const [selectedSize, setSelectedSize] = React.useState('');
  const [selectedStaffId, setSelectedStaffId] = React.useState('');

  // QR Code Kiosk Overlay Dialog (For customer registration QR)
  const [qrOpen, setQrOpen] = React.useState(false);
  const [qrUrl, setQrUrl] = React.useState('');

  // Receipt Dialog
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const [receiptData, setReceiptData] = React.useState<{
    invoiceNo: string;
    date: string;
    items: CartItem[];
    paymentMethod: PaymentType;
    subtotal: number;
    vat: number;
    total: number;
    claimCode: string; // Document ID of the first sale item
  } | null>(null);

  // Form State Errors
  const [errors, setErrors] = React.useState<{ [key: string]: boolean }>({});

  // Today's date range
  const today = React.useMemo(() => {
    const now = new Date();
    return { start: startOfDay(now), end: endOfDay(now) };
  }, []);

  // Firestore collections
  const salesQuery = useMemoFirebase(
    () =>
      firestore && user
        ? query(
            collection(firestore, 'users', user.uid, 'sales'),
            where('date', '>=', today.start.toISOString()),
            where('date', '<', today.end.toISOString()),
            orderBy('date', 'desc')
          )
        : null,
    [firestore, user, today]
  );

  const staffCollection = useMemoFirebase(
    () => (firestore && user ? collection(firestore, 'users', user.uid, 'staff') : null),
    [firestore, user]
  );

  const servicesQuery = useMemoFirebase(
    () =>
      firestore && user ? query(collection(firestore, 'users', user.uid, 'services'), orderBy('order')) : null,
    [firestore, user]
  );

  const { data: sales, isLoading: salesLoading } = useCollection<CarWashSale>(salesQuery);
  const { data: staff, isLoading: staffLoading } = useCollection<Staff>(staffCollection);
  const { data: services, isLoading: servicesLoading } = useCollection<ServicePrice>(servicesQuery);

  const noStaff = !staff || staff.length === 0;

  // Initialize QR Url
  React.useEffect(() => {
    if (typeof window !== 'undefined' && user) {
      setQrUrl(`${window.location.origin}/loyalty?shop=${user.uid}`);
    }
  }, [user]);

  // Prompt service modal when clicking catalog service
  const handleCatalogServiceClick = (srv: ServicePrice) => {
    setSelectedService(srv);
    setSelectedSize(srv.needsSize ? '' : 'default');
    setSelectedStaffId('');
    setServiceSelectOpen(true);
  };

  // Add Item to Cart
  const handleAddToCart = () => {
    if (!selectedService) return;

    // Validate size and staff selection
    const newErrors: { [key: string]: boolean } = {};
    if (selectedService.needsSize && !selectedSize) newErrors.size = true;
    if (!selectedStaffId) newErrors.staff = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const sizeKey = selectedService.needsSize ? selectedSize : 'default';
    const priceObj = selectedService.prices[sizeKey];
    const chosenStaff = staff?.find((s) => s.id === selectedStaffId);

    if (!priceObj || !chosenStaff) return;

    const cartItem: CartItem = {
      id: `${selectedService.id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      carSize: selectedService.needsSize ? selectedSize : '',
      staffId: chosenStaff.id,
      staffName: chosenStaff.name,
      price: priceObj.price,
      commission: priceObj.commission,
      hasCoupon: selectedService.hasCoupon,
      isFreeWash: false
    };

    setCart((prev) => [...prev, cartItem]);
    setServiceSelectOpen(false);
    setSelectedService(null);
    setErrors({});
  };

  // Remove Item from Cart
  const handleRemoveFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId));
  };

  // Cart Calculations
  const calculatedItems = React.useMemo(() => {
    if (cart.length === 0) return { items: [], subtotal: 0, commission: 0 };

    let currentCart = cart.map(item => ({ ...item, price: item.price, isFreeWash: false }));

    // Apply loyalty free wash discount if toggled manually (only valid for Full Wash)
    if (redeemFreeWash) {
      // Find the first "Full Wash" service item in the cart to apply the discount
      const fullWashIndex = currentCart.findIndex(item => item.serviceName === 'Full Wash');

      if (fullWashIndex !== -1) {
        currentCart[fullWashIndex].price = 0;
        currentCart[fullWashIndex].isFreeWash = true;
      }
    }

    const subtotal = currentCart.reduce((sum, item) => sum + item.price, 0);
    const commission = currentCart.reduce((sum, item) => sum + item.commission, 0);

    return {
      items: currentCart,
      subtotal,
      commission
    };
  }, [cart, redeemFreeWash]);

  const totalAmount = calculatedItems.subtotal;
  const vatAmount = totalAmount - (totalAmount / 1.15); // 15% VAT included
  const totalCommission = calculatedItems.commission;

  // Active Wash Queue Grouping
  const activeQueue = React.useMemo(() => {
    if (!sales) return [];

    // Group sales by transactionId
    const groups: { [txId: string]: CarWashSale[] } = {};
    sales.forEach((sale) => {
      if (sale.transactionId && sale.status && sale.status !== 'delivered') {
        if (!groups[sale.transactionId]) {
          groups[sale.transactionId] = [];
        }
        groups[sale.transactionId].push(sale);
      }
    });

    return Object.entries(groups).map(([txId, items]) => {
      const firstItem = items[0];
      return {
        transactionId: txId,
        invoiceNo: firstItem.invoiceNo || 'N/A',
        status: firstItem.status || 'pending',
        date: firstItem.date,
        paymentMethod: firstItem.paymentMethod || 'cash',
        amount: items.reduce((sum, s) => sum + s.amount, 0),
        services: items.map(s => `${s.service}${s.carSize ? ` (${s.carSize.toUpperCase()})` : ''}`),
        staffList: Array.from(new Set(items.map(s => s.staffName))),
        isLoyaltyClaimed: items.some(s => s.isLoyaltyClaimed),
        customerPhone: items.find(s => s.customerPhone)?.customerPhone || null,
        customerName: items.find(s => s.customerName)?.customerName || null,
        rawSales: items
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales]);

  // Update Status of a Queue Transaction
  const handleUpdateQueueStatus = async (txId: string, salesItems: CarWashSale[], nextStatus: CarWashSale['status']) => {
    if (!firestore || !user || !nextStatus) return;

    try {
      const batch = writeBatch(firestore);
      salesItems.forEach((sale) => {
        const saleRef = doc(firestore, 'users', user.uid, 'sales', sale.id);
        batch.update(saleRef, { status: nextStatus });
      });
      await batch.commit();
      toast({
        title: 'Status Updated / تم تحديث الحالة',
        description: `Order marked as ${nextStatus} / تم وضع حالة الطلب إلى ${nextStatus}.`,
      });
    } catch (e) {
      console.error('Error updating queue status:', e);
      toast({
        variant: 'destructive',
        title: 'Update Failed / فشل التحديث',
        description: 'Try again / يرجى المحاولة مرة أخرى.',
      });
    }
  };

  // Complete Checkout Order
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cart.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Cart is empty / السلة فارغة',
        description: 'Please add at least one service / يرجى إضافة خدمة واحدة على الأقل.',
      });
      return;
    }

    if (!firestore || !user) return;

    // Generate Invoice Number and Transaction ID
    const txId = `tx_${Date.now()}`;
    const invoiceNo = `CS-${Date.now().toString().slice(-6)}`;
    const checkoutDate = new Date().toISOString();

    const batch = writeBatch(firestore);
    const salesCollection = collection(firestore, 'users', user.uid, 'sales');

    // Create sales doc references beforehand so we can capture document IDs
    const docRefs = calculatedItems.items.map(() => doc(salesCollection));
    const firstDocId = docRefs[0].id; // Used as the claim Code for QR stamp claiming

    // Save each cart item as a separate sales document
    calculatedItems.items.forEach((item, index) => {
      const newSaleRef = docRefs[index];
      
      const saleDoc: Omit<CarWashSale, 'id'> = {
        service: item.serviceName,
        staffName: item.staffName,
        ...(item.carSize && { carSize: item.carSize }),
        date: checkoutDate,
        amount: item.price,
        commission: item.commission,
        hasCoupon: item.hasCoupon || paymentType === 'coupon',
        paymentMethod: item.isFreeWash ? 'free-loyalty' : paymentType,
        waxAddOn: item.serviceId === 'wax-add-on',
        isPaid: paymentType !== 'not-paid',
        
        transactionId: txId,
        invoiceNo,
        status: 'pending',
        isLoyaltyClaimed: false // unclaimed initially
      };

      batch.set(newSaleRef, saleDoc);
    });

    try {
      await batch.commit();

      // Set Receipt data and show print dialog
      setReceiptData({
        invoiceNo,
        date: checkoutDate,
        items: calculatedItems.items,
        paymentMethod: paymentType,
        subtotal: calculatedItems.subtotal,
        vat: vatAmount,
        total: calculatedItems.subtotal,
        claimCode: firstDocId
      });

      setReceiptOpen(true);

      // Reset form states
      setCart([]);
      setRedeemFreeWash(false);
      setPaymentType('cash');

      toast({
        title: 'Checkout Completed / تم الدفع',
        description: `Invoice ${invoiceNo} generated / تم إنشاء فاتورة برقم ${invoiceNo}.`,
      });
    } catch (e) {
      console.error('Checkout error:', e);
      toast({
        variant: 'destructive',
        title: 'Checkout Failed / فشل الدفع',
        description: 'Failed to record / فشل تسجيل المعاملة. يرجى المحاولة لاحقاً.',
      });
    }
  };

  // Reprint Receipt from Queue Item
  const handleReprintReceipt = (queueItem: typeof activeQueue[0]) => {
    // Map Firestore sale models back to CartItems for receipt layout
    const itemsMapped: CartItem[] = queueItem.rawSales.map((s) => ({
      id: s.id,
      serviceId: '',
      serviceName: s.service,
      carSize: s.carSize || '',
      staffId: '',
      staffName: s.staffName,
      price: s.amount,
      commission: s.commission,
      hasCoupon: s.hasCoupon,
      isFreeWash: s.paymentMethod === 'free-loyalty'
    }));

    const subtotal = queueItem.amount;
    const vat = subtotal - (subtotal / 1.15);

    setReceiptData({
      invoiceNo: queueItem.invoiceNo,
      date: queueItem.date,
      items: itemsMapped,
      paymentMethod: queueItem.paymentMethod,
      subtotal,
      vat,
      total: subtotal,
      claimCode: queueItem.rawSales[0]?.id || ''
    });
    setReceiptOpen(true);
  };

  // Delete sale completely (for errors/refunds)
  const handleDeleteSale = (saleId: string, serviceName: string) => {
    if (!firestore || !user) return;
    const saleRef = doc(firestore, 'users', user.uid, 'sales', saleId);
    deleteDocumentNonBlocking(saleRef);
    toast({
      variant: 'destructive',
      title: 'Sale Deleted / تم الحذف',
      description: `Removed "${serviceName}" / تم مسح الخدمة "${serviceName}".`,
    });
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user || servicesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 relative font-sans">
      
      {/* Dynamic Thermal Receipt Printer CSS Inject */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-receipt-modal, #print-receipt-modal * {
            visibility: visible;
          }
          #print-receipt-modal {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            padding: 4mm;
            background: white !important;
            color: black !important;
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            box-shadow: none;
            border: none;
            margin: 0;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* POS Top Actions & Summary Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print border-b border-border/40 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-accent to-blue-400 bg-clip-text text-transparent flex items-center gap-2">
            <Globe className="h-6 w-6 text-accent animate-pulse" />
            <span>POS Sales Terminal / محطة مبيعات نقاط البيع</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Commercial retail POS for CleanSweep Pro washes / نقاط البيع التجارية لمغسلة السيارات</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            onClick={() => setQrOpen(true)}
            variant="outline"
            className="flex-1 md:flex-none border-dashed border-accent text-accent hover:bg-accent/5 gap-1.5 text-xs font-semibold h-9"
          >
            <QrCode className="h-4 w-4" />
            <span>Customer Loyalty QR / رمز ولاء العملاء</span>
          </Button>
        </div>
      </div>

      {/* Main POS Interface Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start no-print">
        
        {/* Left Side: Services Catalog (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex justify-between">
                <span>Washes & Services Menu</span>
                <span className="text-slate-400 font-medium">قائمة خدمات الغسيل</span>
              </CardTitle>
              <CardDescription className="text-xs flex flex-col">
                <span>Select a service below to configure size and washer staff assignment</span>
                <span className="text-slate-500">حدد الخدمة لتكوين الحجم وتعيين الموظف المسؤول</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {noStaff && (
                <Alert variant="destructive" className="mb-4 text-xs">
                  <Settings className="h-4 w-4 animate-spin shrink-0" />
                  <AlertDescription className="space-y-1">
                    <p>Before you can record sales, please add employee staff on the **Staff Page** to assign commissions.</p>
                    <p className="opacity-80">قبل تسجيل المبيعات، يرجى إضافة موظفين في صفحة **الموظفين** لتخصيص العمولات.</p>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {services
                  ?.filter((s) => s.id !== 'wax-add-on')
                  .sort((a, b) => a.order - b.order)
                  .map((srv) => {
                    const defaultPrice = srv.prices['default']?.price || 0;
                    const startingPriceLabel = srv.needsSize
                      ? `From ${formatNumber(Math.min(...Object.values(srv.prices).map(p => p.price)))}`
                      : `${formatNumber(defaultPrice)}`;

                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => handleCatalogServiceClick(srv)}
                        disabled={noStaff}
                        className={cn(
                          'p-4 rounded-xl border-2 hover:border-accent hover:bg-accent/5 text-left transition-all flex flex-col justify-between h-28 cursor-pointer relative overflow-hidden group',
                          noStaff && 'opacity-50 cursor-not-allowed hover:bg-transparent hover:border-border'
                        )}
                      >
                        <Car className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-slate-800/10 dark:text-slate-200/5 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300" />
                        
                        <div className="font-bold text-xs line-clamp-2 leading-tight pr-2 z-10">
                          {srv.name}
                        </div>
                        <div className="flex justify-between items-baseline mt-2 z-10 w-full">
                          <span className="text-[10px] text-muted-foreground font-semibold">Price / السعر</span>
                          <span className="font-mono text-xs font-extrabold text-accent">
                            {startingPriceLabel} <CurrencySymbol />
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Order Cart & Checkout (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <form onSubmit={handleCheckout}>
            <Card className="border-border shadow-xl">
              <CardHeader className="bg-muted/40 pb-4 border-b">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base font-bold flex items-center gap-1.5">
                    <ShoppingBag className="h-5 w-5 text-accent" />
                    <span>Checkout Cart / سلة البيع</span>
                  </CardTitle>
                  <Badge variant="outline" className="font-mono bg-background text-[10px]">
                    {cart.length} item{cart.length !== 1 ? 's' : ''} / {cart.length} عنصر
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                
                {/* 1. Cart Items Listing */}
                {cart.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground flex flex-col items-center justify-center border border-dashed border-border rounded-xl">
                    <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mb-2" />
                    <p className="text-xs font-bold">Checkout cart is empty</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Choose services from the catalog menu</p>
                    <p className="text-[10px] text-slate-600 mt-1.5 border-t border-border/40 pt-1.5 w-3/4">السلة فارغة. يرجى اختيار خدمات من القائمة.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {calculatedItems.items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-muted/50 dark:bg-muted/30 rounded-xl border flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold flex items-center gap-1.5 text-sm">
                            {item.serviceName}
                            {item.isFreeWash && (
                              <Badge variant="default" className="bg-green-500 text-white hover:bg-green-600 text-[10px] px-1 py-0 h-4">
                                FREE / مجاني
                              </Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
                            {item.carSize && <span className="capitalize">Size / الحجم: {item.carSize}</span>}
                            <span>Washer / العامل: {item.staffName}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-sm">
                            {item.price === 0 ? 'Free' : `${formatNumber(item.price)}`}{' '}
                            {item.price > 0 && <CurrencySymbol />}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => handleRemoveFromCart(item.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. Loyalty Manual Redemption Section */}
                {cart.length > 0 && (
                  <div className="p-4 bg-accent/5 dark:bg-accent/10 rounded-xl border border-accent/10 space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="redeem-reward"
                        checked={redeemFreeWash}
                        onCheckedChange={(val) => setRedeemFreeWash(!!val)}
                      />
                      <Label
                        htmlFor="redeem-reward"
                        className="text-xs font-bold cursor-pointer flex-1 flex flex-col gap-0.5"
                      >
                        <span>Redeem Loyalty Free Wash (7th Wash)</span>
                        <span className="text-slate-500 text-[10px] font-normal">استرداد غسيل مجاني للولاء (الغسيل السابع)</span>
                      </Label>
                    </div>
                    {redeemFreeWash && (
                      cart.some(item => item.serviceName === 'Full Wash') ? (
                        <p className="text-[10px] text-green-500/90 leading-tight">
                          ✨ Free Full Wash discount applied! The "Full Wash" service has been set to 0. The customer scans their QR code to claim the free wash.
                        </p>
                      ) : (
                        <p className="text-[10px] text-red-500/90 font-bold leading-tight animate-pulse">
                          ⚠️ No "Full Wash" found in cart! The free wash reward can ONLY be applied to a "Full Wash" service. Please add it to the cart.
                        </p>
                      )
                    )}
                  </div>
                )}

                {/* 3. Payment Method Section */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold flex justify-between">
                    <span>Payment Method</span>
                    <span>طريقة الدفع</span>
                  </Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'cash', labelEn: 'Cash', labelAr: 'نقدي', color: 'border-green-500 bg-green-500/10 text-green-400 hover:bg-green-500/15' },
                      { id: 'machine', labelEn: 'Card', labelAr: 'بطاقة', color: 'border-blue-500 bg-blue-500/10 text-blue-400 hover:bg-blue-500/15' },
                      { id: 'coupon', labelEn: 'Coupon', labelAr: 'كوبون', color: 'border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15' },
                      { id: 'not-paid', labelEn: 'Not Paid', labelAr: 'مؤجل', color: 'border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/15' }
                    ].map((btn) => (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => setPaymentType(btn.id as PaymentType)}
                        disabled={noStaff}
                        className={cn(
                          'p-2 rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-all leading-tight h-12',
                          paymentType === btn.id
                            ? btn.color + ' border-2 shadow-lg scale-[1.03]'
                            : 'border-border bg-background hover:bg-muted'
                        )}
                      >
                        <span className="text-[10px] font-bold">{btn.labelEn}</span>
                        <span className="text-[9px] opacity-75">{btn.labelAr}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Checkout Calculations breakdown */}
                <div className="p-4 bg-muted/60 dark:bg-muted/30 rounded-xl space-y-2.5 border">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="flex flex-col">
                      <span>Subtotal (VAT Incl)</span>
                      <span>المجموع الفرعي (شامل الضريبة)</span>
                    </span>
                    <span className="font-mono text-sm">
                      {formatNumber(calculatedItems.subtotal, { minimumFractionDigits: 2 })}{' '}
                      <CurrencySymbol />
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="flex flex-col">
                      <span>VAT (15% Included)</span>
                      <span>الضريبة (15% شاملة)</span>
                    </span>
                    <span className="font-mono text-sm">
                      {formatNumber(vatAmount, { minimumFractionDigits: 2 })}{' '}
                      <CurrencySymbol />
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pb-2 border-b border-border/60">
                    <span className="flex flex-col">
                      <span>Employee Commission</span>
                      <span>عمولة الموظف</span>
                    </span>
                    <span className="font-mono text-sm">
                      {formatNumber(totalCommission, { minimumFractionDigits: 2 })}{' '}
                      <CurrencySymbol />
                    </span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 items-center">
                    <span className="flex flex-col text-sm">
                      <span>Total Amount</span>
                      <span>المبلغ الإجمالي</span>
                    </span>
                    <span className="font-mono text-accent text-lg">
                      {formatNumber(totalAmount, { minimumFractionDigits: 2 })}{' '}
                      <CurrencySymbol />
                    </span>
                  </div>
                </div>

                {/* 5. Action buttons */}
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCart([]);
                      setRedeemFreeWash(false);
                      setPaymentType('cash');
                    }}
                    disabled={noStaff || cart.length === 0}
                    className="flex-1 border-border text-xs flex flex-col items-center py-2 h-10 leading-none gap-0.5"
                  >
                    <span>Clear Cart</span>
                    <span className="text-[9px] font-normal opacity-75">مسح السلة</span>
                  </Button>
                  <Button
                    type="submit"
                    disabled={noStaff || cart.length === 0}
                    className="flex-1 bg-accent hover:bg-accent/90 text-white font-bold text-xs flex flex-col items-center py-2 h-10 leading-none gap-0.5"
                  >
                    <span className="flex items-center gap-1">
                      <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                      <span>Complete Checkout</span>
                    </span>
                    <span className="text-[9px] font-normal opacity-85">إتمام عملية الدفع</span>
                  </Button>
                </div>

              </CardContent>
            </Card>
          </form>
        </div>

      </div>

      {/* Today's Active Wash Queue Section */}
      <div className="space-y-4 no-print border-t border-border/40 pt-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <span>Active Wash Queue</span>
              <span className="text-slate-400 font-medium">/ طابور الغسيل النشط</span>
            </h2>
            <p className="text-xs text-muted-foreground">Live tracking of orders in wash bays / تتبع مباشر للطلبات الحالية</p>
          </div>
          <Badge variant="outline" className="font-mono text-xs bg-background">
            {activeQueue.length} Order{activeQueue.length !== 1 ? 's' : ''} / {activeQueue.length} طلب
          </Badge>
        </div>

        {salesLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading queue data... / جاري التحميل...</div>
        ) : activeQueue.length === 0 ? (
          <Card className="border-dashed border-border py-10 flex flex-col items-center justify-center text-center">
            <Car className="h-10 w-10 text-muted-foreground/30 mb-2 animate-bounce" />
            <p className="text-xs font-bold text-muted-foreground">No orders in the wash queue / طابور الغسيل فارغ</p>
            <p className="text-[11px] text-slate-500 mt-1">Record a checkout to add an order / سجل عملية دفع لإضافة طلب</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeQueue.map((item) => {
              const dateObj = new Date(item.date);
              const formattedTime = format(dateObj, 'hh:mm a');
              
              // Status Styling
              const isPending = item.status === 'pending';
              const isWashing = item.status === 'in-progress';
              const isCompleted = item.status === 'completed';

              return (
                <Card
                  key={item.transactionId}
                  className={cn(
                    'border-2 transition-all relative overflow-hidden',
                    isPending && 'border-slate-800 hover:border-slate-700 bg-slate-900/30',
                    isWashing && 'border-blue-500/40 bg-blue-500/[0.02] shadow-[0_0_15px_rgba(59,130,246,0.05)]',
                    isCompleted && 'border-green-500/40 bg-green-500/[0.02] shadow-[0_0_15px_rgba(34,197,94,0.05)]'
                  )}
                >
                  <div
                    className={cn(
                      'h-1.5 w-full absolute top-0 left-0',
                      isPending && 'bg-slate-700',
                      isWashing && 'bg-blue-500 animate-pulse',
                      isCompleted && 'bg-green-500'
                    )}
                  ></div>

                  <CardContent className="pt-5 space-y-4">
                    
                    {/* Header: Invoice Number & Time */}
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="font-mono text-sm font-extrabold tracking-wider bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-white shadow-sm">
                          {item.invoiceNo}
                        </span>
                        <p className="text-[10px] text-muted-foreground font-semibold">
                          Order Queue / طابور الطلب
                        </p>
                      </div>
                      
                      <div className="text-right space-y-1">
                        <Badge
                          variant={isPending ? 'outline' : isWashing ? 'secondary' : 'default'}
                          className={cn(
                            'text-[9px] font-bold uppercase tracking-wider h-5',
                            isPending && 'text-yellow-500 border-yellow-500/30 bg-yellow-500/5',
                            isWashing && 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/20',
                            isCompleted && 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/20'
                          )}
                        >
                          {isPending && 'Pending / قيد الانتظار'}
                          {isWashing && 'Washing / غسيل'}
                          {isCompleted && 'Ready / جاهز'}
                        </Badge>
                        <p className="text-[9px] text-muted-foreground font-mono">{formattedTime}</p>
                      </div>
                    </div>

                    {/* Middle: Services List & Staff */}
                    <div className="space-y-2 pt-1 border-t border-border/60">
                      <div className="flex flex-wrap gap-1">
                        {item.services.map((srv, idx) => (
                          <Badge key={idx} variant="outline" className="text-[9px] bg-background">
                            {srv}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex justify-between items-center text-[9px] text-muted-foreground">
                        <span>Staff / الموظفين: {item.staffList.join(', ')}</span>
                        <span className="capitalize">{item.paymentMethod.replace('-', ' ')}</span>
                      </div>
                    </div>

                    {/* Loyalty/Stamp Verification Status */}
                    <div className="pt-2 border-t border-border/40 space-y-1.5">
                      {item.paymentMethod === 'free-loyalty' ? (
                        item.isLoyaltyClaimed ? (
                          <div className="flex items-center gap-1.5 text-[10px] text-green-500 font-bold bg-green-500/10 p-1.5 rounded-lg border border-green-500/20">
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Stamps Reset: YES (Loyalty Claimed)</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[10px] text-red-500 font-extrabold bg-red-500/10 p-1.5 rounded-lg border border-red-500/30 animate-pulse">
                            <AlertCircle className="h-3.5 w-3.5 text-red-500 animate-bounce" />
                            <span>⚠️ UNCLAIMED: MUST SCAN TO RESET STAMPS ⚠️</span>
                          </div>
                        )
                      ) : (
                        item.isLoyaltyClaimed ? (
                          <div className="flex items-center gap-1.5 text-[9px] text-blue-400 bg-blue-500/5 p-1 rounded border border-blue-500/10">
                            <Check className="h-3 w-3" />
                            <span>Stamp Earned: {item.customerName || 'Customer'}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[9px] text-slate-500 bg-slate-950/20 p-1 rounded border border-slate-800">
                            <QrCode className="h-3 w-3 opacity-60" />
                            <span>Stamp Pending Scan</span>
                          </div>
                        )
                      )}
                    </div>

                    {/* Bottom: Actions & Flow Control */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                      
                      {/* Action buttons based on state */}
                      {isPending && (
                        <Button
                          onClick={() => handleUpdateQueueStatus(item.transactionId, item.rawSales, 'in-progress')}
                          size="sm"
                          className="flex-1 text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-bold h-8 flex flex-col justify-center gap-0.5 leading-none"
                        >
                          <span>Start Wash</span>
                          <span className="opacity-80 text-[8px] font-normal">بدء الغسيل</span>
                        </Button>
                      )}

                      {isWashing && (
                        <Button
                          onClick={() => handleUpdateQueueStatus(item.transactionId, item.rawSales, 'completed')}
                          size="sm"
                          className="flex-1 text-[10px] bg-green-600 hover:bg-green-700 text-white font-bold h-8 flex flex-col justify-center gap-0.5 leading-none"
                        >
                          <span>Mark Ready</span>
                          <span className="opacity-80 text-[8px] font-normal">جاهز للتسليم</span>
                        </Button>
                      )}

                      {isCompleted && (
                        <Button
                          onClick={() => handleUpdateQueueStatus(item.transactionId, item.rawSales, 'delivered')}
                          size="sm"
                          className="flex-1 text-[10px] bg-accent hover:bg-accent/90 text-white font-bold h-8 flex flex-col justify-center gap-0.5 leading-none"
                        >
                          <span>Deliver Order</span>
                          <span className="opacity-80 text-[8px] font-normal">تسليم العميل</span>
                        </Button>
                      )}

                      {/* Secondary Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="outline" className="h-8 w-8 border-border">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleReprintReceipt(item)} className="text-xs">
                            <Printer className="h-3.5 w-3.5 mr-2" />
                            Print Receipt / طباعة
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm('Delete this order? / هل تريد إلغاء هذا الطلب؟')) {
                                item.rawSales.forEach((sale) => handleDeleteSale(sale.id, sale.service));
                              }
                            }}
                            className="text-destructive text-xs"
                          >
                            <Trash className="h-3.5 w-3.5 mr-2" />
                            Cancel / إلغاء الطلب
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                    </div>

                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* --- DIALOG MODALS --- */}

      {/* 1. Add Service Catalog Item Details Dialog (SCROLLABLE) */}
      <Dialog open={serviceSelectOpen} onOpenChange={setServiceSelectOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex justify-between border-b border-slate-800 pb-2">
              <span>Configure Wash Details</span>
              <span className="text-slate-400 font-medium">تكوين تفاصيل الغسيل</span>
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs mt-1">
              Configure parameters for "{selectedService?.name}" / تكوين تفاصيل الخدمة المختارة
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-3">
            
            {/* Size selection if required */}
            {selectedService?.needsSize && (
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs font-bold flex justify-between">
                  <span>Select Car Size</span>
                  <span>اختر حجم السيارة</span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.keys(selectedService.prices).map((size) => {
                    const priceDetail = selectedService.prices[size];
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          setSelectedSize(size);
                          setErrors((prev) => ({ ...prev, size: false }));
                        }}
                        className={cn(
                          'p-3 rounded-lg border text-xs font-semibold cursor-pointer text-center transition-all flex flex-col justify-center items-center leading-none h-16 min-h-[4rem]',
                          selectedSize === size
                            ? 'border-accent bg-accent/20 text-accent font-bold scale-[1.02]'
                            : 'border-slate-800 bg-slate-950 hover:bg-slate-800'
                        )}
                      >
                        <div className="capitalize font-bold text-[10px] break-words line-clamp-2 w-full text-center">
                          {size.replace('-', ' ')}
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-1">
                          {formatNumber(priceDetail.price)} <CurrencySymbol />
                        </div>
                      </button>
                    );
                  })}
                </div>
                {errors.size && <p className="text-[10px] text-red-400">Please select a size / يرجى تحديد حجم سيارة</p>}
              </div>
            )}

            {/* Cleaner Staff selection */}
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs font-bold flex justify-between">
                <span>Assign Cleaner Staff</span>
                <span>تعيين عمال النظافة</span>
              </Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {staff?.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedStaffId(s.id);
                      setErrors((prev) => ({ ...prev, staff: false }));
                    }}
                    className={cn(
                      'p-2.5 rounded-lg border text-xs font-semibold cursor-pointer text-center transition-all truncate h-11 flex items-center justify-center',
                      selectedStaffId === s.id
                        ? 'border-purple-500 bg-purple-500/20 text-purple-300 font-bold scale-[1.02]'
                        : 'border-slate-800 bg-slate-950 hover:bg-slate-800'
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              {errors.staff && <p className="text-[10px] text-red-400">Please assign staff / يرجى تعيين موظف غسيل</p>}
            </div>

          </div>

          <DialogFooter className="gap-2 border-t border-slate-800 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setServiceSelectOpen(false);
                setSelectedService(null);
              }}
              className="border-slate-800 hover:bg-slate-800 text-slate-300 text-xs flex-1"
            >
              Cancel / إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleAddToCart}
              className="bg-accent hover:bg-accent/90 text-white font-bold text-xs flex-1"
            >
              Add to Cart / إضافة للسلة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Customer Loyalty Kiosk Scan QR Overlay */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white text-center">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-center flex flex-col gap-0.5">
              <span>Customer Loyalty Program Registration</span>
              <span className="text-xs text-slate-400">تسجيل برنامج ولاء العملاء</span>
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-[11px] text-center mt-1">
              Point your phone camera to register or view card / وجه كاميرا الجوال للتسجيل أو عرض بطاقتك
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-6 gap-4">
            {qrUrl && (
              <div className="bg-white p-4 rounded-3xl shadow-2xl border border-slate-800">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrUrl)}&color=0f172a`}
                  alt="POS Loyalty QR Code"
                  className="w-52 h-52 object-contain"
                />
              </div>
            )}
            
            <p className="text-[10px] text-slate-500 font-mono select-all truncate max-w-xs">
              {qrUrl}
            </p>
            
            <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800/80 max-w-sm flex flex-col gap-1 text-center">
              <span>⚡ <strong>Loyalty rule:</strong> Earn <strong>6 stamps</strong> (paid washes) → Get the <strong>7th wash FREE!</strong> (Full Wash only)</span>
              <span className="text-slate-500 border-t border-slate-800/60 pt-1 mt-1">⚡ <strong>قاعدة الولاء:</strong> اجمع <strong>٦ طوابع</strong> غسيل مدفوع ← احصل على <strong>الغسيل السابع مجانياً!</strong> (غسيل كامل فقط)</span>
            </div>
          </div>

          <DialogFooter className="sm:justify-center border-t border-slate-800 pt-3">
            <Button
              type="button"
              onClick={() => setQrOpen(false)}
              className="w-full sm:w-auto border-slate-800 text-slate-300 hover:bg-slate-800 text-xs"
              variant="outline"
            >
              Close / إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Thermal Invoice Receipt Dialog */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="sm:max-w-sm bg-slate-900 border-slate-800 text-white no-print">
          <DialogHeader>
            <DialogTitle className="font-bold flex items-center gap-1.5 text-base justify-between border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1">
                <Printer className="h-4 w-4 text-accent" />
                <span>Checkout Successful!</span>
              </span>
              <span className="text-xs text-slate-400 font-medium">تم الدفع بنجاح!</span>
            </DialogTitle>
          </DialogHeader>

          {/* Receipt Preview scrollbox */}
          <div className="border border-slate-850 bg-slate-950 p-4 rounded-xl max-h-[350px] overflow-y-auto scrollbar-thin">
            
            {/* Thermal Print Area Target */}
            <div id="print-receipt-modal" className="text-black bg-white p-3 font-mono text-[11px] leading-tight space-y-4">
              
              {/* Receipt Header */}
              <div className="text-center space-y-1 border-b border-dashed border-slate-400 pb-3">
                <h2 className="text-sm font-extrabold tracking-wider">CLEANSWEEP PRO</h2>
                <p className="text-[10px]">Premium Car Wash & Detailing</p>
                <p className="text-[9px] text-slate-600">Riyadh, Saudi Arabia</p>
                <p className="text-[9px] text-slate-600">VAT ID: 300123456700003</p>
              </div>

              {/* Invoice Metadata */}
              <div className="space-y-0.5 text-[9px] text-slate-700">
                <div className="flex justify-between">
                  <span>INVOICE / الفاتورة:</span>
                  <span className="font-bold text-black">{receiptData?.invoiceNo}</span>
                </div>
                <div className="flex justify-between">
                  <span>DATE / التاريخ:</span>
                  <span>{receiptData?.date ? format(new Date(receiptData.date), 'yyyy-MM-dd HH:mm:ss') : ''}</span>
                </div>
                <div className="flex justify-between">
                  <span>PAYMENT / الدفع:</span>
                  <span className="capitalize font-bold text-black">{receiptData?.paymentMethod.replace('-', ' ')}</span>
                </div>
              </div>

              {/* Claim QR Code */}
              {receiptData?.claimCode && (
                <div className="flex flex-col items-center py-2.5 border-t border-b border-dashed border-slate-300 my-1.5 text-center">
                  <span className="font-bold text-[9px] tracking-wide">SCAN TO CLAIM STAMP / امسح للطابع</span>
                  <a
                    href={`${window.location.origin}/loyalty?shop=${user.uid}&claim=${receiptData.claimCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white p-1 rounded-lg border border-slate-200 mt-1 inline-block hover:shadow-md transition-shadow"
                    title="Click to claim stamp (for testing) / اضغط للحصول على الطابع للتجربة"
                  >
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(
                        `${window.location.origin}/loyalty?shop=${user.uid}&claim=${receiptData.claimCode}`
                      )}&color=0f172a`}
                      alt="Claim Wash QR"
                      className="w-24 h-24 object-contain"
                    />
                  </a>
                  <span className="text-[8px] text-slate-500 mt-1 leading-none">Stamps update live on phone / تحديث الطوابع مباشر بالجوال</span>
                </div>
              )}

              {/* Items listing table */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-bold border-b border-slate-300 pb-1 text-[9px]">
                  <span>DESCRIPTION / الخدمة</span>
                  <span>PRICE / السعر</span>
                </div>
                <div className="space-y-1.5">
                  {receiptData?.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[10px]">
                      <div className="space-y-0.5">
                        <span className="font-bold">{item.serviceName}</span>
                        <div className="text-[9px] text-slate-600">
                          {item.carSize && <span className="capitalize">{item.carSize} </span>}
                          <span>[Washer/العامل: {item.staffName}]</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold align-top">
                        {item.price === 0 ? 'FREE' : `${formatNumber(item.price)} SAR`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total calculations */}
              <div className="border-t border-dashed border-slate-400 pt-2 space-y-1 text-right text-[10px]">
                <div className="flex justify-between text-slate-600 text-[9px]">
                  <span>SUBTOTAL (VAT INCL) / المجموع الفرعي:</span>
                  <span>{formatNumber(receiptData?.subtotal || 0, { minimumFractionDigits: 2 })} SAR</span>
                </div>
                <div className="flex justify-between text-slate-600 text-[9px]">
                  <span>VAT (15% INCL) / الضريبة المضافة:</span>
                  <span>{formatNumber(receiptData?.vat || 0, { minimumFractionDigits: 2 })} SAR</span>
                </div>
                <div className="flex justify-between font-extrabold text-black text-sm pt-1 border-t border-slate-300">
                  <span>TOTAL / الإجمالي:</span>
                  <span>{formatNumber(receiptData?.total || 0, { minimumFractionDigits: 2 })} SAR</span>
                </div>
              </div>

              {/* Footer messages */}
              <div className="text-center pt-3 border-t border-dashed border-slate-400 space-y-1 text-[9px] text-slate-600">
                <p className="font-bold text-black">Thank you for your business / شكراً لتعاملكم معنا</p>
                <p>Register stamps by scanning receipt QR code.</p>
                <p>Powered by CleanSweep Pro</p>
              </div>

            </div>

          </div>

          <DialogFooter className="gap-2 border-t border-slate-800 pt-3 flex flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReceiptOpen(false)}
              className="border-slate-800 text-slate-300 hover:bg-slate-800 flex-1 text-xs"
            >
              Close / إغلاق
            </Button>
            <Button
              type="button"
              onClick={handlePrintReceipt}
              className="bg-accent hover:bg-accent/90 text-white font-bold flex-1 text-xs"
            >
              <Printer className="h-4 w-4 mr-1" />
              Print / طباعة الفاتورة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
