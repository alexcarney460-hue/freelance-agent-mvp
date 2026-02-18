import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { verified_capabilities } = await req.json();

  try {
    const now = Math.floor(Date.now() / 1000);
    const agentId = 'agent_' + crypto.randomBytes(8).toString('hex');
    const apiKey = crypto.randomBytes(32).toString('hex');
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const { data, error } = await supabase
      .from('agents')
      .insert([{
        agent_id: agentId,
        registered_at: now,
        api_key_hash: apiKeyHash,
        verified_capabilities: verified_capabilities || [],
        last_activity: now,
        state: 'registered'
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ agent_id: agentId, api_key: apiKey }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 401 });

  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

  try {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('api_key_hash', hash)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
