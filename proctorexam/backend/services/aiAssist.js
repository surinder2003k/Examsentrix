// Uses Node 18+ native fetch (no external package needed)

function withTimeout(promise, ms, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return Promise.race([
    promise(controller.signal),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms))
  ]).finally(() => clearTimeout(timer));
}

export async function askAiAssistant(teacherPrompt, currentQuestions = [], signal = null) {
  // Trim currentQuestions to essential fields only to save tokens
  const trimmedQuestions = currentQuestions.map((q, i) => ({
    id: i + 1,
    question_text: q.question_text,
    correct_answer: q.correct_answer,
    category: q.category || '',
    difficulty: q.difficulty || 'easy',
  }));

  const systemPrompt = `You are an expert AI Exam Assistant for a proctored examination platform.
Your task: take instructions from a teacher and return the COMPLETE updated question bank.

Teacher's instruction: "${teacherPrompt}"
Current questions (${trimmedQuestions.length} total): ${JSON.stringify(trimmedQuestions)}

RULES:
1. If teacher asks to ADD questions → generate them and APPEND to existing list, return full combined list.
2. If teacher asks to CHANGE/MODIFY a question → update that question in place, return full list.
3. If teacher asks to DELETE → remove that question, return remaining list.
4. If no questions exist and teacher asks to add → just generate the requested questions.

Each question object MUST have this exact structure:
{
  "question_text": "Full question text here",
  "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
  "correct_answer": 0,
  "difficulty": "easy",
  "marks": 1,
  "is_common": false,
  "category": "English"
}

- correct_answer is a 0-indexed integer (0=A, 1=B, 2=C, 3=D)
- difficulty must be: "easy", "medium", or "hard"
- options array must have exactly 4 strings
- Return ONLY a raw JSON array, starting with [ and ending with ]
- No markdown, no code blocks, no explanation text whatsoever`;

  // Check if request was cancelled before starting
  if (signal?.aborted) throw new Error('Request cancelled');

  // 1. Try Groq first (fastest, free tier available) — retry once on failure
  if (process.env.GROQ_API_KEY) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[AI Assist] Trying Groq (llama-3.3-70b) attempt ${attempt}...`);
        const response = await withTimeout(async (abortSignal) => {
          return fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
              'Content-Type': 'application/json',
            },
            signal: abortSignal,
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [
                {
                  role: 'system',
                  content: 'You are an exam question generator. Always return only valid JSON arrays of question objects. No markdown, no explanation.'
                },
                {
                  role: 'user',
                  content: systemPrompt
                }
              ],
              temperature: 0.7,
              max_tokens: 8192,
            })
          });
        }, 90000, 'Groq');

        if (response.ok) {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content?.trim() || '';
          const parsed = parseQuestionsJSON(text);
          if (parsed) {
            console.log(`✅ [AI Assist] Groq success: ${parsed.length} questions`);
            return parsed;
          }
          console.warn('[AI Assist] Groq returned unparseable JSON, retrying...');
        } else {
          const errText = await response.text();
          console.warn('[AI Assist] Groq non-200:', response.status, errText.substring(0, 200));
        }
      } catch (err) {
        console.warn('[AI Assist] Groq attempt', attempt, 'failed:', err.message);
      }
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  if (signal?.aborted) throw new Error('Request cancelled');

  // 2. Try OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    try {
      console.log('[AI Assist] Trying OpenRouter (meta-llama/llama-3.3-70b-instruct)...');
      const response = await withTimeout(async (abortSignal) => {
        return fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://proctorexam.app',
            'X-Title': 'ProctorExam AI'
          },
          signal: abortSignal,
          body: JSON.stringify({
            model: 'meta-llama/llama-3.3-70b-instruct',
            messages: [
              {
                role: 'system',
                content: 'You are an exam question generator. Always return only valid JSON arrays of question objects. No markdown, no explanation.'
              },
              {
                role: 'user',
                content: systemPrompt
              }
            ],
            max_tokens: 4096,
          })
        });
      }, 60000, 'OpenRouter');

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content?.trim() || '';
        const parsed = parseQuestionsJSON(text);
        if (parsed) {
          console.log(`✅ [AI Assist] OpenRouter success: ${parsed.length} questions`);
          return parsed;
        }
      } else {
        const errText = await response.text();
        console.warn('[AI Assist] OpenRouter non-200:', response.status, errText.substring(0, 200));
      }
    } catch (err) {
      console.warn('[AI Assist] OpenRouter failed:', err.message);
    }
  }

  if (signal?.aborted) throw new Error('Request cancelled');

  // 3. Last resort: Google Gemini direct API
  if (process.env.GEMINI_API_KEY) {
    try {
      console.log('[AI Assist] Trying Gemini 2.0 Flash...');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const response = await withTimeout(async (abortSignal) => {
        return fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortSignal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });
      }, 60000, 'Gemini');

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        const parsed = parseQuestionsJSON(text);
        if (parsed) {
          console.log(`✅ [AI Assist] Gemini success: ${parsed.length} questions`);
          return parsed;
        }
      } else {
        const errText = await response.text();
        console.error('[AI Assist] Gemini non-200:', response.status, errText.substring(0, 200));
      }
    } catch (err) {
      console.error('[AI Assist] Gemini failed:', err.message);
    }
  }

  throw new Error('All AI providers failed. Please check API keys or try again later.');
}

function parseQuestionsJSON(text) {
  if (!text) return null;
  try {
    // Strip markdown code blocks if present
    let clean = text.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    }
    // Find the first [ to the last ] to isolate the array
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start === -1 || end === -1) return null;
    clean = clean.slice(start, end + 1);

    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    // Validate and normalize each question
    const valid = parsed.filter(q =>
      q.question_text &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      typeof q.correct_answer === 'number'
    );

    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}
