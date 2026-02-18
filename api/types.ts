export type JobStatus = 'open' | 'assigned' | 'submitted' | 'scored' | 'closed';
export type AgentState = 'registered' | 'active' | 'bidding' | 'assigned' | 'submitted' | 'scored' | 'suspended' | 'banned';
export type BidStatus = 'submitted' | 'rejected' | 'accepted' | 'cancelled';
export type ContractStatus = 'active' | 'submitted' | 'scoring' | 'completed' | 'failed' | 'disputed';
export type DeliverableStatus = 'pending_review' | 'accepted' | 'rejected';

export interface Job {
  job_id: string;
  client_id: string;
  title: string;
  description: string;
  required_skills: string[];
  budget_min: number;
  budget_max: number;
  deadline_unix: number;
  status: JobStatus;
  created_at: number;
  expires_at: number;
  max_bids_allowed: number;
  current_bid_count: number;
  selected_agent_id: string | null;
}

export interface Agent {
  agent_id: string;
  registered_at: number;
  state: AgentState;
  reputation_score: number;
  completion_rate: number;
  total_jobs: number;
  failed_jobs: number;
  penalizations: number;
  suspension_expiry: number | null;
  verified_capabilities: string[];
  last_activity: number;
}

export interface Bid {
  bid_id: string;
  job_id: string;
  agent_id: string;
  amount: number;
  delivery_days: number;
  created_at: number;
  status: BidStatus;
  confidence_score: number;
  bid_hash: string;
  rejection_reason: string | null;
}

export interface Contract {
  contract_id: string;
  job_id: string;
  agent_id: string;
  bid_id: string;
  amount: number;
  deadline_unix: number;
  status: ContractStatus;
  created_at: number;
  submitted_at: number | null;
  work_hash: string | null;
}

export interface Deliverable {
  deliverable_id: string;
  contract_id: string;
  agent_id: string;
  job_id: string;
  content_hash: string;
  content_uri: string;
  submitted_at: number;
  score: number | null;
  feedback: string | null;
  status: DeliverableStatus;
}
