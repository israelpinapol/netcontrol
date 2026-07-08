import Dashboard from "@/components/Dashboard";
import { getBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await getBackend().getSnapshot();
  return <Dashboard initial={snapshot} />;
}
