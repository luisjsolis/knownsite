import { indexRecord } from '../data';

// /api/v1/index.json: every category and tool with a JSON file. Written at build (static export).
export const dynamic = 'force-static';

export const GET = () => Response.json(indexRecord());
