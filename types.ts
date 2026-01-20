
export interface SchoolReport {
  id: string;
  schoolName: string;
  district: string;
  province: string;
  issues: string;
  timestamp: number;
}

export interface Feedback {
  id: string;
  role: string;
  message: string;
  timestamp: number;
}

export interface AIInsight {
  summary: string;
  priorities: string[];
  suggestedResources: string[];
}

export enum UserRole {
  ADMIN = 'admin',
  OFFICER = 'officer'
}
