-- Staff log in with a PIN and each has a job title, such as Sales attendant
-- or Store manager. The title is for the record only: every staff login can
-- use the till and make requests, nothing more.
-- Databases made before staff got their name start with an empty staff list;
-- the admin adds everyone again in the back office.
CREATE TABLE IF NOT EXISTS staff (
  id text PRIMARY KEY,
  name text NOT NULL,
  salt text NOT NULL,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS job_role text;
