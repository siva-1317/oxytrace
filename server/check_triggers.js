import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pozjtocnrpdbjoudmmni.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvemp0b2NucnBkYmpvdWRtbW5pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgwNTQ1OSwiZXhwIjoyMDg5MzgxNDU5fQ.ZWsYRPmAXMSXdm8WplyI0nbWEY4ZQTRxUpKbvWdveQM';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkTriggers() {
  // Since we cannot run raw queries via JS client, we will just call a non-existent method to force an error?
  // No, we cannot query pg_trigger via standard supabase-js unless exposed via API or RPC.
  // Let's try to do a simple test:
  console.log("We cannot query pg_trigger directly from Supabase JS client without a custom RPC.");
  console.log("Let's try creating a dummy record in stock_transactions to see if it fails with the exact same error.");
  const { data, error } = await supabase.from('stock_transactions').insert({
    transaction_type: 'received',
    cylinder_size: 'dummy',
    gas_type: 'dummy',
    quantity: 1
  });
  console.log('Insert stock_transactions Result:', error ? error.message : 'Success');
  
  const { data: d2, error: e2 } = await supabase.from('alerts').insert({
    alert_type: 'TEST',
    message: 'TEST',
    severity: 'info'
  });
  console.log('Insert alerts Result:', e2 ? e2.message : 'Success');
}
checkTriggers();
