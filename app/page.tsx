import { ChatScreenLoader } from "@/components/chat/chat-screen-loader";

export default function Home() {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <ChatScreenLoader />
    </main>
  );
}
