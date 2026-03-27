import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pozjtocnrpdbjoudmmni.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvemp0b2NucnBkYmpvdWRtbW5pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgwNTQ1OSwiZXhwIjoyMDg5MzgxNDU5fQ.ZWsYRPmAXMSXdm8WplyI0nbWEY4ZQTRxUpKbvWdveQM';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkSchema() {
  const { data, error } = await supabase.from('alerts').select('*').limit(1);
  console.log('Alerts columns:', data && data.length ? Object.keys(data[0]) : (data ? 'Empty table, but query succeeded' : error));
}
checkSchema();
