'use client';

import { useEffect } from 'react';

/** Crisp live chat, loaded only when NEXT_PUBLIC_CRISP_ID is set at build time. */
export default function LiveChat({ id }: { id: string }) {
  useEffect(() => {
    if (!id || (window as unknown as { $crisp?: unknown }).$crisp) return;
    const w = window as unknown as { $crisp: unknown[]; CRISP_WEBSITE_ID: string };
    w.$crisp = [];
    w.CRISP_WEBSITE_ID = id;
    const s = document.createElement('script');
    s.src = 'https://client.crisp.chat/l.js';
    s.async = true;
    document.head.appendChild(s);
  }, [id]);
  return null;
}
