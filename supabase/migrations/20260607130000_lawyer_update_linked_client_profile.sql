-- Юрист с АКТИВНЫМ доступом к досье клиента может заполнять/править профиль
-- привязанного клиента (когда клиент сам не заполнил данные). Это зеркало
-- уже существующей SELECT-политики "Lawyer reads granted client profile" —
-- гейт по client_document_access.is_active (клиент сам открыл доступ).
--
-- Безопасность: НЕ даёт доступа к чужим профилям — только к тем клиентам,
-- которые явно открыли этому юристу доступ к своему досье. Право клиента
-- редактировать свой профиль ("Users can update their own profile") сохраняется.

CREATE POLICY "Lawyer updates granted client profile"
ON public.profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.client_document_access cda
    WHERE cda.client_user_id = profiles.id
      AND cda.lawyer_id = auth.uid()
      AND cda.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.client_document_access cda
    WHERE cda.client_user_id = profiles.id
      AND cda.lawyer_id = auth.uid()
      AND cda.is_active = true
  )
);
