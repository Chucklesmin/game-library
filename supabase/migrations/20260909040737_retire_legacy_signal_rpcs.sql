-- The team-based Signal flow is retired. Cooperative Wavelength uses only the
-- wavelength_* RPC boundary introduced in the preceding migration.
revoke execute on function public.signal_start_round(uuid,jsonb,integer), public.signal_submit_clue(uuid,text), public.signal_submit_tune(uuid,integer), public.signal_submit_intercept(uuid,text), public.signal_reveal_round(uuid) from authenticated;
