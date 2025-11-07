
export interface Settings {
    maxLength: number;
    minDuration: number;
    gap: number;
    lines: 'Single' | 'Double';
}

export type OutputLanguage = 'Thanglish' | 'English';

export interface HistoryItem {
    name: string;
    content: string;
    timestamp: number;
}
