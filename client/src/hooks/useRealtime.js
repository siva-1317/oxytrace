import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { normalizeTelemetryRow } from '../lib/telemetry.js';

export function useRealtime(onNewReading, onNewAlert) {
  const readingRef = useRef(onNewReading);
  const alertRef = useRef(onNewAlert);

  useEffect(() => {
    readingRef.current = onNewReading;
    alertRef.current = onNewAlert;
  }, [onNewReading, onNewAlert]);

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
          readingRef.current?.(normalizedReading);
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) =>
        alertRef.current?.(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
