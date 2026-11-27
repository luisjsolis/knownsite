import { apiCategories, categoryRecord } from '../../data';

// /api/v1/categories/<slug>.json: a category's comparison fields and its tools.
export const dynamic = 'force-static';
export const dynamicParams = false;
export const generateStaticParams = () => apiCategories().map((s) => ({ file: `${s}.json` }));

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  return Response.json(categoryRecord(file.replace(/\.json$/, '')));
}
