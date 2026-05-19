-- Allow anon role to UPDATE exceptions (resolution workflow).
-- This app has no auth; all server actions run as anon via the public key.
CREATE POLICY "anon_update_exceptions"
  ON exceptions
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
