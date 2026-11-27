import { apiTools, fileKey, toolRecord } from '../../data';
import { data } from '../../../../alternatives/data';

// /api/v1/tools/<key>.json: one tool's facts, each with its quote and source page.
export const dynamic = 'force-static';
export const dynamicParams = false;
export const generateStaticParams = () => apiTools().map((k) => ({ file: `${fileKey(k)}.json` }));

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const d = data();
  const tools = apiTools(d);
  const key = tools.find((k) => `${fileKey(k)}.json` === file)!;
  return Response.json(toolRecord(key, d, tools));
}
