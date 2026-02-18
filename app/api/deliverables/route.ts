import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiKey } from '@/api/auth';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 401 });

  const agentId = await verifyApiKey(apiKey);
  if (!agentId) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });

  const { contract_id, content_hash, content_uri } = await req.json();
  if (!contract_id || !content_hash || !content_uri) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    const { data: contract, error: contractErr } = await supabase
      .from('contracts')
      .select('*')
      .eq('contract_id', contract_id)
      .single();

    if (contractErr || !contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    if (contract.agent_id !== agentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    if (contract.status !== 'active') return NextResponse.json({ error: 'Contract not active' }, { status: 400 });

    const now = Math.floor(Date.now() / 1000);

    // Check deadline
    if (now > contract.deadline_unix + 21600) { // 6h grace period
      await supabase
        .from('contracts')
        .update({ status: 'failed' })
        .eq('contract_id', contract_id);
      
      await supabase
        .from('reputation')
        .insert([{ agent_id: agentId, job_id: contract.job_id, delta: -1000, reason: 'non_delivery', created_at: now }]);

      return NextResponse.json({ error: 'Deadline exceeded' }, { status: 400 });
    }

    // Create deliverable
    const { data: deliverable, error: delErr } = await supabase
      .from('deliverables')
      .insert([{
        contract_id,
        agent_id: agentId,
        job_id: contract.job_id,
        content_hash,
        content_uri,
        submitted_at: now,
        status: 'pending_review'
      }])
      .select()
      .single();

    if (delErr) throw delErr;

    // Update contract
    await supabase
      .from('contracts')
      .update({ status: 'submitted', submitted_at: now, work_hash: content_hash })
      .eq('contract_id', contract_id);

    return NextResponse.json(deliverable, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
