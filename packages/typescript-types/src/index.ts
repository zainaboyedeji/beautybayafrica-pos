export type CloudinaryUrl = `https://res.cloudinary.com/${string}`;

/** One option of a product, such as a shade or size, with its own stock. */
export interface ProductVariant {
  id: string;
  /** What sets this option apart, e.g. "Ruby Red" or "50ml". */
  name: string;
  sku: string;
  price: number;
  costPrice?: number;
  barcode?: string;
  /** Copied from the online shop, which sets its selling price. */
  fromWebsite?: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  /** What the shop paid for one unit. */
  costPrice?: number;
  /** Scannable code (EAN, UPC, …), kept as text so leading zeros survive. */
  barcode?: string;
  imageUrl?: CloudinaryUrl;
  /** e.g. Skincare or Hair care. */
  category?: string;
  /** Copied from the online shop, which sets its selling price. */
  fromWebsite?: boolean;
  /**
   * When present, the product is sold by option and each option has its own
   * price and stock; `price` is then the lowest option price.
   */
  variants?: ProductVariant[];
}

export interface Inventory {
  productId: string;
  /** Set for an option's stock; a product with options also gets a total row. */
  variantId?: string;
  quantity: number;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  /** The option sold, for products with options. */
  variantId?: string;
  /** Product name (and option) at the time of sale. */
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

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  /** What they supply, account details, terms and so on. */
  notes?: string;
  createdAt: string;
}

export type ExpensePaymentMethod = "cash" | "transfer" | "card";

export interface Expense {
  id: string;
  /** The day the money was spent, as YYYY-MM-DD. */
  spentOn: string;
  description: string;
  category: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  supplierId?: string;
  /** Saved with the expense, so it stays readable if the supplier is removed. */
  supplierName?: string;
  notes?: string;
  createdAt: string;
}

export type RequestStatus = "pending" | "approved" | "rejected" | "done";

/** "pin_reset": a staff member asking the admin for a new PIN. */
export type RequestKind = "general" | "pin_reset";

/** An official request made in the store, and the admin's decision on it. */
export interface StoreRequest {
  id: string;
  kind: RequestKind;
  title: string;
  details?: string;
  requestedBy: string;
  /** The staff member who asked, when known (for PIN requests). */
  staffId?: string;
  amount?: number;
  status: RequestStatus;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  paymentMethod: PaymentMethod;
  customer: Customer;
  createdAt: string;
}

/** Something done in the POS, for the admin's activity log. */
export type ActivityAction =
  | "login"
  | "login_failed"
  | "sale"
  | "product_added"
  | "product_updated"
  | "inventory_imported"
  | "customer_added"
  | "staff_added"
  | "staff_updated"
  | "staff_removed"
  | "pin_reset"
  | "supplier_added"
  | "supplier_updated"
  | "supplier_removed"
  | "expense_recorded"
  | "expense_deleted"
  | "request_made"
  | "pin_requested"
  | "request_decided";

export interface ActivityEntry {
  id: string;
  at: string;
  /** "visitor" is someone not logged in (a failed login or PIN request). */
  actorRole: "admin" | "staff" | "visitor";
  actorName: string;
  action: ActivityAction;
  summary: string;
}
