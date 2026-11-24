import { NGROK_HEADERS, VM_API_URL } from "@/lib/api";

interface DownloadRouteContext {
  params: Promise<{ filename: string }>;
}

export async function GET(_request: Request, { params }: DownloadRouteContext) {
  if (!VM_API_URL) {
    return Response.json(
      { error: "NEXT_PUBLIC_VM_API_URL is not configured." },
      { status: 500 },
    );
  }

  const { filename } = await params;
  const upstreamUrl = `${VM_API_URL}/api/tests/${encodeURIComponent(filename)}/download`;

  try {
    const upstream = await fetch(upstreamUrl, {
      cache: "no-store",
      headers: NGROK_HEADERS,
    });
    const headers = new Headers();
    for (const name of ["content-type", "content-disposition", "content-length"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }

    if (!upstream.ok) {
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers,
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not reach the VM file server.",
      },
      { status: 502 },
    );
  }
}
