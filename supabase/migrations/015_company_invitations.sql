-- ─────────────────────────────────────────────
-- 015 — Company Invitations
-- Token-based invite flow: create invite → share link → accept
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by  uuid NOT NULL REFERENCES profiles(id),
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'foreman',
  token       uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_by uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_invitations ENABLE ROW LEVEL SECURITY;

-- Company members can read invitations for their own company
CREATE POLICY "invitations_select" ON company_invitations
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Company members can create invitations for their own company
CREATE POLICY "invitations_insert" ON company_invitations
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    AND invited_by = auth.uid()
  );

-- ─────────────────────────────────────────────
-- RPC: Look up an invitation by token
-- SECURITY DEFINER so unauthenticated users can validate before logging in
-- Only exposes company name, role, email, status, and expiry
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token uuid)
RETURNS TABLE (
  company_name  text,
  role          text,
  email         text,
  status        text,
  expires_at    timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.name    AS company_name,
    i.role,
    i.email,
    i.status,
    i.expires_at
  FROM company_invitations i
  JOIN companies c ON c.id = i.company_id
  WHERE i.token = p_token;
$$;

-- ─────────────────────────────────────────────
-- RPC: Accept an invitation for the authenticated user
-- Attaches the user's profile to the company and marks the invite accepted
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accept_invitation(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite  company_invitations%ROWTYPE;
BEGIN
  -- Lock row to prevent double-accepts
  SELECT i.* INTO v_invite
  FROM company_invitations i
  WHERE i.token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invitation not found');
  END IF;

  IF v_invite.status != 'pending' THEN
    RETURN json_build_object('error', 'Invitation is no longer valid');
  END IF;

  IF v_invite.expires_at < now() THEN
    UPDATE company_invitations SET status = 'expired' WHERE id = v_invite.id;
    RETURN json_build_object('error', 'Invitation has expired');
  END IF;

  -- Only attach if the user has no company yet (prevents overwriting existing membership)
  IF EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL
  ) THEN
    RETURN json_build_object('error', 'You already belong to a company');
  END IF;

  -- Attach user to the company with the invited role
  UPDATE profiles
  SET company_id = v_invite.company_id,
      role       = v_invite.role
  WHERE id = auth.uid();

  -- Mark invitation accepted
  UPDATE company_invitations
  SET status      = 'accepted',
      accepted_by = auth.uid()
  WHERE id = v_invite.id;

  RETURN json_build_object('success', true, 'company_id', v_invite.company_id);
END;
$$;
