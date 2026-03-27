import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pozjtocnrpdbjoudmmni.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvemp0b2NucnBkYmpvdWRtbW5pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgwNTQ1OSwiZXhwIjoyMDg5MzgxNDU5fQ.ZWsYRPmAXMSXdm8WplyI0nbWEY4ZQTRxUpKbvWdveQM';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testAlerts() {
  const { data, error } = await supabaseAdmin.from('alerts').insert({
    alert_type: 'TEST_ALERT',
    message: 'TEST_MESSAGE',
    severity: 'info'
  }).select();

  if (error) {
    console.error("INSERT FAILED:");
    console.error(error);
  } else {
    console.log("INSERT SUCCESS!");
    console.log(data);
  }
}

testAlerts().catch(console.error);
