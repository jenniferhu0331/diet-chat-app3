-- Daily conversation summaries used as memory context in chat prompts.
-- Created for the prompt-chain refactor (Bloom architecture).

create table if not exists public.chat_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  summary_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists chat_summaries_user_date_idx
  on public.chat_summaries (user_id, date desc);

-- Auto-bump updated_at on upsert.
create or replace function public.chat_summaries_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists chat_summaries_updated_at_trg on public.chat_summaries;
create trigger chat_summaries_updated_at_trg
  before update on public.chat_summaries
  for each row execute function public.chat_summaries_set_updated_at();
