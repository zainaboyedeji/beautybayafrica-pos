export type CloudinaryUrl = `https://res.cloudinary.com/${string}`;

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  /** What the shop paid for one unit. */
  costPrice?: number;
  imageUrl?: CloudinaryUrl;
}

export interface Inventory {
  productId: string;
  quantity: number;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  /** Product name at the time of sale. */
  name?: string;
  quantity: number;
  unitPrice: number;
  /** Cost price at the time of sale, when known. */
  unitCost?: number;
}

export type PaymentMethod = "transfer" | "card";

export interface Customer {
  name: string;
  phone: string;
  email?: string;
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  paymentMethod: PaymentMethod;
  customer: Customer;
  createdAt: string;
}
