-- Allow anon role to UPDATE clients (lifecycle management from dashboard).
-- This app has no auth; all server actions run as anon via the public key.
CREATE POLICY "anon_update_clients"
  ON clients
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
