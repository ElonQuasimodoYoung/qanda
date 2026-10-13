-- 在 Supabase 控制台 SQL Editor 里整段运行一次。
-- 表本身对公开密钥完全关闭，只能通过下面两个函数按同步码读写。
-- 库里只存同步码的 SHA-256，不存同步码原文。

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.notes (
  space text not null,
  key text not null,
  value text not null default '',
  updated_at timestamptz not null default now(),
  primary key (space, key)
);

alter table public.notes enable row level security;
revoke all on table public.notes from anon, authenticated;

create or replace function public.get_notes(p_code text)
returns table (key text, value text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select n.key, n.value, n.updated_at
  from public.notes n
  where length(coalesce(p_code, '')) >= 20
    and n.space = encode(extensions.digest(p_code, 'sha256'), 'hex');
$$;

create or replace function public.save_notes(p_code text, p_items jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space text;
begin
  if length(coalesce(p_code, '')) < 20 then
    raise exception 'invalid sync code';
  end if;
  if jsonb_typeof(p_items) is distinct from 'object' then
    raise exception 'items must be an object';
  end if;
  if (select count(*) from jsonb_object_keys(p_items)) > 200 then
    raise exception 'too many items';
  end if;

  v_space := encode(extensions.digest(p_code, 'sha256'), 'hex');

  insert into public.notes (space, key, value, updated_at)
  select v_space, e.key, e.value, now()
  from jsonb_each_text(p_items) as e
  where length(e.key) between 1 and 64
    and length(coalesce(e.value, '')) <= 20000
  on conflict (space, key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at;

  if (select count(*) from public.notes where space = v_space) > 300 then
    raise exception 'too many notes';
  end if;

  return now();
end;
$$;

revoke all on function public.get_notes(text) from public;
revoke all on function public.save_notes(text, jsonb) from public;
grant execute on function public.get_notes(text) to anon, authenticated;
grant execute on function public.save_notes(text, jsonb) to anon, authenticated;
