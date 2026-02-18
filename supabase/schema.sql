-- ENUMS
CREATE TYPE job_status AS ENUM ('open', 'assigned', 'submitted', 'scored', 'closed');
CREATE TYPE agent_state AS ENUM ('registered', 'active', 'bidding', 'assigned', 'submitted', 'scored', 'suspended', 'banned');
CREATE TYPE bid_status AS ENUM ('submitted', 'rejected', 'accepted', 'cancelled');
CREATE TYPE contract_status AS ENUM ('active', 'submitted', 'scoring', 'completed', 'failed', 'disputed');
CREATE TYPE deliverable_status AS ENUM ('pending_review', 'accepted', 'rejected');

-- AGENTS TABLE
CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY,
  registered_at BIGINT NOT NULL,
  state agent_state NOT NULL DEFAULT 'registered',
  reputation_score INTEGER NOT NULL DEFAULT 0 CHECK (reputation_score >= 0 AND reputation_score <= 10000),
  completion_rate FLOAT NOT NULL DEFAULT 0.0 CHECK (completion_rate >= 0.0 AND completion_rate <= 1.0),
  total_jobs INTEGER NOT NULL DEFAULT 0,
  failed_jobs INTEGER NOT NULL DEFAULT 0,
  penalizations INTEGER NOT NULL DEFAULT 0,
  suspension_expiry BIGINT,
  api_key_hash TEXT NOT NULL UNIQUE,
  verified_capabilities TEXT[] DEFAULT '{}',
  last_activity BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agents_state ON agents(state);
CREATE INDEX idx_agents_reputation ON agents(reputation_score DESC);
CREATE INDEX idx_agents_api_key ON agents(api_key_hash);

-- JOBS TABLE
CREATE TABLE jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL CHECK (char_length(description) <= 2000),
  required_skills TEXT[] NOT NULL,
  budget_min INTEGER NOT NULL CHECK (budget_min > 0),
  budget_max INTEGER NOT NULL CHECK (budget_max >= budget_min),
  deadline_unix BIGINT NOT NULL,
  status job_status NOT NULL DEFAULT 'open',
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  max_bids_allowed INTEGER NOT NULL DEFAULT 100,
  current_bid_count INTEGER NOT NULL DEFAULT 0,
  selected_agent_id TEXT REFERENCES agents(agent_id),
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_deadline ON jobs(deadline_unix);
CREATE INDEX idx_jobs_client ON jobs(client_id);
CREATE INDEX idx_jobs_expires ON jobs(expires_at);

-- BIDS TABLE
CREATE TABLE bids (
  bid_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  delivery_days INTEGER NOT NULL CHECK (delivery_days >= 1),
  created_at BIGINT NOT NULL,
  status bid_status NOT NULL DEFAULT 'submitted',
  confidence_score FLOAT NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  bid_hash TEXT NOT NULL UNIQUE,
  rejection_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bids_job ON bids(job_id);
CREATE INDEX idx_bids_agent ON bids(agent_id);
CREATE INDEX idx_bids_status ON bids(status);
CREATE INDEX idx_bids_created ON bids(created_at DESC);

-- CONTRACTS TABLE
CREATE TABLE contracts (
  contract_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  bid_id UUID NOT NULL REFERENCES bids(bid_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  deadline_unix BIGINT NOT NULL,
  status contract_status NOT NULL DEFAULT 'active',
  created_at BIGINT NOT NULL,
  submitted_at BIGINT,
  work_hash TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contracts_agent ON contracts(agent_id);
CREATE INDEX idx_contracts_job ON contracts(job_id);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_deadline ON contracts(deadline_unix);

-- DELIVERABLES TABLE
CREATE TABLE deliverables (
  deliverable_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL UNIQUE,
  content_uri TEXT NOT NULL,
  submitted_at BIGINT NOT NULL,
  score INTEGER CHECK (score >= 0 AND score <= 10000),
  feedback TEXT CHECK (char_length(feedback) <= 500),
  status deliverable_status NOT NULL DEFAULT 'pending_review',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_deliverables_contract ON deliverables(contract_id);
CREATE INDEX idx_deliverables_agent ON deliverables(agent_id);
CREATE INDEX idx_deliverables_status ON deliverables(status);

-- REPUTATION TABLE
CREATE TABLE reputation (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(job_id) ON DELETE SET NULL,
  delta INTEGER NOT NULL CHECK (delta >= -1000 AND delta <= 1000),
  reason TEXT NOT NULL CHECK (reason IN ('completion', 'early_delivery', 'late_delivery', 'failed', 'poor_quality', 'non_delivery', 'bid_spam')),
  created_at BIGINT NOT NULL,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_reputation_agent ON reputation(agent_id);
CREATE INDEX idx_reputation_created ON reputation(created_at DESC);

-- RLS POLICIES (Agent Isolation)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation ENABLE ROW LEVEL SECURITY;

-- Agents: Can only read own profile
CREATE POLICY agents_self_read ON agents
  FOR SELECT USING (auth.uid()::text = agent_id);

-- Jobs: Publicly readable (open jobs)
CREATE POLICY jobs_public_read ON jobs
  FOR SELECT USING (status = 'open');

-- Bids: Agents can only read own bids
CREATE POLICY bids_self_read ON bids
  FOR SELECT USING (auth.uid()::text = agent_id);

-- Contracts: Agents can only read own contracts
CREATE POLICY contracts_self_read ON contracts
  FOR SELECT USING (auth.uid()::text = agent_id);

-- Deliverables: Agents can only read own deliverables
CREATE POLICY deliverables_self_read ON deliverables
  FOR SELECT USING (auth.uid()::text = agent_id);

-- Reputation: Public read (for scoring)
CREATE POLICY reputation_public_read ON reputation
  FOR SELECT USING (true);
