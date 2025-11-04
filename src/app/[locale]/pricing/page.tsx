
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
import { Switch } from '@/components/ui/switch';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking, addDocumentNonBlocking } from '@/firebase';
import type { Price as ServicePrice } from '@/types';
import { collection, doc, orderBy, query } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Check, X, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { seedDefaultServices } from '@/lib/services';
import { CurrencySymbol } from '@/components/currency-symbol';
import { useFormatter } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

const EditableCell = ({ 
  value, 
  onSave, 
  isEditable = true,
  isNumeric = true 
}: { 
  value: number | string; 
  onSave: (newValue: number | string) => void, 
  isEditable?: boolean,
  isNumeric?: boolean
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [currentValue, setCurrentValue] = React.useState(value);
  const formatNumber = useFormatter().number;

  React.useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const handleSave = () => {
    onSave(currentValue);
    setIsEditing(false);
  };
  
  const handleEditClick = () => {
    if (isEditable) {
        setCurrentValue(value);
        setIsEditing(true);
    }
  };


  if (isEditing) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <Input
          type={isNumeric ? "number" : "text"}
          value={currentValue}
          onChange={(e) => setCurrentValue(isNumeric ? Number(e.target.value) : e.target.value)}
          className="h-8 w-24"
        />
        <Button size="icon" className="h-8 w-8" onClick={handleSave}><Check className="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setIsEditing(false)}><X className="h-4 w-4" /></Button>
      </div>
    );
  }

  if (isNumeric) {
    return (
      <div onClick={handleEditClick} className={cn("flex items-center justify-end gap-1", {"cursor-pointer": isEditable})}>
        {formatNumber(Number(value), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <CurrencySymbol />
      </div>
    );
  }

  return (
    <div onClick={handleEditClick} className={cn({"cursor-pointer": isEditable})}>
      {String(value)}
    </div>
  )
};


function AddServiceDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [needsSize, setNeedsSize] = React.useState(false);
  const [hasCoupon, setHasCoupon] = React.useState(false);
  const [price, setPrice] = React.useState(0);
  const [commission, setCommission] = React.useState(0);
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const handleAddService = async () => {
    if (!firestore || !user || !name.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Service name is required.' });
      return;
    }

    const servicesCollection = collection(firestore, 'users', user.uid, 'services');
    
    // Get the highest order number to place the new service at the end
    const snapshot = await getDocs(query(servicesCollection, orderBy('order', 'desc'), doc('limit', 1)));
    const lastOrder = snapshot.docs.length > 0 ? snapshot.docs[0].data().order : 0;

    const newService: Omit<ServicePrice, 'id'> = {
      name: name.trim(),
      needsSize,
      hasCoupon,
      order: lastOrder + 1,
      prices: {
        default: {
          price,
          commission,
          couponCommission: hasCoupon ? 0 : undefined,
        }
      }
    };
    
    await addDocumentNonBlocking(servicesCollection, newService);
    
    toast({ title: 'Service Added', description: `${name} has been added.` });
    setOpen(false);
    setName('');
    setNeedsSize(false);
    setHasCoupon(false);
    setPrice(0);
    setCommission(0);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
         <Button size="sm" className="h-8 gap-1">
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Add Service
            </span>
          </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Service</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="service-name" className="text-right">Name</Label>
            <Input id="service-name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" />
          </div>
           <div className="flex items-center justify-between col-span-4">
            <Label htmlFor="needs-size">Requires Car Size</Label>
            <Switch id="needs-size" checked={needsSize} onCheckedChange={setNeedsSize} />
          </div>
          <div className="flex items-center justify-between col-span-4">
            <Label htmlFor="has-coupon">Has Coupon Option</Label>
            <Switch id="has-coupon" checked={hasCoupon} onCheckedChange={setHasCoupon} />
          </div>
           {!needsSize && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="default-price" className="text-right">Default Price</Label>
                <Input id="default-price" type="number" value={price} onChange={e => setPrice(Number(e.target.value))} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="default-commission" className="text-right">Default Commission</Label>
                <Input id="default-commission" type="number" value={commission} onChange={e => setCommission(Number(e.target.value))} className="col-span-3" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleAddService}>Add Service</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default function PricingPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSeeding, setIsSeeding] = React.useState(false);

  const servicesQuery = useMemoFirebase(
    () => (firestore && user ? query(collection(firestore, 'users', user.uid, 'services'), orderBy('order')) : null),
    [firestore, user]
  );
  const { data: services, isLoading } = useCollection<ServicePrice>(servicesQuery);

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  React.useEffect(() => {
    const handleSeeding = async () => {
        if (firestore && user && !isLoading && services && services.length === 0 && !isSeeding) {
            setIsSeeding(true);
            toast({
                title: 'Setting up your services...',
                description: 'Please wait while we create the default service prices for your account.',
            });
            await seedDefaultServices(firestore, user.uid);
            // Data will be re-fetched by useCollection automatically.
            setIsSeeding(false);
        }
    };
    handleSeeding();
  }, [firestore, user, services, isLoading, isSeeding, toast]);
  
  const handleUpdate = (serviceId: string, updatedData: Partial<ServicePrice>) => {
    if (!firestore || !user) return;
    const serviceRef = doc(firestore, 'users', user.uid, 'services', serviceId);
    setDocumentNonBlocking(serviceRef, updatedData, { merge: true });
    toast({
      title: 'Service Updated',
      description: 'The service details have been successfully updated.',
    });
  };

  const handleSizeNameChange = (service: ServicePrice, oldSize: string, newSize: string) => {
    if (!newSize || newSize === oldSize) return;

    const newPrices = { ...service.prices };
    newPrices[newSize] = newPrices[oldSize];
    delete newPrices[oldSize];

    handleUpdate(service.id, { prices: newPrices });
  };


  if (isUserLoading || !user || isLoading || isSeeding) {
    return <div>Loading...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-headline">Service Pricing</CardTitle>
          <CardDescription>
            A breakdown of car wash services and their pricing structure. Click on a value to edit it.
          </CardDescription>
        </div>
        <AddServiceDialog />
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {services?.map((service) => (
            <div key={service.id}>
              <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold font-headline">
                    <EditableCell
                      value={service.name}
                      onSave={(newValue) => handleUpdate(service.id, { name: String(newValue) })}
                      isNumeric={false}
                    />
                  </h3>
                  <div className="flex items-center gap-4">
                      <div className="flex items-center space-x-2">
                        <Label htmlFor={`coupon-switch-${service.id}`}>Has Coupon</Label>
                        <Switch
                          id={`coupon-switch-${service.id}`}
                          checked={service.hasCoupon}
                          onCheckedChange={(checked) => handleUpdate(service.id, { hasCoupon: checked })}
                        />
                      </div>
                  </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{service.needsSize ? 'Car Size' : 'Service'}</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Coupon Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(service.prices).sort(([, a], [, b]) => (a.price || 0) - (b.price || 0)).map(([size, details]) => (
                    <TableRow key={size}>
                      <TableCell className="font-medium capitalize">
                        {service.needsSize ? (
                          <EditableCell
                            value={size.replace('-', ' ')}
                            onSave={(newValue) => handleSizeNameChange(service, size, String(newValue).replace(' ', '-'))}
                            isNumeric={false}
                          />
                        ) : (
                          service.name
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                         <EditableCell 
                            value={details.price} 
                            onSave={(newValue) => handleUpdate(service.id, { prices: { ...service.prices, [size]: { ...details, price: Number(newValue) } } })}
                         />
                      </TableCell>
                       <TableCell className="text-right">
                         <EditableCell 
                            value={details.commission} 
                            onSave={(newValue) => handleUpdate(service.id, { prices: { ...service.prices, [size]: { ...details, commission: Number(newValue) } } })}
                         />
                      </TableCell>
                      <TableCell className="text-right">
                        {service.hasCoupon ? (
                           <EditableCell 
                              value={details.couponCommission ?? 0}
                              onSave={(newValue) => handleUpdate(service.id, { prices: { ...service.prices, [size]: { ...details, couponCommission: Number(newValue) } } })}
                           />
                        ) : (
                          <Badge variant="outline" className="ml-2">N/A</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
