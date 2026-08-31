import { MarginAccessProvider } from "./margin-access-context";

export default function MarginsLayout({ children }: { children: React.ReactNode }) {
  return <MarginAccessProvider>{children}</MarginAccessProvider>;
}
