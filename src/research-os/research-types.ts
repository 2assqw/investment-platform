export interface Hypothesis {
  id: number;
  title: string;
  description: string;
  author: string;
  status: 'IDEA' | 'TESTING' | 'VALIDATED' | 'REJECTED' | 'RETIRED';
  created_at: string;
}

export interface Experiment {
  id: number;
  hypothesis_id: number;
  factor_id: string;
  result: string | null;
  alpha: number;
  sharpe: number;
  created_at: string;
}

export interface ResearchNote {
  id: number;
  title: string;
  content: string;
  tags: string;
  created_at: string;
}

export interface ResearchDecision {
  id: number;
  action: string;
  target: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string;
  created_at: string;
}

export interface ResearchDashboard {
  activeHypotheses: number;
  validatedHypotheses: number;
  rejectedHypotheses: number;
  totalExperiments: number;
  activeExperiments: number;
  notes: number;
  decisions: number;
  recentDecisions: ResearchDecision[];
}
