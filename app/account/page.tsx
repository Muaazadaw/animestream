import { redirect } from "next/navigation";

// The account page moved into Settings.
export default function AccountPage() {
  redirect("/settings#account");
}
