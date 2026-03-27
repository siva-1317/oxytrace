import fs from 'fs';

const SUPABASE_URL = 'https://pozjtocnrpdbjoudmmni.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvemp0b2NucnBkYmpvdWRtbW5pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgwNTQ1OSwiZXhwIjoyMDg5MzgxNDU5fQ.ZWsYRPmAXMSXdm8WplyI0nbWEY4ZQTRxUpKbvWdveQM';

async function getOpenApi() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SUPABASE_SERVICE_KEY}`);
  const spec = await res.json();
  const alertsDef = spec.definitions?.alerts;
  if (!alertsDef) {
    console.log("No alerts definition found!");
    return;
  }
  fs.writeFileSync('d:/oxytrace/server/openapi_alerts.json', JSON.stringify(alertsDef.properties, null, 2));
  console.log("Saved to openapi_alerts.json");
}

getOpenApi().catch(console.error);
