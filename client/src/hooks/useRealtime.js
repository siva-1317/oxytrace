import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { normalizeTelemetryRow } from '../lib/telemetry.js';

export function useRealtime(onNewReading, onNewAlert) {
  useEffect(() => {
    const channel = supabase
      .channel('oxytrace-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'iot_telemetry' },
        (payload) => {
          const normalizedReading = normalizeTelemetryRow(payload.new);
          console.debug('[useRealtime] iot_telemetry insert', {
            raw: payload.new,
            normalized: normalizedReading
          });
          onNewReading?.(normalizedReading);
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) =>
        onNewAlert?.(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
