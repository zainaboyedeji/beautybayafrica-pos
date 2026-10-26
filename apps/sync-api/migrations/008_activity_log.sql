-- Who did what and when: logins (including failed ones), sales, and changes
-- made in the back office. Names are copied in, so the log still reads
-- correctly after someone is renamed or removed.
CREATE TABLE activity_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- 'visitor' is someone not logged in: a failed login or a PIN request.
  actor_role text NOT NULL CHECK (actor_role IN ('admin', 'staff', 'visitor')),
  actor_name text NOT NULL,
  staff_id text,
  action text NOT NULL,
  summary text NOT NULL
);
CREATE INDEX activity_log_at_idx ON activity_log (at DESC);
