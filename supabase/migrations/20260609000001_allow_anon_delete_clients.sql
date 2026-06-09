CREATE POLICY anon_delete_clients ON clients FOR DELETE TO anon USING (true);
