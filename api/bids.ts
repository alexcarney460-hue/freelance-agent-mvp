import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiKey, validateBidRequest } from './auth';
import * as crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 401 });

  const agentId = await verifyApiKey(apiKey);
  if (!agentId) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });

  const body = await req.json();
  const validation = validateBidRequest(body);
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

  const { job_id, amount, delivery_days, confidence_score } = body;

  try {
    // Check agent state
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('state, reputation_score, last_activity')
      .eq('agent_id', agentId)
      .single();

    if (agentErr || !agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    if (agent.state === 'suspended' || agent.state === 'banned') return NextResponse.json({ error: 'Agent suspended or banned' }, { status: 403 });
    if (agent.reputation_score < 500) return NextResponse.json({ error: 'Reputation too low' }, { status: 403 });

    // Check bid flood
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;
    const { data: recentBids, error: recentErr } = await supabase
      .from('bids')
      .select('bid_id', { count: 'exact' })
      .eq('agent_id', agentId)
      .gt('created_at', oneDayAgo);

    if (!recentErr && recentBids && recentBids.length >= 20) {
      await supabase
        .from('reputation')
        .insert([{ agent_id: agentId, job_id, delta: -500, reason: 'bid_spam', created_at: now }]);
      return NextResponse.json({ error: 'Bid limit exceeded' }, { status: 429 });
    }

    // Check job exists and is open
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('*')
      .eq('job_id', job_id)
      .single();

    if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (job.status !== 'open') return NextResponse.json({ error: 'Job not open' }, { status: 400 });
    if (job.current_bid_count >= job.max_bids_allowed) return NextResponse.json({ error: 'Job bid limit reached' }, { status: 400 });
    if (amount < job.budget_min || amount > job.budget_max) return NextResponse.json({ error: 'Amount out of range' }, { status: 400 });
    if (delivery_days > (job.deadline_unix - now) / 86400) return NextResponse.json({ error: 'Delivery exceeds deadline' }, { status: 400 });

    // Create bid
    const bidHash = crypto.createHash('sha256').update(job_id + agentId + amount).digest('hex');
    
    const { data: bid, error: bidErr } = await supabase
      .from('bids')
      .insert([{
        job_id,
        agent_id: agentId,
        amount,
        delivery_days,
        created_at: now,
        confidence_score,
        bid_hash: bidHash,
        status: 'submitted'
      }])
      .select()
      .single();

    if (bidErr) throw bidErr;

    // Update job bid count
    await supabase
      .from('jobs')
      .update({ current_bid_count: job.current_bid_count + 1 })
      .eq('job_id', job_id);

    return NextResponse.json(bid, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const jobId = new URL(req.url).searchParams.get('job_id');
  if (!jobId) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 });

  try {
    const { data: bids, error } = await supabase
      .from('bids')
      .select('*')
      .eq('job_id', jobId)
      .eq('status', 'submitted')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ bids: bids || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
