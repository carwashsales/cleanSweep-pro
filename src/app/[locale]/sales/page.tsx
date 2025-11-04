
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MoreHorizontal, Settings, Trash } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, useUser, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, orderBy, query } from 'firebase/firestore';
import type { CarWashSale, Staff, Price as ServicePrice } from '@/types';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { CurrencySymbol } from '@/components/currency-symbol';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useFormatter } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type PaymentType = 'coupon' | 'cash' | 'machine' | 'not-paid';

export default function SalesPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  const formatNumber = useFormatter().number;

  // Form State
  const [serviceId, setServiceId] = React.useState('');
  const [carSize, setCarSize] = React.useState('');
  const [staffId, setStaffId] = React.useState('');
  const [price, setPrice] = React.useState<number | string>('');
  const [commission, setCommission] = React.useState<number | string>('');
  const [paymentType, setPaymentType] = React.useState<PaymentType>('cash');
  const [waxAddOn, setWaxAddOn] = React.useState(false);
  const [errors, setErrors] = React.useState<{ [key: string]: boolean }>({});

  // Firestore Collections
  const salesQuery = useMemoFirebase(() => (firestore && user ? query(collection(firestore, 'users', user.uid, 'sales'), orderBy('date', 'desc')) : null), [firestore, user]);
  const staffCollection = useMemoFirebase(() => (firestore && user ? collection(firestore, 'users', user.uid, 'staff') : null), [firestore, user]);
  const servicesQuery = useMemoFirebase(() => (firestore && user ? query(collection(firestore, 'users', user.uid, 'services'), orderBy('order')) : null), [firestore, user]);
  
  const { data: sales, isLoading: salesLoading } = useCollection<CarWashSale>(salesQuery);
  const { data: staff, isLoading: staffLoading } = useCollection<Staff>(staffCollection);
  const { data: services, isLoading: servicesLoading } = useCollection<ServicePrice>(servicesQuery);

  const noStaff = !staff || staff.length === 0;
  const serviceConfig = services?.find(s => s.id === serviceId);
  
  const waxService = services?.find(s => s.id === 'wax-add-on');
  const showWaxOption = serviceId && serviceId.toLowerCase().includes('wash') && waxService;
  
  const resetForm = React.useCallback(() => {
    setServiceId('');
    setCarSize('');
    setStaffId('');
    setPrice('');
    setCommission('');
    setPaymentType('cash');
    setWaxAddOn(false);
    setErrors({});
  }, []);

  React.useEffect(() => {
    if (!serviceConfig) {
      setPrice(''); setCommission(''); setCarSize(''); setPaymentType('cash'); setWaxAddOn(false);
      return;
    }
  
    // Determine the effective payment type
    let currentPaymentType = paymentType;
    if (!serviceConfig.hasCoupon && paymentType === 'coupon') {
      currentPaymentType = 'cash'; // Default to cash if coupon is not an option
      setPaymentType('cash');
    }
  
    if (!serviceConfig.needsSize) setCarSize('');
    if (!showWaxOption) setWaxAddOn(false);
  
    const priceKey = serviceConfig.needsSize && carSize ? carSize : 'default';
    if (!priceKey) {
      setPrice(''); setCommission('');
      return;
    }
  
    const priceObj = serviceConfig.prices[priceKey];
    if (priceObj) {
      let currentPrice = 0;
      let currentCommission = 0;
  
      if (currentPaymentType === 'coupon' && serviceConfig.hasCoupon && priceObj.couponCommission !== undefined) {
        currentPrice = 0;
        currentCommission = priceObj.couponCommission;
      } else {
        currentPrice = priceObj.price;
        currentCommission = priceObj.commission;
      }
  
      if (waxAddOn && showWaxOption) {
        const waxPriceInfo = waxService?.prices['default'];
        if (waxPriceInfo) {
          currentPrice += waxPriceInfo.price;
          currentCommission += waxPriceInfo.commission;
        }
      }
  
      setPrice(currentPrice);
      setCommission(currentCommission);
    } else {
      setPrice('');
      setCommission('');
    }
  }, [serviceId, carSize, paymentType, serviceConfig, waxAddOn, showWaxOption, services, waxService]);
  

  const validateForm = () => {
    const newErrors: { [key: string]: boolean } = {};
    if (!serviceId) newErrors.serviceId = true;
    if (serviceConfig?.needsSize && !carSize) newErrors.carSize = true;
    if (!staffId) newErrors.staffId = true;
    if (!paymentType) newErrors.paymentType = true;
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (noStaff || !validateForm() || !firestore || !user) {
      toast({
        title: 'Please fix the errors',
        description: 'Fill out all required fields before submitting.',
        variant: 'destructive',
      });
      return;
    }
    const salesCollection = collection(firestore, 'users', user.uid, 'sales');

    const selectedStaff = staff?.find(s => s.id === staffId);
    if (!selectedStaff || !paymentType) return;
     
    const isPaid = paymentType !== 'not-paid';
    
    const newSale: Omit<CarWashSale, 'id'> = {
      service: serviceConfig?.name || 'Unknown Service',
      staffName: selectedStaff.name,
      ...(carSize && { carSize }),
      date: new Date().toISOString(),
      amount: isPaid ? Number(price) : 0,
      commission: Number(commission),
      hasCoupon: paymentType === 'coupon',
      paymentMethod: paymentType,
      waxAddOn,
      isPaid,
    };
    
    addDocumentNonBlocking(salesCollection, newSale);
    resetForm();
    toast({
      title: 'Sale Recorded',
      description: 'The new sale has been successfully added.',
    });
  };

  const handleDeleteSale = (saleId: string, serviceName: string) => {
    if (!firestore || !user) return;
    const saleRef = doc(firestore, 'users', user.uid, 'sales', saleId);
    deleteDocumentNonBlocking(saleRef);
    toast({
      variant: 'destructive',
      title: 'Sale Deleted',
      description: `The sale for "${serviceName}" has been deleted.`,
    });
  };
  
  const carSizes = React.useMemo(() => {
    if (!serviceConfig || !serviceConfig.needsSize) return [];
    return Object.keys(serviceConfig.prices);
  }, [serviceConfig]);
  
  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user || servicesLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="grid gap-4 md:gap-8 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Record a Sale</CardTitle>
            <CardDescription>Add a new car wash sales transaction.</CardDescription>
          </CardHeader>
          <CardContent>
            {noStaff && (
              <Alert variant="destructive" className="mb-4">
                <Settings className="h-4 w-4" />
                <AlertDescription>
                  Please add staff members on the Staff page before recording a sale.
                </AlertDescription>
              </Alert>
            )}
            <form className="space-y-4" onSubmit={handleAddSale}>
              <div className="grid gap-2">
                <Label htmlFor="service-type">Service Type</Label>
                <Select value={serviceId} onValueChange={(v) => { setServiceId(v); setErrors(p => ({...p, serviceId: false}))}} disabled={noStaff}>
                  <SelectTrigger id="service-type" data-invalid={errors.serviceId ? 'true' : undefined} className="data-[invalid=true]:border-destructive">
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services?.filter(s => s.id !== 'wax-add-on').map((srv) => (
                      <SelectItem key={srv.id} value={srv.id}>{srv.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {serviceConfig?.needsSize && (
                <div className="grid gap-2">
                  <Label htmlFor="car-size">Car Size</Label>
                  <Select value={carSize} onValueChange={(v) => { setCarSize(v); setErrors(p => ({...p, carSize: false}))}} disabled={noStaff || !serviceConfig?.needsSize}>
                    <SelectTrigger id="car-size" data-invalid={errors.carSize ? 'true' : undefined} className="data-[invalid=true]:border-destructive"><SelectValue placeholder="Select car size" /></SelectTrigger>
                    <SelectContent>
                      {carSizes.sort((a,b) => (serviceConfig?.prices[a]?.price || 0) - (serviceConfig?.prices[b]?.price || 0)).map(size => (
                        <SelectItem key={size} value={size} className="capitalize">{size.replace('-', ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="staff-member">Staff Member</Label>
                <Select value={staffId} onValueChange={(v) => { setStaffId(v); setErrors(p => ({...p, staffId: false}))}} disabled={noStaff}>
                  <SelectTrigger id="staff-member" data-invalid={errors.staffId ? 'true' : undefined} className="data-[invalid=true]:border-destructive">
                    <SelectValue placeholder={staffLoading ? "Loading..." : "Select staff"} />
                  </SelectTrigger>
                  <SelectContent>
                    {staff?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-between gap-4">
                <div className="grid gap-2 w-1/2">
                  <Label htmlFor="price">Price</Label>
                  <div className="relative flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <span className="font-mono">{paymentType === 'not-paid' ? formatNumber(0, {minimumFractionDigits: 2}) : formatNumber(Number(price), {minimumFractionDigits: 2})}</span>
                    <span className="ml-auto"><CurrencySymbol /></span>
                  </div>
                </div>
                <div className="grid gap-2 w-1/2">
                   <Label htmlFor="commission">Commission</Label>
                   <div className="relative flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <span className="font-mono">{formatNumber(Number(commission), {minimumFractionDigits: 2})}</span>
                    <span className="ml-auto"><CurrencySymbol /></span>
                  </div>
                </div>
              </div>

              {showWaxOption && waxService && (
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox id="wax-add-on" checked={waxAddOn} onCheckedChange={(c) => setWaxAddOn(!!c)} disabled={noStaff} />
                  <Label htmlFor="wax-add-on" className="cursor-pointer flex items-center gap-1">Wax Add-on (+{formatNumber(waxService.prices['default']?.price || 0)} <CurrencySymbol />)</Label>
                </div>
              )}

                <RadioGroup
                    value={paymentType}
                    onValueChange={(value: PaymentType) => {
                        setPaymentType(value);
                        setErrors(prev => ({...prev, paymentType: false}));
                    }}
                    className="grid gap-3 pt-2 border-t data-[invalid=true]:rounded-md data-[invalid=true]:border data-[invalid=true]:border-destructive data-[invalid=true]:p-2"
                    data-invalid={errors.paymentType ? 'true' : undefined}
                >
                    <Label className="font-semibold">Payment Method</Label>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        {serviceConfig?.hasCoupon && (
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="coupon" id="payment-coupon" disabled={noStaff} />
                                <Label htmlFor="payment-coupon">Coupon</Label>
                            </div>
                        )}
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="cash" id="payment-cash" disabled={noStaff} />
                            <Label htmlFor="payment-cash">Cash</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="machine" id="payment-machine" disabled={noStaff} />
                            <Label htmlFor="payment-machine">Machine</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="not-paid" id="payment-not-paid" disabled={noStaff} />
                            <Label htmlFor="payment-not-paid">Not Paid</Label>
                        </div>
                    </div>
                </RadioGroup>
              
              <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={resetForm} disabled={noStaff}>Clear</Button>
                  <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={noStaff}>Add Sale</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Recent Sales</CardTitle>
            <CardDescription>A history of your most recent sales transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="hidden sm:table-cell">Staff</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesLoading && <TableRow><TableCell colSpan={5}>Loading...</TableCell></TableRow>}
                {sales?.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">{sale.service}</TableCell>
                    <TableCell className="hidden sm:table-cell">{sale.staffName}</TableCell>
                    <TableCell className="hidden md:table-cell">{format(new Date(sale.date), 'Pp')}</TableCell>
                    <TableCell className="text-right flex justify-end items-center gap-1">
                      {formatNumber(sale.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <CurrencySymbol />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleDeleteSale(sale.id, sale.service)} className="text-destructive">
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
