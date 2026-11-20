import Link from "next/link";

export function generateStaticParams() {
  return [{ slug: "rebalance" }];
}

export default async function Placeholder({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return (
    <div className="grid place-items-center py-24 text-center">
      <h1 className="text-xl font-normal">{title}</h1>
      <p className="mt-2 text-sm text-mute">This report is not part of the first release.</p>
      <Link href="/portfolio" className="mt-4 text-sm text-brand hover:underline">Back to Home</Link>
    </div>
  );
}
