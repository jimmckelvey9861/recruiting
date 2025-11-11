export interface SourceOption {
  key: string;
  label: string;
  color: string;
  baseCount: number;
}

export const SOURCE_OPTIONS: SourceOption[] = [
  { key: 'indeed', label: 'Indeed', color: '#2563eb', baseCount: 42 },
  { key: 'facebook', label: 'Facebook', color: '#16a34a', baseCount: 34 },
  { key: 'craigslist', label: 'Craigslist', color: '#f59e0b', baseCount: 22 },
  { key: 'referrals', label: 'Referrals', color: '#7c3aed', baseCount: 28 },
  { key: 'qr_posters', label: 'QR Posters', color: '#dc2626', baseCount: 18 },
  { key: 'glassdoor', label: 'Glassdoor', color: '#0ea5e9', baseCount: 24 },
  { key: 'linkedin', label: 'LinkedIn', color: '#1d4ed8', baseCount: 26 },
  { key: 'instagram', label: 'Instagram', color: '#db2777', baseCount: 20 },
  { key: 'jobfair', label: 'Job Fairs', color: '#f97316', baseCount: 16 },
  { key: 'walkins', label: 'Walk-ins', color: '#14b8a6', baseCount: 19 },
];

export const SOURCE_COLORS: Record<string, string> = SOURCE_OPTIONS.reduce((acc, option) => {
  acc[option.key] = option.color;
  return acc;
}, {} as Record<string, string>);

export const SOURCE_LABELS: Record<string, string> = SOURCE_OPTIONS.reduce((acc, option) => {
  acc[option.key] = option.label;
  return acc;
}, {} as Record<string, string>);
