import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pozjtocnrpdbjoudmmni.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvemp0b2NucnBkYmpvdWRtbW5pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgwNTQ1OSwiZXhwIjoyMDg5MzgxNDU5fQ.ZWsYRPmAXMSXdm8WplyI0nbWEY4ZQTRxUpKbvWdveQM';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkTriggers() {
  const { error: e1 } = await supabase.from('stock_transactions').insert({
    transaction_type: 'received',
    cylinder_size: 'dummy',
    gas_type: 'dummy',
    quantity: 1
  });
  console.log('TRANS_ERR:', e1 ? JSON.stringify(e1.message) : 'Success');
  
  const { error: e2 } = await supabase.from('alerts').insert({
    alert_type: 'TEST',
    message: 'TEST',
    severity: 'info'
  });
  console.log('ALERTS_ERR:', e2 ? JSON.stringify(e2.message) : 'Success');

  const { error: e3 } = await supabase.from('stock_inventory').update({ quantity_full: 1 }).eq('cylinder_size', 'dummy');
  console.log('INV_ERR:', e3 ? JSON.stringify(e3.message) : 'Success');
}
checkTriggers();
