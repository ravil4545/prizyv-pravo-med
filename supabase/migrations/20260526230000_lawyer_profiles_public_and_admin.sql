-- Каталог юристов /lawyers требует публичного SELECT для активных юристов.
-- Существующая политика "Lawyer own profile" разрешала только самому юристу
-- видеть свой профиль — все остальные получали пустой результат.
--
-- Также админ должен мочь назначать/снимать роль юриста через /admin/users —
-- для этого нужна отдельная INSERT/UPDATE/DELETE политика для админа.

-- 1. Публичное чтение активных юристов (для каталога /lawyers)
DROP POLICY IF EXISTS "Public reads active lawyers" ON lawyer_profiles;
CREATE POLICY "Public reads active lawyers" ON lawyer_profiles
  FOR SELECT
  USING (is_active = true);

-- 2. Админ управляет любыми lawyer_profiles (создание/деактивация юристов)
DROP POLICY IF EXISTS "Admin manages lawyer profiles" ON lawyer_profiles;
CREATE POLICY "Admin manages lawyer profiles" ON lawyer_profiles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
