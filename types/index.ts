export type UserRole = 'foreman' | 'crew_lead' | 'admin';
export type JobStatus = 'active' | 'completed' | 'paused' | 'cancelled';

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
  location_name?: string;
  city?: string;
  state?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  climate_zone?: string;
  crew_size?: number;
  equipment_notes?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // joined
  task_types?: TaskType;
  job_snapshots?: JobSnapshot;
}

export interface DailyLog {
  id: string;
  job_id: string;
  logged_by: string;
  log_date: string;
  units_completed: number;
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
  updated_at: string;
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
