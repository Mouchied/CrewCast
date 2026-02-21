-- CrewCast SaaS / Billing Schema
-- Seat-based pricing: companies pay per user, per tier
-- Built for Stripe integration (or any payment processor)

-- ─────────────────────────────────────────────
-- SUBSCRIPTION PLANS (seed data)
-- ─────────────────────────────────────────────
CREATE TABLE plans (
  id            TEXT PRIMARY KEY,       -- 'starter', 'pro', 'enterprise'
  name          TEXT NOT NULL,
  price_monthly NUMERIC NOT NULL,       -- per seat per month
  max_users     INTEGER,               -- NULL = unlimited (enterprise)
  max_jobs      INTEGER,               -- NULL = unlimited
  features      JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO plans (id, name, price_monthly, max_users, max_jobs, features) VALUES
  ('starter',    'Starter',    0,     1,    5,    '["Basic ETA tracking", "Weather capture", "Location tracking"]'),
  ('pro',        'Pro',        29,    10,   NULL, '["Everything in Starter", "Unlimited jobs", "Team management", "Analytics dashboard", "Export data"]'),
  ('enterprise', 'Enterprise', 99,    NULL, NULL, '["Everything in Pro", "Unlimited users", "Priority support", "Custom task types", "API access", "Benchmark insights"]');

-- ─────────────────────────────────────────────
-- COMPANY SUBSCRIPTIONS
-- ─────────────────────────────────────────────
CREATE TABLE company_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan_id               TEXT NOT NULL REFERENCES plans(id),
  status                TEXT NOT NULL DEFAULT 'trialing', -- trialing | active | past_due | cancelled
  seat_count            INTEGER NOT NULL DEFAULT 1,       -- how many seats purchased
  trial_ends_at         TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,

  -- Stripe / payment processor fields
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- COMPANY INVITATIONS (for adding team members)
-- ─────────────────────────────────────────────
CREATE TABLE company_invitations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by    UUID NOT NULL REFERENCES profiles(id),
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'foreman',
  token         TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  accepted      BOOLEAN DEFAULT FALSE,
  expires_at    TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- USAGE TRACKING (per company, per month)
-- Tracks what we can bill on / analyze
-- ─────────────────────────────────────────────
CREATE TABLE usage_snapshots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  month         DATE NOT NULL,          -- first of month
  active_users  INTEGER DEFAULT 0,
  jobs_created  INTEGER DEFAULT 0,
  logs_created  INTEGER DEFAULT 0,
  data_points   INTEGER DEFAULT 0,      -- total enriched data points captured
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, month)
);

-- ─────────────────────────────────────────────
-- FUNCTION: Auto-provision starter plan on company creation
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION provision_starter_plan()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO company_subscriptions (
    company_id, plan_id, status, seat_count, trial_ends_at
  ) VALUES (
    NEW.id, 'starter', 'trialing', 1, NOW() + INTERVAL '14 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_company_created
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION provision_starter_plan();

-- ─────────────────────────────────────────────
-- FUNCTION: Enforce seat limits before adding a user
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_seat_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_sub     RECORD;
  v_plan    RECORD;
  v_count   INTEGER;
BEGIN
  -- Only enforce when linking to a company
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  SELECT cs.*, p.max_users INTO v_sub
  FROM company_subscriptions cs
  JOIN plans p ON p.id = cs.plan_id
  WHERE cs.company_id = NEW.company_id;

  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_sub.max_users IS NULL THEN RETURN NEW; END IF; -- unlimited

  SELECT COUNT(*) INTO v_count
  FROM profiles WHERE company_id = NEW.company_id;

  IF v_count >= v_sub.max_users THEN
    RAISE EXCEPTION 'Seat limit reached. Upgrade your plan to add more users.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_seat_limit
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION check_seat_limit();

-- ─────────────────────────────────────────────
-- RLS for new tables
-- ─────────────────────────────────────────────
ALTER TABLE plans                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_snapshots       ENABLE ROW LEVEL SECURITY;

-- Plans: public read
CREATE POLICY "Plans are publicly readable"
  ON plans FOR SELECT USING (TRUE);

-- Subscriptions: company members can read their own
CREATE POLICY "Company members read subscription"
  ON company_subscriptions FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Invitations: company admins/foremen can manage
CREATE POLICY "Company members read invitations"
  ON company_invitations FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Authenticated users create invitations"
  ON company_invitations FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Usage: company admins can view
CREATE POLICY "Company members read usage"
  ON usage_snapshots FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
