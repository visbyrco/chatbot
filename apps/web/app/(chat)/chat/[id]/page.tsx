import type { Metadata } from "next";
import { auth } from "@/app/(auth)/auth";
import { getChatById } from "@/lib/db/queries";
import { getCanonicalUrl } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return { robots: { follow: false, index: false } };
  }

  const chat = await getChatById({ id });

  if (!chat) {
    return { robots: { follow: false, index: false } };
  }

  if (chat.visibility === "private" && chat.userId !== session.user.id) {
    return { robots: { follow: false, index: false } };
  }

  return {
    alternates: {
      canonical: getCanonicalUrl(`/chat/${chat.id}`),
    },
    description: "A shared conversation in Visbyr Chat.",
    openGraph: {
      title: chat.title,
      url: getCanonicalUrl(`/chat/${chat.id}`),
    },
    robots: {
      follow: true,
      index: false,
    },
    title: chat.title,
  };
}

export default function Page() {
  return null;
}
