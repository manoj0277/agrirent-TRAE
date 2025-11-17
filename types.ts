


export enum UserRole {
    Farmer = 'Farmer',
    Supplier = 'Supplier',
    Admin = 'Admin',
}

export interface User {
    id: number;
    name: string;
    email: string;
    password?: string;
    phone: string;
    role: UserRole;
    profilePicture?: string;
    age?: number;
    gender?: 'Male' | 'Female' | 'Other' | 'Prefer not to say';
    location?: string;
    status: 'approved' | 'pending' | 'suspended';
    avgRating?: number;
    blockedDates?: string[];
    locationCoords?: { lat: number; lng: number; };
    aadharImageUrl?: string;
    personalPhotoUrl?: string;
}

export enum ItemCategory {
    Tractors = 'Tractors',
    Harvesters = 'Harvesters',
    JCB = 'JCB',
    Workers = 'Workers',
    Drones = 'Drones',
    Sprayers = 'Sprayers',
    Drivers = 'Drivers',
    Borewell = 'Borewell',
}

export const WORK_PURPOSES = [
    'Ploughing',
    'Sowing / Planting',
    'Harvesting',
    'Spraying Pesticides/Fertilizers',
    'Weeding',
    'Irrigation',
    'Land Levelling',
    'Digging / Earth Moving',
    'Transportation',
    'Monitoring'
] as const;

export const CATEGORY_WORK_PURPOSES: Record<ItemCategory, WorkPurpose[]> = {
    [ItemCategory.Tractors]: ['Ploughing', 'Sowing / Planting', 'Weeding', 'Land Levelling', 'Transportation'],
    [ItemCategory.Harvesters]: ['Harvesting'],
    [ItemCategory.JCB]: ['Digging / Earth Moving', 'Land Levelling'],
    [ItemCategory.Workers]: ['Sowing / Planting', 'Harvesting', 'Weeding', 'Spraying Pesticides/Fertilizers', 'Irrigation'],
    [ItemCategory.Drones]: ['Spraying Pesticides/Fertilizers', 'Monitoring'],
    [ItemCategory.Sprayers]: ['Spraying Pesticides/Fertilizers'],
    [ItemCategory.Drivers]: ['Transportation'],
    [ItemCategory.Borewell]: ['Irrigation']
};

export type WorkPurpose = typeof WORK_PURPOSES[number];

export interface SeasonalPrice {
    name: string; // e.g., "Harvest Season Rate"
    priceModifier: number; // e.g., 1.25 for 25% increase, 0.9 for 10% discount
    startDate: string; // "MM-DD"
    endDate: string; // "MM-DD"
}

export interface Item {
    id: number;
    name: string;
    category: ItemCategory;
    purposes: { name: WorkPurpose, price: number }[];
    images: string[];
    ownerId: number;
    location: string;
    available: boolean;
    status: 'approved' | 'pending' | 'rejected';
    description: string;
    currentLocation?: { lat: number, lng: number }; // For trackable items
    locationCoords?: { lat: number, lng: number }; // For distance calculation
    operatorCharge?: number;
    avgRating?: number;
    quantityAvailable?: number;
    seasonalPrices?: SeasonalPrice[];
    // New fields for machines
    model?: string;
    licensePlate?: string;
    year?: number;
    horsepower?: number;
    condition?: 'New' | 'Good' | 'Fair';
    gender?: 'Male' | 'Female';
    autoPriceOptimization?: boolean;
}

export interface Booking {
    id: string;
    farmerId: number;
    supplierId?: number;
    itemId?: number;
    itemCategory: ItemCategory;
    date: string;
    startTime: string;
    estimatedDuration: number;
    location: string;
    paymentId?: string;
    status: 'Searching' | 'Awaiting Operator' | 'Confirmed' | 'Arrived' | 'In Process' | 'Pending Payment' | 'Completed' | 'Cancelled' | 'Expired' | 'Pending Confirmation';
    additionalInstructions?: string;
    workPurpose?: WorkPurpose;
    preferredModel?: string;
    operatorRequired?: boolean;
    recurrenceId?: string;
    disputeResolved?: boolean;
    disputeRaised?: boolean;
    damageReported?: boolean;
    estimatedPrice?: number;
    advanceAmount?: number;
    finalPrice?: number;
    distanceCharge?: number;
    paymentMethod?: 'Cash' | 'Online' | 'UPI' | 'Card' | 'Wallet';
    advancePaymentId?: string;
    finalPaymentId?: string;
    discountAmount?: number;
    quantity?: number;
    allowMultipleSuppliers?: boolean;
    operatorId?: number;
    isRebroadcast?: boolean;
    // OTP-based start
    otpCode?: string;
    otpVerified?: boolean;
    workStartTime?: string;
    workEndTime?: string;
    // Payment details after completion
    farmerPaymentAmount?: number;
    supplierPaymentAmount?: number;
    adminCommission?: number;
    paymentDetails?: {
        farmerAmount: number;
        supplierAmount: number;
        commission: number;
        totalAmount: number;
        paymentDate: string;
        method?: 'Cash' | 'Online';
    };
}

