export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  purchasePrice?: number;
};

export type Order = {
  id: string;
  supplier: string;
  date: string; // ISO 8601 date string
  status: 'Pending' | 'Shipped' | 'Received' | 'Cancelled';
  total: number;
};

export type CarWashSale = {
  id: string;
  service: string;
  staffName: string;
  carSize?: string;
  date: string; // ISO 8601 date string
  amount: number;
  commission: number;
  hasCoupon: boolean;
  paymentMethod?: 'coupon' | 'cash' | 'machine' | 'not-paid' | 'free-loyalty';
  waxAddOn: boolean;
  isPaid: boolean;
  
  // Commercial POS Additions
  transactionId?: string;
  invoiceNo?: string;
  customerPhone?: string;
  customerName?: string;
  status?: 'pending' | 'in-progress' | 'completed' | 'delivered';
  isLoyaltyClaimed?: boolean;
};

export type Customer = {
  phone: string;
  name: string;
  washCount: number; // Current active stamps (0 to 5)
  totalWashes: number; // Lifetime completed washes
  lastWashDate?: string;
};


export type Price = {
  id: string;
  name: string;
  needsSize: boolean;
  hasCoupon: boolean;
  order: number;
  imageUrl?: string; // Optional service card background image (base64 or URL)
  prices: {
    [size: string]: {
      price: number;
      commission: number;
      couponCommission?: number;
    }
  }
};

export type Staff = {
  id: string;
  name: string;
};

export type Activity = {
  id: string;
  activity: 'Sale' | 'Inventory' | 'Order';
  item: string;
  status: 'Completed' | 'Low Stock' | 'Out of Stock' | 'Shipped' | 'Pending';
  date: string;
};

