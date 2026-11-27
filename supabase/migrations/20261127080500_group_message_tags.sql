create table public.channel_message_tag_assignments (
  message_id uuid not null references public.channel_messages(id) on delete cascade,
  tag_id uuid not null references public.chat_tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (user_id, message_id, tag_id)
);

create index channel_message_tag_assignments_message_idx
  on public.channel_message_tag_assignments (message_id);

create index channel_message_tag_assignments_tag_idx
  on public.channel_message_tag_assignments (tag_id);

alter table public.channel_message_tag_assignments enable row level security;
revoke all on public.channel_message_tag_assignments from public, anon, authenticated;
grant select, insert, delete on public.channel_message_tag_assignments to authenticated;

create policy group_message_tags_select on public.channel_message_tag_assignments
for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.channel_messages as message
    join public.channel_members as member on member.channel_id = message.channel_id
    where message.id = channel_message_tag_assignments.message_id and member.user_id = (select auth.uid())
  )
);

create policy group_message_tags_insert on public.channel_message_tag_assignments
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.chat_tags as tag
    where tag.id = channel_message_tag_assignments.tag_id and tag.user_id = (select auth.uid())
  )
  and exists (
    select 1 from public.channel_messages as message
    join public.channels as channel on channel.id = message.channel_id
    join public.channel_members as member on member.channel_id = message.channel_id
    where message.id = channel_message_tag_assignments.message_id and channel.type = 'group'
      and member.user_id = (select auth.uid())
  )
);

create policy group_message_tags_delete on public.channel_message_tag_assignments
for delete to authenticated using (user_id = (select auth.uid()));
