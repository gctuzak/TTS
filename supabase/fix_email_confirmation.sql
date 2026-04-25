-- ==========================================
-- E-POSTA DOĞRULAMASINI OTOMATİKLEŞTİRME
-- ==========================================

-- 1. Mevcut tüm kullanıcıları doğrulanmış olarak işaretle
update auth.users
set email_confirmed_at = now(),
    updated_at = now()
where email_confirmed_at is null;

-- 2. Gelecekteki kullanıcılar için otomatik doğrulama trigger'ı oluştur
create or replace function public.handle_auto_confirm_user()
returns trigger
language plpgsql
security definer set search_path = auth
as $$
begin
  update auth.users
  set email_confirmed_at = now(),
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;

-- Trigger'ı bağla (eğer varsa önce sil)
drop trigger if exists on_auth_user_created_confirm on auth.users;
create trigger on_auth_user_created_confirm
  after insert on auth.users
  for each row execute function public.handle_auto_confirm_user();
