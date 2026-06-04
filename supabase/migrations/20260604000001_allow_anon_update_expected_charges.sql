-- Allow anon users to update expected_charges rows (billing corrections via UI)
CREATE POLICY "anon update expected_charges"
ON expected_charges FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- DOWN
-- DROP POLICY "anon update expected_charges" ON expected_charges;
