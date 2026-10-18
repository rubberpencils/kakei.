import type { TOOLS } from '../../shared/read.ts';

export type ToolDecl = (typeof TOOLS)[number];

export type Turn = {
  role: 'user' | 'model';
  parts: { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }[];
};

export async function gemini(key: string, history: Turn[], tools: ToolDecl[]): Promise<Turn> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: history,
        tools: [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema })) }],
      }),
    },
  );
  const json = (await res.json()) as { candidates?: { content?: Turn }[] };
  if (!res.ok) throw new Error('The model did not answer');
  return json.candidates?.[0]?.content ?? { role: 'model', parts: [{ text: '' }] };
}