export interface Review {
    id: number;
    itemId?: number;
    ratedUserId?: number;
    bookingId: string;
    reviewerId: number;
    rating: number;
    comment: string;
}

export interface ChatMessage {
    id: number;
    chatId: string; // Composite key for the chat room, e.g., '1-2' for users or 'post-1' for forum
    senderId: number;
    receiverId: number; // Can be a user ID or 0 for a group/post chat
    text: string;
    timestamp: string;
    read: boolean;
    isBotMessage?: boolean;
}

export interface CommunityReply {
    id: number;
    authorId: number;
    content: string;
    timestamp: string;
}

export interface ForumPost {
    id: number;
    authorId: number;
    title: string;
    content: string;
    timestamp: string;
    replies: CommunityReply[];
}

export interface DamageReport {
    id: number;
    bookingId: string;
    itemId: number;
    reporterId: number;
    description: string;
    status: 'pending' | 'resolved';
    timestamp: string;
}

export interface Notification {
    id: number;
    userId: number; // 0 for broadcast
    message: string;
    type: 'booking' | 'offer' | 'community' | 'admin' | 'coupon' | 'news' | 'update';
    read: boolean;
    timestamp: string;
}

export interface SupportReply {
    id: number;
    authorId: number;
    text: string;
    timestamp: string;
}

export interface SupportTicket {
    id: number;
    userId?: number;
    name: string;
    email: string;
    message: string;
    status: 'open' | 'closed' | 'escalated' | 'pending';
    timestamp: string;
    replies?: SupportReply[];
    category?: 'Machine' | 'Payment' | 'Booking' | 'Behaviour';
    subcategory?: string;
    againstUserId?: number;
    bookingId?: string;
    evidenceUrls?: string[];
    priority?: 'Low' | 'Med' | 'High';
    adminNotes?: string[];
}

export interface AiChatMessage {
    id: number;
    role: 'user' | 'ai';
    text: string;
    timestamp: string;
}


export type AppView =
    | { view: 'HOME' }
    | { view: 'ITEM_DETAIL'; item: Item }
    | { view: 'BOOKING_FORM', category?: ItemCategory, quantity?: number, item?: Item, workPurpose?: WorkPurpose }
    | { view: 'BOOKING_SUCCESS', isDirectRequest?: boolean, paymentType?: 'now' | 'later' }
    | { view: 'RATE_ITEM'; booking: Booking }
    | { view: 'RATE_USER'; booking: Booking }
    | { view: 'CHAT'; chatPartner: User, item?: Item }
    | { view: 'CONVERSATIONS' }
    | { view: 'SUPPORT' }
    | { view: 'ADMIN_DASHBOARD' }
    | { view: 'MANAGE_USERS' }
    | { view: 'MANAGE_ITEMS' }
    | { view: 'MANAGE_BOOKINGS' }
    | { view: 'ADMIN_ANALYTICS' }
    | { view: 'TRACKING', item: Item }
    | { view: 'REPORT_DAMAGE', booking: Booking }
    | { view: 'AI_ASSISTANT' }
    | { view: 'VOICE_ASSISTANT' }
    | { view: 'AI_SCAN' }
    | { view: 'MANAGE_SUPPORT_TICKETS' }
    | { view: 'MY_ACCOUNT' }
    | { view: 'SETTINGS' }
    | { view: 'PAYMENT_HISTORY' }
    | { view: 'POLICY' }
    | { view: 'COMMUNITY' }
    | { view: 'CROP_CALENDAR' };

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FraudFlag {
    id: string;
    type: 'Farmer' | 'Supplier' | 'Payment';
    userId?: number;
    bookingId?: string;
    reason: string;
    score: number;
    risk: RiskLevel;
    timestamp: string;
}

export interface KycDocument {
    type: 'Aadhaar' | 'PAN' | 'Photo' | 'GST' | 'MachineProof' | 'BankPassbook';
    url?: string;
    status: 'Submitted' | 'Approved' | 'Rejected' | 'ReuploadRequested';
    notes?: string;
}

export interface KycSubmission {
    id: number;
    userId: number;
    docs: KycDocument[];
    status: 'Pending' | 'Approved' | 'Rejected';
    riskLevel?: RiskLevel;
    submittedAt: string;
    adminNotes?: string[];
    geo?: { lat: number; lng: number };
}