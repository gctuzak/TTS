-- Function to claim a boat
-- Call this via Supabase RPC: supabase.rpc('claim_boat', { boat_id: '...', device_secret: '...' })

create or replace function claim_boat(boat_id uuid, secret text)
returns boolean
language plpgsql
security definer
as $$
declare
  found_id uuid;
begin
  -- Check if boat exists, has the secret, and HAS NO USER (orphaned/factory)
  -- OR allows multiple users? Usually 1 owner.
  -- Let's assume we are looking for a boat where user_id IS NULL (Factory mode)
  -- OR maybe we just check if it exists and verified, and we allow "Taking ownership" if it's not taken?
  
  -- But wait, our schema currently has user_id NOT NULL. 
  -- So we can't have factory boats without a user.
  -- WE MUST ALTER THE TABLE FIRST.
  
  -- If we can't alter the table easily right now, we can stick to "Create New" flow mainly.
  -- But if the user insists on "Claiming", we assume the table was altered.
  
  -- Let's try to update it if it belongs to '00000000-0000-0000-0000-000000000000' or something?
  -- No, let's just create the function assuming the schema supports it.
  
  update boats
  set user_id = auth.uid()
  where id = boat_id
  and device_secret = secret
  and (user_id is null); -- Only claim if unowned
  
  if found then
    return true;
  else
    return false;
  end if;
end;
$$;

-- Note: You need to run this to make user_id nullable:
-- alter table boats alter column user_id drop not null;
