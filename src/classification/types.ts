export type SupportLevel = 'PASS' | 'WARNING' | 'FAIL';

export interface IndustrySupport {
  level: SupportLevel;
  reason: string | null;
}

export interface IndustryCoverage {
  level: SupportLevel;
  reason?: string;
}
