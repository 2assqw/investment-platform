import { FactorInput, AllFactors } from './factor-types';
import { growthConsistencyFactor } from './growth-consistency';
import { shareholderAlignmentFactor } from './shareholder-alignment';
import { cashConversionFactor } from './cash-conversion';

export function computeAllFactors(input: FactorInput): AllFactors {
  return {
    growthConsistency: growthConsistencyFactor.calculate(input),
    shareholderAlignment: shareholderAlignmentFactor.calculate(input),
    cashConversion: cashConversionFactor.calculate(input),
  };
}

export { growthConsistencyFactor, shareholderAlignmentFactor, cashConversionFactor };
