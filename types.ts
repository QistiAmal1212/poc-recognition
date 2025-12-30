
export interface UserFaceProfile {
  id: string;
  name: string;
  descriptor: number[]; // Flat array representing the facial features
  capturedAt: number;
  lastClockIn?: string; // Format: YYYY-MM-DD
}

export interface AttendanceRecord {
  id: string;
  name: string;
  date: string;
  time: string;
  timestamp: number;
}

export enum AppState {
  LOADING_MODELS = 'LOADING_MODELS',
  READY = 'READY',
  REGISTERING = 'REGISTERING',
  VERIFYING = 'VERIFYING',
  ERROR = 'ERROR'
}

export interface RecognitionResult {
  match: boolean;
  distance: number;
  label?: string;
  clockInStatus?: 'success' | 'already' | 'none';
  time?: string;
}
