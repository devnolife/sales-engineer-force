import { redirect } from "next/navigation";
import { getSession } from "@/lib/org-context";

export default async function Home() {
  const session = await getSession();
  redirect(session ? "/app" : "/masuk");
}
