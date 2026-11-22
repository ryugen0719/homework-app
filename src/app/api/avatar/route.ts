import { get } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

const VALID_AVATAR_PATH = /^avatars\/[a-zA-Z0-9_-]+-\d+\.(jpg|png|webp|gif)$/;
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get('pathname') || '';
  if (!VALID_AVATAR_PATH.test(pathname)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const blob = await get(pathname, { access: 'private' });
    if (
      !blob ||
      blob.statusCode !== 200 ||
      !ALLOWED_CONTENT_TYPES.includes(blob.blob.contentType)
    ) {
      return new NextResponse('Not found', { status: 404 });
    }

    return new NextResponse(blob.stream, {
      status: 200,
      headers: {
        'Content-Type': blob.blob.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
