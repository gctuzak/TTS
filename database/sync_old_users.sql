-- Geçmişteki tüm kayıtlı kullanıcıları "profiles" tablosuna aktar
INSERT INTO public.profiles (id, email, full_name, role)
SELECT 
  id, 
  email, 
  raw_user_meta_data->>'full_name', 
  'user'
FROM auth.users
ON CONFLICT (id) DO NOTHING;
