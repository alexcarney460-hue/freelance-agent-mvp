import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Job } from '@/api/types';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  
  const status = searchParams.get('status') || 'open';
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({ jobs: data || [], total: data?.length || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // CLIENT ONLY - would need client auth header
  const { title, description, required_skills, budget_min, budget_max, deadline_unix } = await req.json();

  if (!title || !description || !required_skills || !budget_min || !budget_max || !deadline_unix) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('jobs')
      .insert([{
        client_id: 'client_' + Date.now(), // TODO: use real client auth
        title,
        description,
        required_skills,
        budget_min,
        budget_max,
        deadline_unix,
        created_at: Math.floor(Date.now() / 1000),
        expires_at: Math.floor(Date.now() / 1000) + (7 * 86400),
        status: 'open'
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
