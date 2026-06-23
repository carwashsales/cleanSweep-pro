'use client';
import {
  ArrowUpRight,
  CircleDollarSign,
  Package,
  Car,
  AlertTriangle,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import type { CarWashSale, InventoryItem, Staff } from '@/types';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import * as React from 'react';
import { format } from 'date-fns';
import { CurrencySymbol } from '@/components/currency-symbol';
import { useTranslations, useFormatter } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSalesPeriod } from '@/lib/utils';

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const t = useTranslations('DashboardPage');
  const formatNumber = useFormatter().number;
  const firestore = useFirestore();
  
  const salesPeriod = React.useMemo(() => getSalesPeriod(), []);

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  const salesQuery = useMemoFirebase(
    () =>
      firestore && user
         ? query(
             collection(firestore, 'users', user.uid, 'sales'), 
             where('date', '>=', salesPeriod.start.toISOString()),
             where('date', '<', salesPeriod.end.toISOString()),
             orderBy('date', 'desc')
           )
        : null,
    [firestore, user, salesPeriod]
  );
  
  const recentSalesQuery = useMemoFirebase(
    () =>
      firestore && user
        ? query(collection(firestore, 'users', user.uid, 'sales'), orderBy('date', 'desc'), limit(5))
        : null,
    [firestore, user]
  );

  const inventoryQuery = useMemoFirebase(
    () => (firestore && user ? collection(firestore, 'users', user.uid, 'inventory') : null),
    [firestore, user]
  );
  
  const lowStockQuery = useMemoFirebase(
    () => (firestore && user ? query(collection(firestore, 'users', user.uid, 'inventory'), where('quantity', '>', 0), where('quantity', '<', 10), limit(5)) : null),
    [firestore, user]
  );

  const staffQuery = useMemoFirebase(
    () => (firestore && user ? collection(firestore, 'users', user.uid, 'staff') : null),
    [firestore, user]
  );

  const { data: sales, isLoading: salesLoading } = useCollection<CarWashSale>(salesQuery);
  const { data: recentSales, isLoading: recentSalesLoading } = useCollection<CarWashSale>(recentSalesQuery);
  const { data: inventoryItems, isLoading: inventoryLoading } = useCollection<InventoryItem>(inventoryQuery);
  const { data: lowStockItems, isLoading: lowStockLoading } = useCollection<InventoryItem>(lowStockQuery);
  const { data: staff, isLoading: staffLoading } = useCollection<Staff>(staffQuery);

  const { totalRevenue, fullWashCount, outsideOnlyCount, otherServicesCount, staffCommissions, totalCommissions } = React.useMemo(() => {
    if (!sales) return { totalRevenue: 0, fullWashCount: 0, outsideOnlyCount: 0, otherServicesCount: 0, staffCommissions: {} as Record<string, number>, totalCommissions: 0 };
    
    let revenue = 0;
    let fullWashes = 0;
    let outsideWashes = 0;
    let otherSales = 0;
    let totalComm = 0;
    const commByStaff: Record<string, number> = {};

    sales.forEach(sale => {
      revenue += sale.amount;
      totalComm += sale.commission || 0;
      
      if (sale.staffName) {
        commByStaff[sale.staffName] = (commByStaff[sale.staffName] || 0) + (sale.commission || 0);
      }

      if (sale.service === 'Full Wash') {
        fullWashes++;
      } else if (sale.service === 'Outside Only') {
        outsideWashes++;
      } else {
        otherSales++;
      }
    });

    return { 
      totalRevenue: revenue, 
      fullWashCount: fullWashes, 
      outsideOnlyCount: outsideWashes, 
      otherServicesCount: otherSales,
      staffCommissions: commByStaff,
      totalCommissions: totalComm
    };
  }, [sales]);

  
  const totalInventory = React.useMemo(() => {
    if (!inventoryItems) return 0;
    return inventoryItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [inventoryItems]);


  if (isUserLoading || !user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-1">
      {/* Premium Dashboard Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 sm:p-8 shadow-sm">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute left-1/3 bottom-0 -mb-16 h-36 w-36 rounded-full bg-accent/5 blur-2xl" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400 flex gap-2">
                <span>Active Shift / الوردية النشطة: 7:00 AM - 3:00 AM</span>
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-headline flex flex-wrap items-center gap-2">
              <span>CleanSweep Pro Control Center</span>
              <span className="text-muted-foreground font-normal">/</span>
              <span className="text-primary">مركز التحكم بالعمليات</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
              Real-time commercial POS terminal overview, inventory management and operational metrics.
              <br />
              <span className="text-xs text-muted-foreground/80">عرض حي لمحطة البيع، إدارة المخزون، والمؤشرات التشغيلية للمغسلة.</span>
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild className="shadow-md hover:shadow-lg transition-all flex items-center gap-2 bg-primary hover:bg-primary/95 text-white font-medium">
              <Link href="/sales">
                <CircleDollarSign className="h-4 w-4" />
                <span>Open POS / فتح نقاط البيع</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Commercial Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Card 1: Total Revenue */}
        <Card className="relative overflow-hidden border-t-4 border-t-blue-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold text-muted-foreground tracking-wide">
                REVENUE / الإيرادات
              </CardTitle>
              <span className="text-xs text-muted-foreground/80 block">Today's total sales / إجمالي مبيعات اليوم</span>
            </div>
            <div className="rounded-full bg-blue-500/10 p-2 text-blue-500 dark:text-blue-400">
              <CircleDollarSign className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-3xl font-bold flex items-baseline gap-1.5">
              {salesLoading ? (
                <span className="text-lg text-muted-foreground">Loading / جاري التحميل...</span>
              ) : (
                <>
                  <span className="font-mono tracking-tight">
                    {formatNumber(totalRevenue, { style: 'currency', currency: 'SAR' }).replace('SAR', '').trim()}
                  </span>
                  <CurrencySymbol />
                </>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg">
              <span>Shift active cycle</span>
              <span className="font-semibold text-primary">Live / مباشر</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Total Commission */}
        <Card className="relative overflow-hidden border-t-4 border-t-indigo-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold text-muted-foreground tracking-wide">
                COMMISSION / العمولات
              </CardTitle>
              <span className="text-xs text-muted-foreground/80 block">Today's total staff commission / عمولات الموظفين اليوم</span>
            </div>
            <div className="rounded-full bg-indigo-500/10 p-2 text-indigo-500 dark:text-indigo-400">
              <CircleDollarSign className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-3xl font-bold flex items-baseline gap-1.5">
              {salesLoading ? (
                <span className="text-lg text-muted-foreground">Loading / جاري التحميل...</span>
              ) : (
                <>
                  <span className="font-mono tracking-tight">
                    {formatNumber(totalCommissions, { style: 'currency', currency: 'SAR' }).replace('SAR', '').trim()}
                  </span>
                  <CurrencySymbol />
                </>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg">
              <span>Incentive program</span>
              <span className="font-semibold text-indigo-500">Active / نشط</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Today's Wash Traffic */}
        <Card className="relative overflow-hidden border-t-4 border-t-purple-500 shadow-sm hover:shadow-md transition-shadow lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold text-muted-foreground tracking-wide">
                WASH TRAFFIC / حركة الغسيل
              </CardTitle>
              <span className="text-xs text-muted-foreground/80 block">Today's volume breakdown / تفاصيل خدمات اليوم</span>
            </div>
            <div className="rounded-full bg-purple-500/10 p-2 text-purple-500 dark:text-purple-400">
              <Car className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {salesLoading ? (
              <div className="text-xs text-muted-foreground py-4">Loading stats / جاري التحميل...</div>
            ) : (
              <div className="space-y-2 mt-1">
                {/* Full Wash */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Full Wash / غسيل كامل</span>
                    <span className="font-bold">{formatNumber(fullWashCount)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (fullWashCount / Math.max(1, fullWashCount + outsideOnlyCount + otherServicesCount)) * 100)}%` }} />
                  </div>
                </div>
                {/* Outside Only */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Outside / خارجي فقط</span>
                    <span className="font-bold">{formatNumber(outsideOnlyCount)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, (outsideOnlyCount / Math.max(1, fullWashCount + outsideOnlyCount + otherServicesCount)) * 100)}%` }} />
                  </div>
                </div>
                {/* Other Services */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Others / خدمات أخرى</span>
                    <span className="font-bold">{formatNumber(otherServicesCount)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (otherServicesCount / Math.max(1, fullWashCount + outsideOnlyCount + otherServicesCount)) * 100)}%` }} />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 4: Total Inventory */}
        <Card className="relative overflow-hidden border-t-4 border-t-emerald-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold text-muted-foreground tracking-wide">
                INVENTORY STOCK / المخزون
              </CardTitle>
              <span className="text-xs text-muted-foreground/80 block">Total stock in warehouse / إجمالي مخزون المستودع</span>
            </div>
            <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-500 dark:text-emerald-400">
              <Package className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-3xl font-bold flex items-baseline gap-1.5">
              {inventoryLoading ? (
                <span className="text-lg text-muted-foreground">Loading / جاري التحميل...</span>
              ) : (
                <>
                  <span className="font-mono tracking-tight">{formatNumber(totalInventory)}</span>
                  <span className="text-xs font-normal text-muted-foreground">Items / وحدة</span>
                </>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg">
              <span>Stock level health</span>
              <span className="font-semibold text-emerald-500">Good / مستقر</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 5: Low Stock Alerts */}
        <Card className="relative overflow-hidden border-t-4 border-t-amber-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold text-muted-foreground tracking-wide">
                SYSTEM ALERTS / التنبيهات
              </CardTitle>
              <span className="text-xs text-muted-foreground/80 block">Critical inventory issues / تنبيهات المخزون الهامة</span>
            </div>
            <div className={`rounded-full p-2 ${lowStockItems && lowStockItems.length > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse' : 'bg-muted p-2 text-muted-foreground'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-3xl font-bold flex items-baseline gap-1.5">
              {lowStockLoading ? (
                <span className="text-lg text-muted-foreground">Loading / جاري التحميل...</span>
              ) : (
                <>
                  <span className={`font-mono tracking-tight ${lowStockItems && lowStockItems.length > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {formatNumber(lowStockItems?.length || 0)}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">Alerts / تنبيه</span>
                </>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs rounded-lg">
              {lowStockItems && lowStockItems.length > 0 ? (
                <span className="text-amber-500 font-semibold flex items-center gap-1">
                  Reorder recommended / يوصى بإعادة الطلب
                </span>
              ) : (
                <span className="text-emerald-500 font-semibold flex items-center gap-1">
                  All systems clear / لا توجد مشاكل بالمخزون
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Operations Tables */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Transactions Card */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <span>Recent Sales</span>
                <span className="text-muted-foreground font-normal">/</span>
                <span className="text-primary">المبيعات الأخيرة</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Live feed of the five most recent car wash sales / تحديث حي لآخر 5 عمليات غسيل
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline" className="text-xs flex items-center gap-1.5 border-primary/20 hover:bg-primary/5 hover:text-primary">
              <Link href="/sales">
                <span>View All / عرض الكل</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 rounded-lg">
                  <TableRow>
                    <TableHead className="font-semibold text-xs py-3 text-muted-foreground uppercase tracking-wider">
                      Service & Staff / الخدمة والموظف
                    </TableHead>
                    <TableHead className="font-semibold text-xs py-3 text-muted-foreground uppercase tracking-wider text-right">
                      Date & Time / التاريخ والوقت
                    </TableHead>
                    <TableHead className="font-semibold text-xs py-3 text-muted-foreground uppercase tracking-wider text-right">
                      Amount / المبلغ
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSalesLoading && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs py-8 text-muted-foreground">
                        Loading recent transactions / جاري تحميل المعاملات الأخيرة...
                      </TableCell>
                    </TableRow>
                  )}
                  {!recentSalesLoading && recentSales?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs py-8 text-muted-foreground">
                        No transactions registered today / لا توجد مبيعات مسجلة اليوم
                      </TableCell>
                    </TableRow>
                  )}
                  {recentSales?.map((sale) => (
                    <TableRow key={sale.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="py-3">
                        <div className="font-semibold text-sm">{sale.service}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Staff / الموظف: <span className="font-medium text-foreground">{sale.staffName || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-3 text-xs text-muted-foreground">
                        <div>{format(new Date(sale.date), "yyyy-MM-dd")}</div>
                        <div className="text-[10px] mt-0.5">{format(new Date(sale.date), "hh:mm a")}</div>
                      </TableCell>
                      <TableCell className="text-right py-3 font-semibold text-sm">
                        <div className="flex justify-end items-center gap-1.5">
                          <span className="font-mono text-primary">
                            {formatNumber(sale.amount, { style: 'currency', currency: 'SAR' }).replace('SAR', '').trim()}
                          </span>
                          <CurrencySymbol />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Items Card */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <span>Low Stock Items</span>
                <span className="text-muted-foreground font-normal">/</span>
                <span className="text-primary">العناصر ذات المخزون المنخفض</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Items requiring immediate stock replenishment / المواد التي قاربت على الانتهاء
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline" className="text-xs flex items-center gap-1.5 border-primary/20 hover:bg-primary/5 hover:text-primary">
              <Link href="/inventory">
                <span>View All / عرض الكل</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 rounded-lg">
                  <TableRow>
                    <TableHead className="font-semibold text-xs py-3 text-muted-foreground uppercase tracking-wider">
                      Item Name / اسم المادة
                    </TableHead>
                    <TableHead className="font-semibold text-xs py-3 text-muted-foreground uppercase tracking-wider">
                      Status / الحالة
                    </TableHead>
                    <TableHead className="font-semibold text-xs py-3 text-muted-foreground uppercase tracking-wider text-right">
                      Quantity / الكمية
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockLoading && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs py-8 text-muted-foreground">
                        Loading low stock alerts / جاري تحميل التنبيهات...
                      </TableCell>
                    </TableRow>
                  )}
                  {!lowStockLoading && (!lowStockItems || lowStockItems.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs py-8 text-emerald-500 font-medium">
                        All items are in healthy quantities / جميع المواد في كميات ممتازة
                      </TableCell>
                    </TableRow>
                  )}
                  {lowStockItems?.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="py-3 font-semibold text-sm">
                        {item.name}
                      </TableCell>
                      <TableCell className="py-3">
                        {item.quantity === 0 ? (
                          <Badge variant="destructive" className="text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider bg-red-600 text-white animate-pulse">
                            Out of Stock / نفذ
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider bg-amber-500 text-white border-none">
                            Low Stock / منخفض
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right py-3 font-mono font-bold text-sm">
                        <span className={item.quantity === 0 ? 'text-red-500' : 'text-amber-500'}>
                          {formatNumber(item.quantity)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Employee Commissions Card */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <span>Staff Commissions</span>
                <span className="text-muted-foreground font-normal">/</span>
                <span className="text-primary">عمولات الموظفين</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Today's commissions earned by each washer / العمولات الفردية لليوم
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 rounded-lg">
                  <TableRow>
                    <TableHead className="font-semibold text-xs py-3 text-muted-foreground uppercase tracking-wider">
                      Staff Member / الموظف
                    </TableHead>
                    <TableHead className="font-semibold text-xs py-3 text-muted-foreground uppercase tracking-wider text-right">
                      Commission / العمولة
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffLoading && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-xs py-8 text-muted-foreground">
                        Loading staff list / جاري التحميل...
                      </TableCell>
                    </TableRow>
                  )}
                  {!staffLoading && (!staff || staff.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-xs py-8 text-muted-foreground">
                        No staff members found / لم يتم العثور على موظفين
                      </TableCell>
                    </TableRow>
                  )}
                  {staff?.map((s) => {
                    const commissionAmount = staffCommissions[s.name] || 0;
                    return (
                      <TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="py-3 font-semibold text-sm">
                          {s.name}
                        </TableCell>
                        <TableCell className="text-right py-3 font-mono font-bold text-sm">
                          <div className="flex justify-end items-center gap-1.5">
                            <span className="text-emerald-500 font-bold">
                              {formatNumber(commissionAmount, { style: 'currency', currency: 'SAR' }).replace('SAR', '').trim()}
                            </span>
                            <CurrencySymbol />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
