-- The initial expansion accidentally omitted the opposite side of naughty-48.
update public.game_content
set payload = jsonb_set(payload, '{right}', to_jsonb('Sunrise drive'::text))
where content_type = 'wavelength-spectrum'
  and payload ->> 'id' = 'naughty-48'
  and payload ->> 'left' = 'Midnight drive';
