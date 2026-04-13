/**
 * RLS test helpers.
 *
 * Manages the lifecycle of temporary test users and their associated
 * companies. Each test user is created via the Supabase admin API so
 * the handle_new_user() trigger fires and builds the company + profile.
 *
 * Callers must supply:
 *   TEST_SUPABASE_URL           – project REST URL
 *   TEST_SUPABASE_ANON_KEY      – anon (public) key
 *   TEST_SUPABASE_SERVICE_ROLE_KEY – service role key (for admin ops)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? '';
export const SUPABASE_SERVICE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';

/** True when all three env vars are present. Tests skip when false. */
export const RLS_TESTS_ENABLED = !!(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  SUPABASE_SERVICE_KEY
);

// ─── client factories ────────────────────────────────────────────────────────

/** Service-role client — bypasses RLS, used only for setup/teardown. */
export function makeServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anonymous client — no auth header, used to test unauthenticated access. */
export function makeAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** User-scoped client authenticated with the given JWT. */
export function makeUserClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── test user lifecycle ─────────────────────────────────────────────────────

export interface TestUser {
  id: string;
  email: string;
  companyId: string;
  /** Supabase client already scoped to this user's JWT. */
  client: SupabaseClient;
}

/**
 * Creates a real auth user via the admin API. The handle_new_user()
 * trigger creates a new company and admin profile automatically.
 * Signs in immediately to obtain a valid access token.
 */
export async function createTestUser(
  service: SupabaseClient,
  email: string,
  companyName: string,
): Promise<TestUser> {
  const password = 'TestPassword123!';

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: `Test ${companyName}`,
      company_name: companyName,
    },
  });
  if (error || !data.user) {
    throw new Error(`createTestUser(${email}): ${error?.message}`);
  }
  const userId = data.user.id;

  // Sign in with the anon client to get a real JWT.
  const anon = makeAnonClient();
  const { data: session, error: signInError } =
    await anon.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) {
    throw new Error(`signIn(${email}): ${signInError?.message}`);
  }

  // Fetch company_id from the profile the trigger just created.
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('company_id')
    .eq('id', userId)
    .single();
  if (profileError || !profile) {
    throw new Error(`getProfile(${email}): ${profileError?.message}`);
  }

  return {
    id: userId,
    email,
    companyId: profile.company_id,
    client: makeUserClient(session.session.access_token),
  };
}

/**
 * Removes a test user and their company (cascade wipes all rows).
 * Uses the service client so RLS doesn't block cleanup.
 */
export async function cleanupTestUser(
  service: SupabaseClient,
  user: TestUser,
): Promise<void> {
  // Deleting the company cascades to profiles, jobs, daily_logs, tasks, etc.
  // The ON DELETE RESTRICT on profiles→companies FK means we must delete the
  // auth user (which cascades to the profile) before we can drop the company.
  await service.auth.admin.deleteUser(user.id);
  await service.from('companies').delete().eq('id', user.companyId);
}

// ─── seed data helpers ───────────────────────────────────────────────────────

/** Creates a job for the given company via the user's scoped client. */
export async function createJob(
  client: SupabaseClient,
  companyId: string,
  userId: string,
  name = 'Test Job',
): Promise<string> {
  const { data, error } = await client
    .from('jobs')
    .insert({
      company_id: companyId,
      created_by: userId,
      name,
      total_units: 100,
      unit: 'panels',
      start_date: '2026-01-01',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createJob: ${error?.message}`);
  return data.id;
}

/** Creates a daily log for a job via the user's scoped client. */
export async function createLog(
  client: SupabaseClient,
  jobId: string,
  userId: string,
  logDate = '2026-01-10',
): Promise<string> {
  const { data, error } = await client
    .from('daily_logs')
    .insert({
      job_id: jobId,
      logged_by: userId,
      log_date: logDate,
      units_completed: 10,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createLog: ${error?.message}`);
  return data.id;
}

/** Creates a task for a job via the user's scoped client. */
export async function createTask(
  client: SupabaseClient,
  jobId: string,
  name = 'Test Task',
): Promise<string> {
  const { data, error } = await client
    .from('tasks')
    .insert({ job_id: jobId, name, sequence_order: 1 })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createTask: ${error?.message}`);
  return data.id;
}

/** Creates a crew member for the given company via the user's scoped client. */
export async function createCrewMember(
  client: SupabaseClient,
  companyId: string,
  name = 'Test Crew Member',
): Promise<string> {
  const { data, error } = await client
    .from('crew_members')
    .insert({ company_id: companyId, name })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createCrewMember: ${error?.message}`);
  return data.id;
}
