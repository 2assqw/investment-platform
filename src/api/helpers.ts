import { getCompany } from '../db';
import { IndustrySupportInfo } from '../types';
import { getIndustrySupport } from '../classification';
import { runValidation } from '../validation';

export async function getIndustryInfo(
  db: D1Database,
  ticker: string,
): Promise<{ support: IndustrySupportInfo; warnings: string[] }> {
  const company = await getCompany(db, ticker);
  const support = getIndustrySupport(company?.sector ?? '', company?.industry ?? '');

  // Start with industry-level warnings
  const industryWarnings: string[] = [];
  if (support.level === 'FAIL' && support.reason) {
    industryWarnings.push(support.reason);
  } else if (support.level === 'WARNING' && support.reason) {
    industryWarnings.push(support.reason);
  }

  // Run score validation and merge
  const { allWarnings } = await runValidation(db, ticker, support.level, industryWarnings);

  return {
    support: { level: support.level, reason: support.reason },
    warnings: allWarnings,
  };
}
