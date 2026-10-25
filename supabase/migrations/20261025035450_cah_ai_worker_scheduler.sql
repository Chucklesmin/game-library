-- Durable asynchronous wakeups. No shared API key is stored in SQL or the client.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table private.cah_worker_settings(
 id boolean primary key default true check(id),
 worker_url text check(worker_url is null or worker_url ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/cah-ai-worker$' or worker_url='http://kong:8000/functions/v1/cah-ai-worker'),
 running_until timestamptz,
 daily_limit integer not null default 200 check(daily_limit between 0 and 10000)
);
insert into private.cah_worker_settings(id) values(true);
create table private.cah_worker_wakes(token_hash text primary key,expires_at timestamptz not null);
create table private.cah_worker_budget(day date primary key,reserved_attempts integer not null default 0);
alter table private.cah_worker_settings enable row level security;
alter table private.cah_worker_wakes enable row level security;
alter table private.cah_worker_budget enable row level security;
revoke all on private.cah_worker_settings,private.cah_worker_wakes,private.cah_worker_budget from public,anon,authenticated;

create function private.cah_wake_worker() returns void language plpgsql security definer set search_path='' as $$
declare s private.cah_worker_settings; token text;
begin
 select * into s from private.cah_worker_settings where id for update;
 if s.worker_url is null or s.running_until>clock_timestamp() then return; end if;
 if not exists(select 1 from private.cah_jobs where status='pending' or (status='leased' and lease_until<clock_timestamp())) then return; end if;
 delete from private.cah_worker_wakes where expires_at<clock_timestamp();
 if exists(select 1 from private.cah_worker_wakes) then return; end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into private.cah_worker_wakes values(encode(extensions.digest(token,'sha256'),'hex'),clock_timestamp()+interval '2 minutes');
 perform net.http_post(url:=s.worker_url,body:=jsonb_build_object('wakeToken',token),headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=80000);
end $$;

create function private.cah_jobs_wakeup() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.cah_wake_worker(); return null; end $$;
create trigger cah_jobs_wakeup after insert on private.cah_jobs for each statement execute function private.cah_jobs_wakeup();

create function public.cah_worker_authorize(p_token text) returns boolean language plpgsql security definer set search_path='' as $$
declare s private.cah_worker_settings; claimed text;
begin
 select * into s from private.cah_worker_settings where id for update;
 if s.running_until>clock_timestamp() or p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
 delete from private.cah_worker_wakes where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>clock_timestamp() returning token_hash into claimed;
 if claimed is null then return false; end if;
 update private.cah_worker_settings set running_until=clock_timestamp()+interval '90 seconds' where id;
 return true;
end $$;

create function public.cah_worker_release() returns void language plpgsql security definer set search_path='' as $$
begin
 update private.cah_worker_settings set running_until=null where id;
 perform private.cah_wake_worker();
end $$;

-- Reserve maximum potential attempts before network calls; unused reservations
-- are deliberately not refunded, so retries cannot overshoot the daily ceiling.
create function public.cah_worker_reserve_budget(p_attempts integer) returns boolean language plpgsql security definer set search_path='' as $$
declare used integer; max_allowed integer; today date:=(clock_timestamp() at time zone 'UTC')::date;
begin
 if p_attempts is null or p_attempts<1 or p_attempts>2 then return false; end if;
 select daily_limit into max_allowed from private.cah_worker_settings where id;
 insert into private.cah_worker_budget(day) values(today) on conflict do nothing;
 select reserved_attempts into used from private.cah_worker_budget where day=today for update;
 if used+p_attempts>max_allowed then return false; end if;
 update private.cah_worker_budget set reserved_attempts=reserved_attempts+p_attempts where day=today;
 return true;
end $$;

revoke all on function private.cah_wake_worker(),private.cah_jobs_wakeup() from public,anon,authenticated;
revoke all on function public.cah_worker_authorize(text),public.cah_worker_release(),public.cah_worker_reserve_budget(integer) from public,anon,authenticated;
grant execute on function public.cah_worker_authorize(text),public.cah_worker_release(),public.cah_worker_reserve_budget(integer) to service_role;
select cron.schedule('cah-ai-recovery','* * * * *',$$select private.cah_wake_worker()$$);
