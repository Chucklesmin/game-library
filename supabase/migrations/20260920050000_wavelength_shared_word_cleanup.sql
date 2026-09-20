-- Remove cards whose endpoints repeat a meaningful word; those usually describe one idea twice.
delete from public.game_content c
where c.content_type = 'wavelength-spectrum'
  and exists (
    select 1
    from regexp_split_to_table(lower(coalesce(c.payload->>'left', '')), '[^a-z0-9]+') as left_word
    join regexp_split_to_table(lower(coalesce(c.payload->>'right', '')), '[^a-z0-9]+') as right_word
      on left_word = right_word
    where length(left_word) > 2
  );
