export function ListItemNames({ products }: { products: { id: string; name: string }[] }) {
  const names = [...new Map(products.map((p) => [p.id, p.name])).values()].sort((a, b) => a.localeCompare(b));
  if (names.length === 0) return <span className="text-zinc-400">—</span>;
  const shown = names.slice(0, 3);
  const extra = names.length - shown.length;
  return (
    <span className="line-clamp-2" title={names.join(", ")}>
      {shown.join(", ")}
      {extra > 0 ? <span className="text-zinc-500"> +{extra} more</span> : null}
    </span>
  );
}
