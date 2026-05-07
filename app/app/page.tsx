import { redirect } from "next/navigation";
import { CURRENT_PERIOD } from "@/lib/mock";

export default function Home() {
  redirect(`/period/${encodeURIComponent(CURRENT_PERIOD)}`);
}
