export interface User {
  id: string;
  name: string;
  email: string;
  studentNumber: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudentEnrollment {
  userId: string;
  classId: string;
  tokensRemaining: number;
  tokenStatus: 'unused' | 'used';
  biddingResult: 'pending' | 'won' | 'lost';
  createdAt?: string;
  updatedAt?: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  studentNumber?: string; // Added student number field
  hasUsedToken?: boolean; // Now optional - specific to class enrollment
  hasBid?: boolean; // Now optional - specific to class enrollment
  // Additional fields for normalized schema compatibility
  tokensRemaining?: number;
  tokenStatus?: 'unused' | 'used'; // Already optional
  biddingResult?: 'pending' | 'won' | 'lost'; // Already optional
  enrollments?: StudentEnrollment[];
}


export interface BidOpportunity {
  id: string;
  date: string; // ISO date string
  bidOpenDate?: string; // ISO date string for when bidding opens
  bidCloseDate?: string; // ISO date string for when bidding closes
  title: string;
  description: string;
  bidders: Student[];
  selectedStudents: Student[];
  isOpen: boolean;
  capacity?: number; // Add capacity field for individual opportunities
}

export interface ClassConfig {
  id: string;
  className: string;
  rewardTitle: string;
  capacity: number;
  students: Student[];
  bidders: Student[];
  selectedStudents: Student[];
  bidOpportunities: BidOpportunity[];
}
