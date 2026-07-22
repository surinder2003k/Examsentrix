export async function analyzeFrame(imageBase64) {
  const promptText = `You are an AI exam proctor monitoring a student via webcam. Analyze this frame and report ANY suspicious or inappropriate behavior.

Return ONLY JSON:
{
  "status": "focused" | "suspicious" | "violation",
  "confidence": 0.0-1.0,
  "observation": "Brief description of what you see (e.g., 'student looking at phone on desk', 'student turned head left toward notes', 'second person visible behind student', 'student covering camera with hand', 'student using calculator app on phone', 'student reading from paper', 'no face visible - camera blocked', 'student appears to be talking to someone')",
  "severity": "low" | "medium" | "high"
}

Rules:
- "focused" = student clearly looking at screen, no issues
- "suspicious" = minor concerns (brief glance away, slight posture change)  
- "violation" = clear cheating attempt or rule breach (phone visible, notes, other person, camera blocked, etc.)
- confidence: how certain you are (0.5-1.0)
- observation: specific, actionable description for the alert message
- severity: low (gentle reminder), medium (formal warning), high (serious violation)`;

  // Try OpenRouter first
  try {
    console.log('AI Proctor: Trying OpenRouter...');
    const httpReferer = process.env.OPENROUTER_HTTP_REFERER || 'https://proctorexam.app';
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': httpReferer,
        'X-Title': 'ProctorExam AI'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: promptText
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 150
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const parsed = parseAIResponse(content);
      if (parsed) {
        console.log('✅ OpenRouter call successful:', parsed);
        return parsed;
      }
    } else {
      const errText = await response.text();
      console.warn('OpenRouter non-200 response, falling back...', response.status, errText);
    }
  } catch (error) {
    console.warn('OpenRouter connection failed, falling back...', error.message);
  }

  // Fallback to Google Gemini API direct
  try {
    console.log('AI Proctor: Falling back to direct Google Gemini API...');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: promptText
              },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageBase64
                }
              }
            ]
          }
        ]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = parseAIResponse(content);
      if (parsed) {
        console.log('✅ Direct Google Gemini call successful:', parsed);
        return parsed;
      }
    } else {
      const errText = await response.text();
      console.error('Direct Google Gemini failed:', response.status, errText);
    }
  } catch (error) {
    console.error('Direct Google Gemini call connection failed:', error.message);
  }

  // Return default focused state on absolute failure
  return { status: 'focused', confidence: 0.5, observation: 'AI analysis unavailable', severity: 'low' };
}

function parseAIResponse(content) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to parse JSON content from AI response:', content);
    return null;
  }
}