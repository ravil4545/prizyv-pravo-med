-- Allow clients to read the profile of lawyers they're connected with
-- (needed to display lawyer name in ClientChatPage / ClientMessagesPage)

DROP POLICY IF EXISTS "Client views connected lawyer profile" ON lawyer_profiles;

CREATE POLICY "Client views connected lawyer profile" ON lawyer_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lawyer_clients lc
      WHERE lc.lawyer_id = lawyer_profiles.user_id
        AND lc.client_user_id = auth.uid()
    )
  );
