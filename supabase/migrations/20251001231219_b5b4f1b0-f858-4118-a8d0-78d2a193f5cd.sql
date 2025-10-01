-- Create trigger to automatically create profile when user signs up
-- This ensures every authenticated user has a corresponding profile

-- First, check if trigger already exists and drop it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger that fires after a new user is inserted
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Sync existing users to profiles table (if any exist without profiles)
INSERT INTO public.profiles (id, full_name, phone)
SELECT 
  au.id,
  au.raw_user_meta_data->>'full_name',
  au.raw_user_meta_data->>'phone'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = au.id
)
ON CONFLICT (id) DO NOTHING;