begin;

-- A shared catalogue of restaurant and fast-food items. USDA covers ingredients; it does not
-- cover a Chipotle burrito bowl or a Shah's Halal platter, which is most of what a student on
-- a campus actually eats. Read by everyone, written only by the service role: these are
-- published figures, not a per-user list, and a user editing them would change them for all.
create table public.branded_foods (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null check (length(btrim(brand_name)) between 1 and 120),
  item_name text not null check (length(btrim(item_name)) between 1 and 200),
  -- Nullable on purpose: a portion nobody published is unknown, not zero.
  serving_size_grams numeric(8,2) check (serving_size_grams is null or (serving_size_grams > 0 and serving_size_grams <= 5000)),
  calories numeric(8,2) not null check (calories >= 0 and calories <= 20000),
  protein numeric(8,2) not null check (protein >= 0 and protein <= 2000),
  carbs numeric(8,2) not null check (carbs >= 0 and carbs <= 2000),
  fat numeric(8,2) not null check (fat >= 0 and fat <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The brand is weighted above the item so "chipotle" ranks the chain over a chipotle sauce.
  search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(brand_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(item_name, '')), 'B')) stored,
  constraint branded_foods_unique unique (brand_name, item_name)
);
create index branded_foods_search on public.branded_foods using gin (search);
-- Typing is prefix matching, which a tsvector alone cannot do for the word still being typed.
create index branded_foods_brand_prefix on public.branded_foods (lower(brand_name) text_pattern_ops);
create index branded_foods_item_prefix on public.branded_foods (lower(item_name) text_pattern_ops);
create trigger branded_foods_updated_at before update on public.branded_foods
  for each row execute function public.set_updated_at();

comment on table public.branded_foods is
  'Published restaurant nutrition. Macros are per serving_size_grams where that is given, per listed serving otherwise.';
comment on column public.branded_foods.serving_size_grams is
  'Null means the brand did not publish a gram weight. Never read a null as zero.';

alter table public.branded_foods enable row level security;
revoke all on public.branded_foods from public, anon, authenticated;
grant select on public.branded_foods to authenticated;
grant all on public.branded_foods to service_role;
create policy branded_foods_read on public.branded_foods for select to authenticated using (true);

commit;
