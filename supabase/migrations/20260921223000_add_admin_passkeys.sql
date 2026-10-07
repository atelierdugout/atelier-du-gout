create table if not exists public.admin_passkeys (
  id bigserial primary key,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports jsonb not null default '[]'::jsonb,
  device_name text not null default 'Appareil administrateur',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.admin_passkey_challenges (
  id text primary key,
  challenge text not null,
  purpose text not null check (purpose in ('registration', 'authentication')),
  created_at timestamptz not null default now()
);

create index if not exists admin_passkey_challenges_created_at_idx
on public.admin_passkey_challenges(created_at);
