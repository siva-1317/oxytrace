import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useRealtime(onNewReading, onNewAlert) {
  useEffect(() => {
    const channel = supabase
      .channel('oxytrace-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings' },
        (payload) => onNewReading?.(payload.new)
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

