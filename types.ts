export enum Tab {
  DASHBOARD = 'DASHBOARD',
  SCRIPT = 'SCRIPT',
  ASSISTANT = 'ASSISTANT'
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'UPLOAD' | 'SUCCESS' | 'ERROR';
  message: string;
}

export interface MockFile {
  name: string;
  size: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  subtitle?: string;
}