import { GoogleGenerativeAI } from '@google/generative-ai';

function getApiKey(apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');
  return key;
}

function normalizeModelId(model) {
  if (!model) return null;
  const s = String(model).trim();
  if (!s) return null;
  return s.startsWith('models/') ? s.slice('models/'.length) : s;
}

export async function listModels({ apiKey } = {}) {
  const key = getApiKey(apiKey);
  const base = 'https://generativelanguage.googleapis.com';

  const versions = ['v1beta', 'v1'];
  let lastErr = null;

  for (const v of versions) {
    try {
      const url = `${base}/${v}/models?key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`[${res.status}] ${text || 'Failed to list models'}`);
      }
      const json = await res.json();
      const models = (json.models || []).map((m) => ({
        id: normalizeModelId(m.name),
        name: m.name,
        displayName: m.displayName,
        description: m.description,
        supportedGenerationMethods: m.supportedGenerationMethods || []
      }));
      return { apiVersion: v, models };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Failed to list models');
}

function pickRecommendedModel(models) {
  const supports = (m) => (m.supportedGenerationMethods || []).includes('generateContent');
  const candidates = (models || []).filter((m) => m?.id && supports(m));

  const prefer = (pred) => candidates.find((m) => pred(String(m.id).toLowerCase()));

  return (
    prefer((id) => id.includes('flash') && !id.includes('embed')) ||
    prefer((id) => id.includes('pro') && !id.includes('embed')) ||
    candidates[0] ||
    null
  );
}

async function resolveModelId({ apiKey, desiredModel }) {
  const desired = normalizeModelId(desiredModel);
  try {
    const { models } = await listModels({ apiKey });

    if (desired) {
      const found = (models || []).find((m) => m.id === desired);
      if (found && (found.supportedGenerationMethods || []).includes('generateContent')) return desired;
    }

    return pickRecommendedModel(models)?.id || desired || 'gemini-1.5-flash-latest';
  } catch {
    return desired || 'gemini-1.5-flash-latest';
  }
}

function getClient(apiKey) {
  return new GoogleGenerativeAI(getApiKey(apiKey));
}

async function generateWithRetry(prompt, { apiKey, model, temperature }) {
  const genAI = getClient(apiKey);
  const resolved = await resolveModelId({ apiKey, desiredModel: model });

  try {
    const m = genAI.getGenerativeModel({ model: resolved, generationConfig: { temperature } });
    const result = await m.generateContent(prompt);
    return result.response.text();
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('[404') || msg.toLowerCase().includes('not found')) {
      const { models } = await listModels({ apiKey });
      const fallback = pickRecommendedModel(models)?.id;
      if (fallback && fallback !== resolved) {
        const m2 = genAI.getGenerativeModel({ model: fallback, generationConfig: { temperature } });
        const result2 = await m2.generateContent(prompt);
        return result2.response.text();
      }
    }
    throw e;
  }
}

export async function generateSummary(systemData, { apiKey, model = null, temperature = 0.4 } = {}) {
  const prompt = `You are OxyTrace AI, a hospital oxygen management assistant.\nAnalyze this real-time data and give a concise 2-3 sentence status summary with any critical recommendations.\nData:\n${JSON.stringify(systemData)}`;
  return generateWithRetry(prompt, { apiKey, model, temperature });
}

export async function analyzeCylinder(cylinderData, question, { apiKey, model = null, temperature = 0.4 } = {}) {
  const prompt = `You are OxyTrace AI. Using this cylinder data:\n${JSON.stringify(cylinderData)}\n\nAnswer this question from hospital staff: "${question}"\nBe concise, factual, and safety-focused.`;
  return generateWithRetry(prompt, { apiKey, model, temperature });
}

export async function* analyzeCylinderStream(cylinderData, question, { apiKey, model = null, temperature = 0.4 } = {}) {
  const genAI = getClient(apiKey);
  const resolved = await resolveModelId({ apiKey, desiredModel: model });

  const prompt = `You are OxyTrace AI. Using this cylinder data:\n${JSON.stringify(cylinderData)}\n\nAnswer this question from hospital staff: "${question}"\nBe concise, factual, and safety-focused.`;

  const m = genAI.getGenerativeModel({ model: resolved, generationConfig: { temperature } });
  const stream = await m.generateContentStream(prompt);

  for await (const chunk of stream.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

export async function generateAnalyticsReport(stats, dateRange, { apiKey, model = null, temperature = 0.4 } = {}) {
  const prompt = `You are OxyTrace AI. Generate a structured hospital O₂ analytics report in markdown for the period ${dateRange.from} to ${dateRange.to}.\nData: ${JSON.stringify(stats)}\nInclude sections: Executive Summary, Usage Trends, Anomalies Detected, Refill Recommendations, Cost Optimization, Safety Observations.`;
  return generateWithRetry(prompt, { apiKey, model, temperature });
}

export async function analyzeStock(stockData, { apiKey, model = null, temperature = 0.4 } = {}) {
  const prompt = `You are OxyTrace AI, a hospital supply chain analyst.\nAnalyze this oxygen cylinder stock data:\n${JSON.stringify(
    stockData
  )}\n\nProvide:\n1. Current stock health assessment\n2. Which suppliers offer best value\n3. Reorder recommendations with suggested quantities\n4. Spending optimization tips\n5. Any supply risk warnings\n\nFormat as structured markdown with clear headings.`;
  return generateWithRetry(prompt, { apiKey, model, temperature });
}

export async function generateSupplierOrderEmail(
  emailContext,
  { apiKey, model = null, temperature = 0.5 } = {}
) {
  const prompt = `You are OxyTrace AI.
Generate a professional supplier order request email for a hospital.

Return strict JSON with this shape:
{
  "subject": "Request Order",
  "greeting": "Dear ...",
  "intro": "short professional introduction",
  "closing": "short professional closing paragraph"
}

Rules:
- Subject must stay "Request Order"
- Keep the tone formal, clear, and procurement-friendly
- Mention the hospital name, supplier name, order number, invoice number, and expected delivery date
- Do not include markdown
- Do not include tables in the generated text because the app will render the ordered-items table separately
- Keep each field concise and usable in an email

Context:
${JSON.stringify(emailContext)}`;

  return generateWithRetry(prompt, { apiKey, model, temperature });
}

export async function generateLeakAlertExplanation(
  leakContext,
  { apiKey, model = null, temperature = 0.3 } = {}
) {
  const prompt = `You are OxyTrace AI, a hospital oxygen safety assistant.
Generate a short leak alert explanation for hospital staff.

Rules:
- Keep it to 2-3 short sentences.
- Be concrete and safety-focused.
- Mention why the leak is dangerous and what staff should do immediately.
- Do not use markdown, bullet points, or headings.

Context:
${JSON.stringify(leakContext)}`;

  return generateWithRetry(prompt, { apiKey, model, temperature });
}

export async function testGemini(prompt, { apiKey, model = null, temperature = 0.4 } = {}) {
  return generateWithRetry(prompt || 'Say OK.', { apiKey, model, temperature });
}
