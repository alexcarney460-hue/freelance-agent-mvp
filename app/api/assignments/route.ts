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

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 401 });

  const agentId = await verifyApiKey(apiKey);
  if (!agentId) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });

  try {
    const supabase = getSupabaseClient();
    const { data: contracts, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('agent_id', agentId)
      .in('status', ['active', 'submitted']);

    if (error) throw error;

    return NextResponse.json({ contracts: contracts || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
