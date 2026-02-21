export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

export enum LabType {
  LONG_LIFE = 'LONG_LIFE',
  THYROCARE = 'THYROCARE'
}

export interface CustomRate {
  testId: string;
  yourRate: number;
  testName?: string;
  mrp?: number;
}

export interface DiagnosticTest {
  id: string;
  name: string;
  category: string;
  longLifePrice: number;
  thyrocarePrice: number;
  mrp?: number;
}

export interface Advertisement {
  id: string;
  note: string;
  isActive: boolean;
  targetUserIds: string[];
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'VIDEO';
}

export interface Transaction {
  id: string;
  hubId: string;
  hubName: string;
  amount: number;
  date: number;
  paymentMode: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  patientName: string;
  patientAgeYears: string;
  patientAgeMonths: string;
  patientGender?: string;
  patientContact?: string;
  patientAddress?: string;
  pincode?: string;
  refDoc: string;
  tests: DiagnosticTest[];
  totalAmount: number;
  totalMrp: number;
  lab: LabType;
  status: 'PICK_UP_PENDING' | 'PICKED_UP' | 'READY' | 'CANCELLED';
  rejectReason?: string;
  date: number;
  reportUrl?: string;
}

export interface User {
  id: string;
  name: string;
  clinicName?: string;
  role: UserRole;
  totalPaid: number;
  khataLimit?: number; // Maximum allowed dues before blocking reports
  monthlyTarget?: number; // Manual target setting for incentives
  walletBalance: number;
  walletLimit?: number;
  paymentMode?: 'DAILY' | 'LIMIT';
  email?: string;
  contactNumber?: string;
  address?: string;
  password?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  isDeleted?: boolean;
  allowedLabs?: LabType[];
  customRates?: {
    [key in LabType]?: CustomRate[];
  };
}