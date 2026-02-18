import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function verifyApiKey(apiKey: string): Promise<string | null> {
  const hash = require('crypto').createHash('sha256').update(apiKey).digest('hex');
  
  const { data, error } = await supabase
    .from('agents')
    .select('agent_id, state')
    .eq('api_key_hash', hash)
    .single();

  if (error || !data) return null;
  if (data.state === 'banned' || data.state === 'suspended') return null;

  // Update last_activity
  await supabase
    .from('agents')
    .update({ last_activity: Math.floor(Date.now() / 1000) })
    .eq('agent_id', data.agent_id);

  return data.agent_id;
}

export function validateBidRequest(body: any): {valid: boolean; error?: string} {
  const { job_id, amount, delivery_days, confidence_score } = body;
  
  if (!job_id || typeof job_id !== 'string') return {valid: false, error: 'Invalid job_id'};
  if (!amount || typeof amount !== 'number' || amount <= 0) return {valid: false, error: 'Invalid amount'};
  if (!delivery_days || typeof delivery_days !== 'number' || delivery_days < 1) return {valid: false, error: 'Invalid delivery_days'};
  if (typeof confidence_score !== 'number' || confidence_score < 0 || confidence_score > 1) return {valid: false, error: 'Invalid confidence_score'};

  return {valid: true};
}
