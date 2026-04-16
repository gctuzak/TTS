-- ==========================================
-- 1. PROFILES TABLOSU VE ADMIN ROLÜ
-- ==========================================
-- Kullanıcıların ekstra bilgilerini ve rollerini tutacağımız tablo
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  role text default 'user' check (role in ('user', 'admin')),
  created_at timestamptz default now()
);

-- RLS (Row Level Security)
alter table public.profiles enable row level security;

-- Herkes kendi profilini görebilir ve düzenleyebilir
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Adminler tüm profilleri görebilir
create policy "Admins can view all profiles" on public.profiles
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ==========================================
-- 2. TRIGGER: YENİ KULLANICI KAYDINDA PROFİL OLUŞTUR
-- ==========================================
-- Supabase auth.users tablosuna yeni biri kayıt olduğunda otomatik profile oluşturur
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'user' -- Varsayılan rol her zaman user
  );
  return new;
end;
$$;

-- Trigger'ı ekle (eğer varsa önce düşür)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ==========================================
-- 3. MEVCUT TABLOLARIN RLS POLİTİKALARINA ADMIN YETKİSİ EKLEME
-- ==========================================
-- BOATS Tablosu: Adminler tüm tekneleri görebilir
create policy "Admins can view all boats" on public.boats
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- TELEMETRY Tablosu: Adminler tüm verileri görebilir
create policy "Admins can view all telemetry" on public.telemetry
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- ==========================================
-- 4. FIRMWARE İÇİN STORAGE BUCKET OLUŞTURMA
-- ==========================================
insert into storage.buckets (id, name, public) 
values ('firmware', 'firmware', true)
on conflict (id) do nothing;

-- Storage İzinleri: Adminler dosya yükleyebilir, herkes dosyayı okuyabilir (indirebilir)
create policy "Firmware files are publicly accessible." 
  on storage.objects for select 
  using ( bucket_id = 'firmware' );

create policy "Only admins can upload firmware." 
  on storage.objects for insert 
  with check ( 
    bucket_id = 'firmware' and 
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Only admins can update firmware." 
  on storage.objects for update 
  using ( 
    bucket_id = 'firmware' and 
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Only admins can delete firmware." 
  on storage.objects for delete 
  using ( 
    bucket_id = 'firmware' and 
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';