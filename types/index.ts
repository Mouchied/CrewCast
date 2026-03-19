export type UserRole = 'foreman' | 'crew_lead' | 'admin';
export type JobStatus = 'active' | 'completed' | 'paused' | 'cancelled';
export type TaskStatus = 'pending' | 'active' | 'completed';
export type PaceStatus = 'on_track' | 'at_risk' | 'behind' | 'no_target' | 'pending';
export type PlanId = 'starter' | 'growth' | 'enterprise';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled';

export interface Company {
  id: string;
  name: string;
  industry?: string;
  created_at: string;
}

export interface Profile {
  id: string;
  company_id?: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface TaskType {
  id: string;
  name: string;
  category?: string;
  unit: string;
  is_global: boolean;
  created_at: string;
}

/** A sub-task within a job (e.g. "Racking install", "Wire pull", "Panel mount") */
export interface Task {
  id: string;
  job_id: string;
  name: string;
  description?: string;
  sequence_order: number;
  estimated_hours?: number;
  estimated_crew_size?: number;
  unit?: string;
  total_units?: number;
  starting_units_completed?: number;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface CrewMember {
  id: string;
  company_id: string;
  name: string;
  trade?: string;
  active: boolean;
  created_at: string;
}

export interface Job {
  id: string;
  company_id: string;
  created_by: string;
  name: string;
  task_type_id?: string;
  total_units: number;
  unit: string;
  start_date: string;
  target_end_date?: string;
  status: JobStatus;
  bid_hours?: number;
  bid_crew_size?: number;
  location_name?: string;
  city?: string;
  state?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  climate_zone?: string;
  crew_size?: number;
  starting_units_completed?: number;
  starting_hours_used?: number;
  equipment_notes?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // joined relations
  task_types?: TaskType;
  job_snapshots?: JobSnapshot;
  tasks?: Task[];
  job_variables?: JobVariable[];
}

export interface DailyLog {
  id: string;
  job_id: string;
  logged_by: string;
  log_date: string;
  units_completed: number;
  task_id?: string;
  percent_complete?: number;
  crew_size?: number;
  hours_worked?: number;
  weather_temp_f?: number;
  weather_condition?: string;
  weather_wind_mph?: number;
  weather_humidity?: number;
  weather_precip_in?: number;
  log_latitude?: number;
  log_longitude?: number;
  notes?: string;
  created_at: string;
  // joined
  tasks?: Pick<Task, 'id' | 'name'>;
  log_variable_overrides?: LogVariableOverride[];
}

export interface JobSnapshot {
  job_id: string;
  units_completed: number;
  units_remaining: number;
  avg_units_per_day: number;
  last_7_day_avg: number;
  estimated_finish_date?: string;
  days_ahead_behind?: number;
  total_days_logged: number;
  // Earned value / burn rate
  total_hours_worked?: number;
  bid_hours?: number;
  earned_value_pct?: number;
  planned_value_pct?: number;
  burn_rate?: number;
  hours_variance?: number;
  forecast_hours_at_completion?: number;
  pace_status: PaceStatus;
  updated_at: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  price_monthly: number;
  max_users?: number;
  max_jobs?: number;
  features: string[];
}

export interface CompanySubscription {
  id: string;
  company_id: string;
  plan_id: PlanId;
  status: SubscriptionStatus;
  seat_count: number;
  trial_ends_at?: string;
  current_period_start?: string;
  current_period_end?: string;
  created_at: string;
  updated_at: string;
  // joined
  plans?: Plan;
}

export interface CompanyBenchmark {
  company_id: string;
  task_type_id: string;
  task_type_name: string;
  unit: string;
  job_count: number;
  avg_units_per_day: number;
  min_units_per_day: number;
  max_units_per_day: number;
  avg_burn_rate?: number;
  avg_completion_pct?: number;
  avg_temp_f?: number;
  state?: string;
  climate_zone?: string;
}

/** A variable type in the catalog (global or company-specific) */
export interface JobVariableType {
  id: string;
  name: string;
  description?: string;
  category?: string;       // matches task_types.category; null = all trades
  unit_hint?: string;      // shown next to the value input, e.g. "AWG", "inches"
  common_values: string[]; // autocomplete suggestions
  is_global: boolean;
  company_id?: string;
  created_by?: string;
  created_at: string;
}

/** A variable value assigned to a specific job */
export interface JobVariable {
  id: string;
  job_id: string;
  variable_type_id: string;
  value: string;
  created_at: string;
  updated_at: string;
  // joined
  job_variable_types?: JobVariableType;
}

/** A variable value assigned to a specific task */
export interface TaskVariable {
  id: string;
  task_id: string;
  variable_type_id: string;
  value: string;
  created_at: string;
  updated_at: string;
  // joined
  job_variable_types?: JobVariableType;
}

/** A per-log override when conditions change mid-job */
export interface LogVariableOverride {
  id: string;
  daily_log_id: string;
  variable_type_id: string;
  value: string;
  created_at: string;
  // joined
  job_variable_types?: JobVariableType;
}

/** Variable-grouped productivity benchmark (from variable_productivity_benchmarks view) */
export interface VariableProductivityBenchmark {
  company_id: string;
  trade_category?: string;
  task_type_name?: string;
  work_unit?: string;
  variable_name: string;
  variable_value: string;
  variable_unit?: string;
  job_count: number;
  total_log_days: number;
  avg_units_per_day: number;
  min_units_per_day: number;
  max_units_per_day: number;
  stddev_units_per_day?: number;
  avg_burn_rate?: number;
  avg_crew_size?: number;
  avg_temp_f?: number;
  state?: string;
}

export interface WeatherData {
  temp_f: number;
  condition: string;
  wind_mph: number;
  humidity: number;
  precip_in: number;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  locationName?: string;
}

// ── Helpers ──────────────────────────────────

export function getPaceColor(status: PaceStatus | undefined): string {
  switch (status) {
    case 'on_track':  return '#22c55e';
    case 'at_risk':   return '#f59e0b';
    case 'behind':    return '#ef4444';
    default:          return '#64748b';
  }
}

export function getPaceLabel(status: PaceStatus | undefined): string {
  switch (status) {
    case 'on_track':  return 'On Track';
    case 'at_risk':   return 'At Risk';
    case 'behind':    return 'Behind';
    case 'no_target': return 'No Target';
    default:          return 'Pending';
  }
}

/** Human-readable forecast sentence per the product brief:
 *  "You are 4 days behind. At current pace you finish March 15. Your bid was March 11." */
export function getForecastSentence(job: Job): string | null {
  const snap = job.job_snapshots;
  if (!snap || snap.total_days_logged === 0) return null;

  const eta = snap.estimated_finish_date
    ? new Date(snap.estimated_finish_date).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric',
      })
    : null;
  const target = job.target_end_date
    ? new Date(job.target_end_date).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric',
      })
    : null;

  if (!eta) return null;

  const diff = snap.days_ahead_behind;

  if (diff == null || !target) {
    return `At current pace, you finish ${eta}.`;
  }

  const absDiff = Math.abs(diff);
  const dayWord = absDiff === 1 ? 'day' : 'days';

  if (diff > 0) {
    return `You are ${diff} ${dayWord} ahead. At current pace you finish ${eta}. Your bid was ${target}.`;
  }
  if (diff === 0) {
    return `You are on pace. At current pace you finish ${eta}. Your bid was ${target}.`;
  }
  return `You are ${absDiff} ${dayWord} behind. At current pace you finish ${eta}. Your bid was ${target}.`;
}
